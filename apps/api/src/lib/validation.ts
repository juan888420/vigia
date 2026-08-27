// Fragmentos de JSON Schema compartidos por todas las rutas. Viven aquí para
// que dinero y fechas se validen igual en cualquier recurso: si el patrón de
// los montos cambia, cambia en un solo sitio.

export const nullableString = { type: ["string", "null"] } as const;

export const nullableDate = { type: ["string", "null"], format: "date" } as const;

/**
 * Dinero. Acepta "45000000.00" o 45000000; Prisma convierte ambos a
 * Decimal(15,2). Máximo 13 enteros y 2 decimales, que es lo que admite la
 * columna. El JSON de salida siempre es string (ver lib/serialize.ts): un
 * number de JSON es un IEEE double y redondearía el valor en silencio.
 *
 * No admite negativos: ninguno de los montos del dominio puede serlo — ni el
 * valor de un contrato, ni un pago, ni el valor asegurado de una póliza. Una
 * adición que resta valor se registra como un evento propio, no como un
 * importe en negativo.
 */
export const money = {
  type: ["string", "number"],
  pattern: "^\\d{1,13}(\\.\\d{1,2})?$",
} as const;

export const nullableMoney = { ...money, type: ["string", "number", "null"] } as const;

/** "2025-03-15" → Date a medianoche UTC, para que una columna @db.Date
 *  conserve el día sin desplazarse por zona horaria. */
export function toDate(value: string | null | undefined): Date | null {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}
