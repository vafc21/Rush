/**
 * Format an internal cents value as a points string.
 * Values keep the same magnitude as the old dollar display (10000 cents
 * = 100 points), but trailing zeros are trimmed so whole amounts read
 * clean and fractional ones still show:
 *
 *   100000 -> "1,000"
 *     5125 -> "51.25"
 *       50 -> "0.5"
 *      100 -> "1"
 */
export function pts(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/**
 * Same as {@link pts} but for a value that's already in points/dollars
 * (not cents) — used where the UI computed a number like
 * `betDollars * multiplier` before formatting.
 */
export function ptsFromUnits(units: number): string {
  return units.toLocaleString("en-US", { maximumFractionDigits: 2 });
}
