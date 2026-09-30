/** Birthday is private account data. Compare calendar dates in UTC so the
 * fourteenth birthday begins on the same date for the UI and server. */
export function isValidBirthdate(value: unknown, today = new Date()): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return year >= 1900 && parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day &&
    value <= today.toISOString().slice(0, 10);
}

export function isWagerEligible(birthdate: unknown, today = new Date()): boolean {
  if (!isValidBirthdate(birthdate, today)) return false;
  const cutoff = new Date(Date.UTC(today.getUTCFullYear() - 14, today.getUTCMonth(), today.getUTCDate()));
  return birthdate <= cutoff.toISOString().slice(0, 10);
}
