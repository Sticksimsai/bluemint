use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    instruction::{AccountMeta, Instruction},
    program::invoke_signed,
};
use anchor_spl::{
    associated_token::{get_associated_token_address, AssociatedToken},
    token::{self, Mint, Token, TokenAccount, Transfer},
};
use solana_sha256_hasher::hash;
pub mod math;
pub mod oracle;
declare_id!("9YKKi1RQgT8uco9Cecj849btWboxQ2qxYA4GXmYGHLkE");
const USDC: Pubkey = pubkey!("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const TREASURY: Pubkey = pubkey!("85a8ERAhk1ZPYyGwj4zkjVKZdfqaEUcSpTt9GCz5xA7j");
const CPMM: Pubkey = pubkey!("CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C");
const CP_CONFIG: Pubkey = pubkey!("627Jx6eN61TrdgMFSQt1QxvAmYWHXmzVA8M9FsKFtdkX");
const POOL_FEE: Pubkey = pubkey!("DNXgeM9EiiaAbaWvwjHj9fQQLAX5ZsfHyvmYUNRAdNC8");
const TOKEN_2022: Pubkey = pubkey!("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

// No withdrawal, arbitrary CPI, treasury redirection, or LP transfer instruction exists.
// Mainnet activation additionally requires SBF integration qualification and deployment.
#[program]
pub mod bluemint_vault {
    use super::*;
    pub fn create_launch<'info>(
        ctx: Context<'_, '_, '_, 'info, CreateLaunch<'info>>,
        budget: u64,
        sol_funding: u64,
    ) -> Result<()> {
        require!(budget >= 2 && budget <= 1_000_000_000_000, Fault::Amount);
        require!(sol_funding <= 1_000_000_000, Fault::Amount);
        require!(
            ctx.accounts.mint.supply > 0
                && ctx.accounts.mint.decimals == 6
                && ctx.accounts.mint.mint_authority.is_none()
                && ctx.accounts.mint.freeze_authority.is_none(),
            Fault::Mint
        );
        require!(
            ctx.accounts.owner_tokens.amount == ctx.accounts.mint.supply,
            Fault::Mint
        );
        require!(
            ctx.accounts.token_vault.amount == 0 && ctx.accounts.quote_vault.amount == 0,
            Fault::Balance
        );
        let mint = ctx.accounts.mint.key();
        let authority = ctx.accounts.authority.key();
        let r = ctx.remaining_accounts;
        let keys = validate_remaining(r, mint, authority)?;
        validate_config(&r[0])?;
        require!(r[2].data_is_empty(), Fault::Pool);
        let (seed, buy) = math::dev_split(budget).map_err(|_| Fault::Amount)?;
        let expected = math::expected_buy(buy, seed, ctx.accounts.mint.supply, 2500, 12500)
            .map_err(|_| Fault::Amount)?;
        require!(expected > 0, Fault::Amount);
        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.owner.to_account_info(),
                    to: ctx.accounts.authority.to_account_info(),
                },
            ),
            sol_funding,
        )?;
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.owner_tokens.to_account_info(),
                    to: ctx.accounts.token_vault.to_account_info(),
                    authority: ctx.accounts.owner.to_account_info(),
                },
            ),
            ctx.accounts.mint.supply,
        )?;
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.owner_quote.to_account_info(),
                    to: ctx.accounts.quote_vault.to_account_info(),
                    authority: ctx.accounts.owner.to_account_info(),
                },
            ),
            budget,
        )?;
        let (v0, v1) = if keys.quote_first {
            (
                ctx.accounts.quote_vault.to_account_info(),
                ctx.accounts.token_vault.to_account_info(),
            )
        } else {
            (
                ctx.accounts.token_vault.to_account_info(),
                ctx.accounts.quote_vault.to_account_info(),
            )
        };
        let accounts = vec![
            ctx.accounts.authority.to_account_info(),
            r[0].clone(),
            r[1].clone(),
            r[2].clone(),
            r[3].clone(),
            r[4].clone(),
            r[5].clone(),
            v0,
            v1,
            ctx.accounts.lp_vault.to_account_info(),
            r[6].clone(),
            r[7].clone(),
            r[9].clone(),
            r[8].clone(),
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.associated_token_program.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ];
        require_keys_eq!(
            ctx.accounts.lp_vault.key(),
            get_associated_token_address(&authority, &keys.lp_mint),
            Fault::Account
        );
        let (a, b) = if keys.quote_first {
            (seed, ctx.accounts.mint.supply)
        } else {
            (ctx.accounts.mint.supply, seed)
        };
        let mut args = words(&[a, b, 0]);
        args.extend_from_slice(&[1, if keys.quote_first { 1 } else { 2 }]);
        let bump = [ctx.bumps.authority];
        let seeds: &[&[u8]] = &[b"authority", mint.as_ref(), &bump];
        cp(
            &ctx.accounts.cpmm_program.to_account_info(),
            &accounts,
            &[0],
            &[0, 3, 6, 7, 8, 9, 10, 11, 12, 13],
            "initialize_v2",
            args,
            seeds,
        )?;
        validate_pool(&r[2], &keys, authority)?;
        ctx.accounts.quote_vault.reload()?;
        ctx.accounts.token_vault.reload()?;
        require!(
            ctx.accounts.quote_vault.amount == buy && ctx.accounts.token_vault.amount == 0,
            Fault::Balance
        );
        let state = &mut ctx.accounts.launch;
        state.owner = ctx.accounts.owner.key();
        state.mint = mint;
        state.pool = keys.pool;
        state.authority_bump = ctx.bumps.authority;
        state.pending_buy = buy;
        state.minimum_buy_out = (expected as u128 * 9900 / 10000) as u64;
        state.buy_deadline = Clock::get()?.unix_timestamp + 900;
        state.ready = false;
        state.initial_liquidity_quote = seed;
        emit!(LaunchCreated {
            mint,
            pool: keys.pool,
            owner: state.owner,
            seed_quote: seed,
            buy_quote: buy
        });
        Ok(())
    }
    pub fn finish_buy<'info>(ctx: Context<'_, '_, '_, 'info, LaunchAction<'info>>) -> Result<()> {
        require!(
            !ctx.accounts.launch.ready && ctx.accounts.launch.pending_buy > 0,
            Fault::Phase
        );
        require!(
            Clock::get()?.unix_timestamp <= ctx.accounts.launch.buy_deadline,
            Fault::Expired
        );
        let keys = action_keys(&ctx)?;
        let amount = ctx.accounts.launch.pending_buy;
        let minimum = ctx.accounts.launch.minimum_buy_out;
        let before = ctx.accounts.token_vault.amount;
        swap(&ctx, &keys, amount, minimum)?;
        ctx.accounts.token_vault.reload()?;
        ctx.accounts.quote_vault.reload()?;
        let received = ctx
            .accounts
            .token_vault
            .amount
            .checked_sub(before)
            .ok_or(Fault::Balance)?;
        require!(received >= minimum, Fault::Slippage);
        send(
            &ctx.accounts.token_program,
            &ctx.accounts.token_vault,
            &ctx.accounts.owner_tokens,
            &ctx.accounts.authority,
            &ctx.accounts.launch,
            received,
        )?;
        ctx.accounts.launch.pending_buy = 0;
        ctx.accounts.launch.ready = true;
        emit!(DeveloperBuy {
            mint: ctx.accounts.launch.mint,
            quote: amount,
            tokens: received
        });
        Ok(())
    }
    pub fn refund_expired_buy(ctx: Context<LaunchAction>) -> Result<()> {
        require_keys_eq!(
            ctx.accounts.payer.key(),
            ctx.accounts.launch.owner,
            Fault::Owner
        );
        require!(
            !ctx.accounts.launch.ready
                && Clock::get()?.unix_timestamp > ctx.accounts.launch.buy_deadline,
            Fault::Phase
        );
        let refund = ctx.accounts.launch.pending_buy;
        require!(refund > 0, Fault::Phase);
        send(
            &ctx.accounts.token_program,
            &ctx.accounts.quote_vault,
            &ctx.accounts.owner_quote,
            &ctx.accounts.authority,
            &ctx.accounts.launch,
            refund,
        )?;
        ctx.accounts.launch.pending_buy = 0;
        ctx.accounts.launch.ready = true;
        ctx.accounts.launch.buy_refunded = true;
        emit!(DeveloperBuyRefunded {
            mint: ctx.accounts.launch.mint,
            quote: refund
        });
        Ok(())
    }
    pub fn collect_fees<'info>(ctx: Context<'_, '_, '_, 'info, LaunchAction<'info>>) -> Result<()> {
        require!(ctx.accounts.launch.ready, Fault::Phase);
        let keys = action_keys(&ctx)?;
        let r = ctx.remaining_accounts;
        let before = ctx.accounts.quote_vault.amount;
        let (v0, v1) = if keys.quote_first {
            (
                ctx.accounts.quote_vault.to_account_info(),
                ctx.accounts.token_vault.to_account_info(),
            )
        } else {
            (
                ctx.accounts.token_vault.to_account_info(),
                ctx.accounts.quote_vault.to_account_info(),
            )
        };
        let accounts = vec![
            ctx.accounts.payer.to_account_info(),
            ctx.accounts.authority.to_account_info(),
            r[1].clone(),
            r[2].clone(),
            r[6].clone(),
            r[7].clone(),
            r[3].clone(),
            r[4].clone(),
            v0,
            v1,
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.associated_token_program.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
            r[0].clone(),
            r[11].clone(),
        ];
        let bump = [ctx.accounts.launch.authority_bump];
        let seeds: &[&[u8]] = &[b"authority", ctx.accounts.launch.mint.as_ref(), &bump];
        cp(
            &ctx.accounts.cpmm_program.to_account_info(),
            &accounts,
            &[0],
            &[0, 3, 4, 5, 8, 9],
            "collect_creator_fee_permissionless",
            vec![],
            seeds,
        )?;
        ctx.accounts.quote_vault.reload()?;
        let received = ctx
            .accounts
            .quote_vault
            .amount
            .checked_sub(before)
            .ok_or(Fault::Balance)?;
        let (treasury, liquidity) = math::fee_split(received);
        send(
            &ctx.accounts.token_program,
            &ctx.accounts.quote_vault,
            &ctx.accounts.treasury_quote,
            &ctx.accounts.authority,
            &ctx.accounts.launch,
            treasury,
        )?;
        let state = &mut ctx.accounts.launch;
        state.pending_quote = state
            .pending_quote
            .checked_add(liquidity)
            .ok_or(Fault::Amount)?;
        state.net_fees = state.net_fees.checked_add(received).ok_or(Fault::Amount)?;
        state.treasury_paid = state
            .treasury_paid
            .checked_add(treasury)
            .ok_or(Fault::Amount)?;
        emit!(FeesCollected {
            mint: state.mint,
            net_quote: received,
            treasury_quote: treasury,
            liquidity_quote: liquidity
        });
        Ok(())
    }
    pub fn reinvest<'info>(ctx: Context<'_, '_, '_, 'info, LaunchAction<'info>>) -> Result<()> {
        require!(ctx.accounts.launch.ready, Fault::Phase);
        let keys = action_keys(&ctx)?;
        let r = ctx.remaining_accounts;
        require_keys_eq!(
            ctx.accounts.lp_vault.key(),
            get_associated_token_address(&ctx.accounts.authority.key(), &keys.lp_mint),
            Fault::Account
        );
        require_keys_eq!(*r[8].owner, CPMM, Fault::Account);
        let (quote, tokens, _) = reserves(r, &keys)?;
        {
            let data = r[8].try_borrow_data()?;
            require!(
                data.len() >= 4075
                    && data[..8] == discriminator("account:ObservationState")
                    && data[11..43] == keys.pool.to_bytes(),
                Fault::Account
            );
            let twap = oracle::price(&data, Clock::get()?.unix_timestamp as u64, keys.quote_first)
                .map_err(|_| Fault::Oracle)?;
            oracle::check_spot(twap, quote, tokens).map_err(|_| Fault::Oracle)?;
        }
        // Limit a batch to 0.1% of quote reserves. Caller cannot choose slippage.
        let budget = ctx.accounts.launch.pending_quote.min(quote / 1000);
        require!(budget >= 100, Fault::Amount);
        let buy = budget / 2;
        let expected =
            math::expected_buy(buy, quote, tokens, 2500, 12500).map_err(|_| Fault::Amount)?;
        let minimum = (expected as u128 * 9950 / 10000) as u64;
        require!(minimum > 0, Fault::Amount);
        let quote_before = ctx.accounts.quote_vault.amount;
        swap(&ctx, &keys, buy, minimum)?;
        ctx.accounts.quote_vault.reload()?;
        ctx.accounts.token_vault.reload()?;
        let (q, t, lp_supply) = reserves(r, &keys)?;
        let available_quote = budget - buy;
        let shares_q = (available_quote as u128) * (lp_supply as u128) / (q as u128);
        let shares_t =
            (ctx.accounts.token_vault.amount as u128) * (lp_supply as u128) / (t as u128);
        let shares = u64::try_from(shares_q.min(shares_t)).map_err(|_| Fault::Amount)?;
        require!(shares > 0, Fault::Amount);
        let (v0, v1, max0, max1) = if keys.quote_first {
            (
                ctx.accounts.quote_vault.to_account_info(),
                ctx.accounts.token_vault.to_account_info(),
                available_quote,
                ctx.accounts.token_vault.amount,
            )
        } else {
            (
                ctx.accounts.token_vault.to_account_info(),
                ctx.accounts.quote_vault.to_account_info(),
                ctx.accounts.token_vault.amount,
                available_quote,
            )
        };
        let accounts = vec![
            ctx.accounts.authority.to_account_info(),
            r[1].clone(),
            r[2].clone(),
            ctx.accounts.lp_vault.to_account_info(),
            v0,
            v1,
            r[6].clone(),
            r[7].clone(),
            ctx.accounts.token_program.to_account_info(),
            r[10].clone(),
            r[3].clone(),
            r[4].clone(),
            r[5].clone(),
        ];
        let bump = [ctx.accounts.launch.authority_bump];
        let seeds: &[&[u8]] = &[b"authority", ctx.accounts.launch.mint.as_ref(), &bump];
        cp(
            &ctx.accounts.cpmm_program.to_account_info(),
            &accounts,
            &[0],
            &[2, 3, 4, 5, 6, 7, 12],
            "deposit",
            words(&[shares, max0, max1]),
            seeds,
        )?;
        ctx.accounts.quote_vault.reload()?;
        let spent = quote_before
            .checked_sub(ctx.accounts.quote_vault.amount)
            .ok_or(Fault::Balance)?;
        require!(spent <= budget, Fault::Balance);
        let state = &mut ctx.accounts.launch;
        state.pending_quote = state
            .pending_quote
            .checked_sub(spent)
            .ok_or(Fault::Balance)?;
        state.reinvested_quote = state
            .reinvested_quote
            .checked_add(spent)
            .ok_or(Fault::Amount)?;
        emit!(LiquidityAdded {
            mint: state.mint,
            quote_spent: spent,
            lp_minted: shares
        });
        Ok(())
    }
}

#[derive(Accounts)]
pub struct CreateLaunch<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(init,payer=owner,space=8+LaunchVault::INIT_SPACE,seeds=[b"launch",mint.key().as_ref()],bump)]
    pub launch: Account<'info, LaunchVault>,
    pub mint: Box<Account<'info, Mint>>,
    #[account(address=USDC)]
    pub quote_mint: Box<Account<'info, Mint>>,
    #[account(mut,seeds=[b"authority",mint.key().as_ref()],bump)]
    pub authority: SystemAccount<'info>,
    #[account(mut,associated_token::mint=mint,associated_token::authority=owner)]
    pub owner_tokens: Box<Account<'info, TokenAccount>>,
    #[account(mut,associated_token::mint=quote_mint,associated_token::authority=owner)]
    pub owner_quote: Box<Account<'info, TokenAccount>>,
    #[account(init_if_needed,payer=owner,associated_token::mint=mint,associated_token::authority=authority)]
    pub token_vault: Box<Account<'info, TokenAccount>>,
    #[account(init_if_needed,payer=owner,associated_token::mint=quote_mint,associated_token::authority=authority)]
    pub quote_vault: Box<Account<'info, TokenAccount>>,
    /// CHECK: derived ATA validated before CPI; CPMM initializes this account.
    #[account(mut)]
    pub lp_vault: UncheckedAccount<'info>,
    /// CHECK: fixed official Raydium program, executable.
    #[account(address=CPMM,executable)]
    pub cpmm_program: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}
#[derive(Accounts)]
pub struct LaunchAction<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut,seeds=[b"launch",launch.mint.as_ref()],bump)]
    pub launch: Account<'info, LaunchVault>,
    #[account(address=launch.mint)]
    pub mint: Box<Account<'info, Mint>>,
    #[account(address=USDC)]
    pub quote_mint: Box<Account<'info, Mint>>,
    #[account(mut,seeds=[b"authority",launch.mint.as_ref()],bump=launch.authority_bump)]
    pub authority: SystemAccount<'info>,
    #[account(mut,token::mint=mint,token::authority=launch.owner)]
    pub owner_tokens: Box<Account<'info, TokenAccount>>,
    #[account(mut,token::mint=quote_mint,token::authority=launch.owner)]
    pub owner_quote: Box<Account<'info, TokenAccount>>,
    #[account(mut,associated_token::mint=mint,associated_token::authority=authority)]
    pub token_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut,associated_token::mint=quote_mint,associated_token::authority=authority)]
    pub quote_vault: Box<Account<'info, TokenAccount>>,
    /// CHECK: canonical PDA LP ATA is validated before deposit.
    #[account(mut)]
    pub lp_vault: UncheckedAccount<'info>,
    #[account(mut,token::mint=quote_mint,token::authority=TREASURY)]
    pub treasury_quote: Box<Account<'info, TokenAccount>>,
    /// CHECK: fixed official program.
    #[account(address=CPMM,executable)]
    pub cpmm_program: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}
#[account]
#[derive(InitSpace)]
pub struct LaunchVault {
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub pool: Pubkey,
    pub authority_bump: u8,
    pub ready: bool,
    pub buy_refunded: bool,
    pub pending_buy: u64,
    pub minimum_buy_out: u64,
    pub buy_deadline: i64,
    pub initial_liquidity_quote: u64,
    pub pending_quote: u64,
    pub net_fees: u64,
    pub treasury_paid: u64,
    pub reinvested_quote: u64,
}
struct PoolKeys {
    pool: Pubkey,
    lp_mint: Pubkey,
    mint0: Pubkey,
    mint1: Pubkey,
    vault0: Pubkey,
    vault1: Pubkey,
    quote_first: bool,
}
fn pda(seeds: &[&[u8]]) -> Pubkey {
    Pubkey::find_program_address(seeds, &CPMM).0
}
fn validate_remaining(r: &[AccountInfo], mint: Pubkey, creator: Pubkey) -> Result<PoolKeys> {
    require!(r.len() == 12, Fault::Account);
    let (m0, m1) = if mint < USDC {
        (mint, USDC)
    } else {
        (USDC, mint)
    };
    let pool = pda(&[b"pool", CP_CONFIG.as_ref(), m0.as_ref(), m1.as_ref()]);
    let lp = pda(&[b"pool_lp_mint", pool.as_ref()]);
    let v0 = pda(&[b"pool_vault", pool.as_ref(), m0.as_ref()]);
    let v1 = pda(&[b"pool_vault", pool.as_ref(), m1.as_ref()]);
    let expected = [
        CP_CONFIG,
        pda(&[b"vault_and_lp_mint_auth_seed"]),
        pool,
        m0,
        m1,
        lp,
        v0,
        v1,
        pda(&[b"observation", pool.as_ref()]),
        POOL_FEE,
        TOKEN_2022,
        pda(&[b"creator_fee_share", creator.as_ref(), CP_CONFIG.as_ref()]),
    ];
    for (i, key) in expected.iter().enumerate() {
        require_keys_eq!(r[i].key(), *key, Fault::Account)
    }
    Ok(PoolKeys {
        pool,
        lp_mint: lp,
        mint0: m0,
        mint1: m1,
        vault0: v0,
        vault1: v1,
        quote_first: m0 == USDC,
    })
}
fn discriminator(name: &str) -> [u8; 8] {
    hash(name.as_bytes()).to_bytes()[..8].try_into().unwrap()
}
fn read_u64(data: &[u8], offset: usize) -> Result<u64> {
    Ok(u64::from_le_bytes(
        data.get(offset..offset + 8)
            .ok_or(Fault::Account)?
            .try_into()
            .map_err(|_| Fault::Account)?,
    ))
}
fn validate_config(info: &AccountInfo) -> Result<()> {
    require_keys_eq!(*info.owner, CPMM, Fault::Account);
    let d = info.try_borrow_data()?;
    require!(
        d.len() >= 124 && d[..8] == discriminator("account:AmmConfig") && d[9] == 0,
        Fault::Config
    );
    require!(
        read_u64(&d, 12)? == 2500 && read_u64(&d, 108)? == 12500,
        Fault::Config
    );
    Ok(())
}
fn validate_pool(info: &AccountInfo, keys: &PoolKeys, creator: Pubkey) -> Result<()> {
    require_keys_eq!(*info.owner, CPMM, Fault::Pool);
    let d = info.try_borrow_data()?;
    require!(
        d.len() >= 413 && d[..8] == discriminator("account:PoolState"),
        Fault::Pool
    );
    for (offset, key) in [
        (8, CP_CONFIG),
        (40, creator),
        (72, keys.vault0),
        (104, keys.vault1),
        (136, keys.lp_mint),
        (168, keys.mint0),
        (200, keys.mint1),
    ] {
        require!(d[offset..offset + 32] == key.to_bytes(), Fault::Pool)
    }
    require!(
        d[390] == 1 && d[389] == if keys.quote_first { 1 } else { 2 },
        Fault::Config
    );
    Ok(())
}
fn action_keys(ctx: &Context<LaunchAction>) -> Result<PoolKeys> {
    let keys = validate_remaining(
        ctx.remaining_accounts,
        ctx.accounts.launch.mint,
        ctx.accounts.authority.key(),
    )?;
    require_keys_eq!(keys.pool, ctx.accounts.launch.pool, Fault::Pool);
    validate_config(&ctx.remaining_accounts[0])?;
    validate_pool(
        &ctx.remaining_accounts[2],
        &keys,
        ctx.accounts.authority.key(),
    )?;
    Ok(keys)
}
fn reserves(r: &[AccountInfo], keys: &PoolKeys) -> Result<(u64, u64, u64)> {
    let p = r[2].try_borrow_data()?;
    let v0 = r[6].try_borrow_data()?;
    let v1 = r[7].try_borrow_data()?;
    require_keys_eq!(*r[6].owner, token::ID, Fault::Account);
    require_keys_eq!(*r[7].owner, token::ID, Fault::Account);
    let net = |raw: u64, offsets: [usize; 3]| -> Result<u64> {
        let mut n = raw;
        for o in offsets {
            n = n.checked_sub(read_u64(&p, o)?).ok_or(Fault::Balance)?;
        }
        Ok(n)
    };
    let a = net(read_u64(&v0, 64)?, [341, 357, 397])?;
    let b = net(read_u64(&v1, 64)?, [349, 365, 405])?;
    let lp = read_u64(&p, 333)?;
    require!(a > 0 && b > 0 && lp > 0, Fault::Balance);
    Ok(if keys.quote_first {
        (a, b, lp)
    } else {
        (b, a, lp)
    })
}
fn words(values: &[u64]) -> Vec<u8> {
    values.iter().flat_map(|v| v.to_le_bytes()).collect()
}
fn cp<'info>(
    program: &AccountInfo<'info>,
    accounts: &[AccountInfo<'info>],
    signers: &[usize],
    writable: &[usize],
    name: &str,
    args: Vec<u8>,
    seeds: &[&[u8]],
) -> Result<()> {
    require_keys_eq!(program.key(), CPMM, Fault::Account);
    let mut data = discriminator(&format!("global:{name}")).to_vec();
    data.extend_from_slice(&args);
    let metas = accounts
        .iter()
        .enumerate()
        .map(|(i, a)| {
            if writable.contains(&i) {
                AccountMeta::new(a.key(), signers.contains(&i))
            } else {
                AccountMeta::new_readonly(a.key(), signers.contains(&i))
            }
        })
        .collect();
    let ix = Instruction {
        program_id: CPMM,
        accounts: metas,
        data,
    };
    let mut infos = accounts.to_vec();
    infos.push(program.clone());
    invoke_signed(&ix, &infos, &[seeds])?;
    Ok(())
}
fn send<'info>(
    program: &Program<'info, Token>,
    from: &Account<'info, TokenAccount>,
    to: &Account<'info, TokenAccount>,
    authority: &SystemAccount<'info>,
    state: &LaunchVault,
    amount: u64,
) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    let bump = [state.authority_bump];
    let seeds: &[&[u8]] = &[b"authority", state.mint.as_ref(), &bump];
    token::transfer(
        CpiContext::new_with_signer(
            program.to_account_info(),
            Transfer {
                from: from.to_account_info(),
                to: to.to_account_info(),
                authority: authority.to_account_info(),
            },
            &[seeds],
        ),
        amount,
    )
}
fn swap<'info>(
    ctx: &Context<'_, '_, '_, 'info, LaunchAction<'info>>,
    keys: &PoolKeys,
    amount: u64,
    minimum: u64,
) -> Result<()> {
    let r = ctx.remaining_accounts;
    let (q, t) = if keys.quote_first { (6, 7) } else { (7, 6) };
    let accounts = vec![
        ctx.accounts.authority.to_account_info(),
        r[1].clone(),
        r[0].clone(),
        r[2].clone(),
        ctx.accounts.quote_vault.to_account_info(),
        ctx.accounts.token_vault.to_account_info(),
        r[q].clone(),
        r[t].clone(),
        ctx.accounts.token_program.to_account_info(),
        ctx.accounts.token_program.to_account_info(),
        ctx.accounts.quote_mint.to_account_info(),
        ctx.accounts.mint.to_account_info(),
        r[8].clone(),
    ];
    let bump = [ctx.accounts.launch.authority_bump];
    let seeds: &[&[u8]] = &[b"authority", ctx.accounts.launch.mint.as_ref(), &bump];
    cp(
        &ctx.accounts.cpmm_program.to_account_info(),
        &accounts,
        &[0],
        &[3, 4, 5, 6, 7, 12],
        "swap_base_input",
        words(&[amount, minimum]),
        seeds,
    )
}
#[event]
pub struct LaunchCreated {
    pub mint: Pubkey,
    pub pool: Pubkey,
    pub owner: Pubkey,
    pub seed_quote: u64,
    pub buy_quote: u64,
}
#[event]
pub struct DeveloperBuy {
    pub mint: Pubkey,
    pub quote: u64,
    pub tokens: u64,
}
#[event]
pub struct DeveloperBuyRefunded {
    pub mint: Pubkey,
    pub quote: u64,
}
#[event]
pub struct LiquidityAdded {
    pub mint: Pubkey,
    pub quote_spent: u64,
    pub lp_minted: u64,
}
#[event]
pub struct FeesCollected {
    pub mint: Pubkey,
    pub net_quote: u64,
    pub treasury_quote: u64,
    pub liquidity_quote: u64,
}
#[error_code]
pub enum Fault {
    #[msg("Invalid amount")]
    Amount,
    #[msg("Invalid mint or supply")]
    Mint,
    #[msg("Unexpected token balance")]
    Balance,
    #[msg("Wrong account or program")]
    Account,
    #[msg("Unsupported CPMM fee configuration")]
    Config,
    #[msg("Pool verification failed")]
    Pool,
    #[msg("Wrong launch phase")]
    Phase,
    #[msg("Initial buy expired")]
    Expired,
    #[msg("Slippage bound not met")]
    Slippage,
    #[msg("Owner signature required")]
    Owner,
    #[msg("Fresh price history and bounded spot deviation required")]
    Oracle,
}
