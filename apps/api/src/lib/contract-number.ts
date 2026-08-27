/**
 * Canonical form of a contract number, used for the per-office uniqueness
 * constraint and for lookups. The written form is always preserved in
 * `Contract.number`; this is only the search/uniqueness anchor.
 *
 * Real data comes in as "CD-011-2025", "CD013-2026" and "CD-004A-2024": the
 * same contract can be typed with or without separators. Uppercasing and
 * dropping every non-alphanumeric character collapses those variants.
 *
 *   "CD-001-2025"  → "CD0012025"
 *   "cd 001/2025"  → "CD0012025"
 *   "CD-004A-2024" → "CD004A2024"
 *
 * Known limit: it does not pad the sequential number, so "CD-1-2025" and
 * "CD-001-2025" stay distinct. Padding would require parsing the number into
 * prefix/sequence/year, which the real data does not support reliably yet.
 */
export function normalizeContractNumber(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}
