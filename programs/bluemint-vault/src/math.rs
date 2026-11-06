//! Integer-only accounting. No reserve/price assumptions or off-chain floating point.
#[derive(Debug, PartialEq, Eq)]
pub enum MathError {
    Zero,
    Overflow,
    InvalidReserve,
}
pub fn dev_split(gross: u64) -> Result<(u64, u64), MathError> {
    if gross < 2 {
        return Err(MathError::Zero);
    }
    let liquidity = gross / 2;
    Ok((liquidity, gross - liquidity))
}
pub fn fee_split(net_received: u64) -> (u64, u64) {
    let treasury = ((net_received as u128) * 40 / 100) as u64;
    (treasury, net_received - treasury)
}
pub fn ceil_mul_div(a: u64, b: u64, d: u64) -> Result<u64, MathError> {
    if d == 0 {
        return Err(MathError::InvalidReserve);
    }
    let n = (a as u128) * (b as u128);
    u64::try_from(n.div_ceil(d as u128)).map_err(|_| MathError::Overflow)
}
pub fn expected_buy(
    input: u64,
    quote: u64,
    token: u64,
    trade_rate: u64,
    creator_rate: u64,
) -> Result<u64, MathError> {
    if input == 0 || quote == 0 || token == 0 {
        return Err(MathError::Zero);
    }
    let fee = ceil_mul_div(input, trade_rate, 1_000_000)?
        .checked_add(ceil_mul_div(input, creator_rate, 1_000_000)?)
        .ok_or(MathError::Overflow)?;
    let net = input.checked_sub(fee).ok_or(MathError::Zero)?;
    if net == 0 {
        return Err(MathError::Zero);
    }
    let denom = (quote as u128) + (net as u128);
    u64::try_from((token as u128) * (net as u128) / denom).map_err(|_| MathError::Overflow)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn split_conserves_every_atomic_unit() {
        for n in [2, 3, 999, 1_000_000, u64::MAX] {
            let (a, b) = dev_split(n).unwrap();
            assert_eq!(a.checked_add(b), Some(n));
            assert!(b - a <= 1);
            let (t, l) = fee_split(n);
            assert_eq!(t.checked_add(l), Some(n));
        }
    }
    #[test]
    fn net_receipts_not_gross_fees() {
        assert_eq!(fee_split(950_000), (380_000, 570_000));
    }
    #[test]
    fn invalid_budgets_and_reserves_fail() {
        assert_eq!(dev_split(1), Err(MathError::Zero));
        assert!(expected_buy(1, 1, 1, 2500, 12500).is_err());
        assert!(expected_buy(100, 0, 100, 2500, 12500).is_err());
    }
    #[test]
    fn output_cannot_exhaust_reserve() {
        for i in [100, 1_000_000, 100_000_000, u64::MAX / 2] {
            let out = expected_buy(i, 50_000_000, 1_000_000_000_000_000, 2500, 12500).unwrap();
            assert!(out < 1_000_000_000_000_000);
        }
    }
}
