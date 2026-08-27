import { Prisma } from "@prisma/client";

/**
 * Money is serialized as a string, never as a JSON number: the schema stores
 * Decimal(15,2) and a JSON number is an IEEE double. Rounding a contract value
 * on the way out of the API would be silent and unauditable.
 */
export function decimalToString(value: Prisma.Decimal | null): string | null {
  return value === null ? null : value.toString();
}

/**
 * `@db.Date` columns carry no time. Returning "2025-03-15" instead of a full
 * ISO timestamp keeps the client from shifting the day across time zones.
 */
export function dateOnly(value: Date | null): string | null {
  return value === null ? null : value.toISOString().slice(0, 10);
}
