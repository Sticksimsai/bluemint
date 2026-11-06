//! Strict Raydium observation reader. Ambiguous/stale snapshots fail closed.
use crate::math::MathError;
fn u64_at(d: &[u8], o: usize) -> Result<u64, MathError> {
    Ok(u64::from_le_bytes(
        d.get(o..o + 8)
            .ok_or(MathError::InvalidReserve)?
            .try_into()
            .unwrap(),
    ))
}
fn u128_at(d: &[u8], o: usize) -> Result<u128, MathError> {
    Ok(u128::from_le_bytes(
        d.get(o..o + 16)
            .ok_or(MathError::InvalidReserve)?
            .try_into()
            .unwrap(),
    ))
}
pub fn price(d: &[u8], now: u64, quote_first: bool) -> Result<u128, MathError> {
    if d.len() < 4075 || d[8] != 1 {
        return Err(MathError::InvalidReserve);
    }
    let index = u16::from_le_bytes([d[9], d[10]]) as usize;
    if index >= 100 {
        return Err(MathError::InvalidReserve);
    }
    let current = 43 + index * 40;
    let timestamp = u64_at(d, current)?;
    let last_update = u64_at(d, 4043)?;
    // In-place cumulative updates may be newer than the entry timestamp. Never
    // divide such a cumulative value by the older interval.
    if timestamp != last_update || timestamp > now || now - timestamp > 60 {
        return Err(MathError::InvalidReserve);
    }
    let offset = if quote_first { 8 } else { 24 };
    let end = u128_at(d, current + offset)?;
    let mut selected = None;
    for i in 0..100 {
        let at = 43 + i * 40;
        let t = u64_at(d, at)?;
        if t > 0 && t < timestamp {
            let age = timestamp - t;
            if (900..=1800).contains(&age) && selected.map_or(true, |(old, _)| t < old) {
                selected = Some((t, u128_at(d, at + offset)?));
            }
        }
    }
    let (t, start) = selected.ok_or(MathError::InvalidReserve)?;
    let result = end.wrapping_sub(start) / (timestamp - t) as u128;
    if result == 0 {
        return Err(MathError::InvalidReserve);
    }
    Ok(result)
}
pub fn check_spot(twap: u128, quote: u64, tokens: u64) -> Result<(), MathError> {
    if quote == 0 || tokens == 0 || twap == 0 {
        return Err(MathError::InvalidReserve);
    }
    let spot = ((tokens as u128) << 32) / (quote as u128);
    let deviation = spot
        .abs_diff(twap)
        .checked_mul(10_000)
        .ok_or(MathError::Overflow)?;
    if deviation > twap.checked_mul(300).ok_or(MathError::Overflow)? {
        return Err(MathError::InvalidReserve);
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    fn sample() -> Vec<u8> {
        let mut d = vec![0; 4075];
        d[8] = 1;
        d[9] = 1;
        d[43..51].copy_from_slice(&100u64.to_le_bytes());
        d[83..91].copy_from_slice(&1000u64.to_le_bytes());
        d[91..107].copy_from_slice(&(900u128 << 32).to_le_bytes());
        d[4043..4051].copy_from_slice(&1000u64.to_le_bytes());
        d
    }
    #[test]
    fn fresh_window() {
        assert_eq!(price(&sample(), 1001, true).unwrap(), 1u128 << 32);
    }
    #[test]
    fn stale_and_in_place_updates_rejected() {
        let mut d = sample();
        assert!(price(&d, 1061, true).is_err());
        d[4043..4051].copy_from_slice(&1001u64.to_le_bytes());
        assert!(price(&d, 1001, true).is_err());
    }
    #[test]
    fn spot_bound() {
        assert!(check_spot(1u128 << 32, 1000, 1029).is_ok());
        assert!(check_spot(1u128 << 32, 1000, 1031).is_err());
        assert!(check_spot(1u128 << 32, 0, 1).is_err());
    }
}
