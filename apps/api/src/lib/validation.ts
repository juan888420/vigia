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
 * No admite negativos: ninguno de estos montos puede serlo — ni el valor de un
 * contrato, ni un anticipo, ni un pago, ni el valor asegurado de una póliza.
 * Son valores absolutos: un pago negativo no significa nada.
 */
export const money = {
  type: ["string", "number"],
  pattern: "^\\d{1,13}(\\.\\d{1,2})?$",
} as const;

export const nullableMoney = { ...money, type: ["string", "number", "null"] } as const;

/**
 * Dinero con signo. Excepción puntual para `ContractEvent.valueDelta`, que no
 * es un monto sino un DELTA — el mismo tratamiento que ya tiene `daysDelta`.
 *
 * Una modificación puede reducir el valor, no solo aumentarlo: el caso real es
 * el Otrosí 1 de CD-007-2025, que corrige a la baja un error de digitación
 * ($199.996.549 → $199.905.071). Sin signo, esa corrección no se puede
 * registrar sin falsear el valor inicial del contrato y perder el rastro de
 * que un acto administrativo la corrigió.
 *
 * NO se usa en ningún otro campo: ver `money`.
 */
export const signedMoney = {
  type: ["string", "number"],
  pattern: "^-?\\d{1,13}(\\.\\d{1,2})?$",
} as const;

export const nullableSignedMoney = {
  ...signedMoney,
  type: ["string", "number", "null"],
} as const;

/** "2025-03-15" → Date a medianoche UTC, para que una columna @db.Date
 *  conserve el día sin desplazarse por zona horaria. */
export function toDate(value: string | null | undefined): Date | null {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

/**
 * Texto obligatorio que NO puede ser solo espacios en blanco.
 *
 * `minLength: 1` no sirve para esto: el schema valida ANTES de que la ruta
 * aplique `.trim()`, así que `"   "` pasa la validación con 3 caracteres y se
 * guarda como cadena vacía. El resultado era un documento con `storagePath`
 * vacío en una columna que es NOT NULL justamente para impedirlo.
 *
 * El patrón `\S` no está anclado —los patrones de JSON Schema no lo están— así
 * que exige "al menos un carácter que no sea espacio" en cualquier posición,
 * que es la condición correcta: el valor sigue pudiendo llevar espacios dentro
 * ("2. CONTRACTUAL\OTROSI 1" es una ruta real del expediente).
 *
 * Vive aquí y no en cada ruta para que POST /contratos/:id/documentos y
 * POST /contratos/:id/documentos/confirmar escriban la misma columna con la
 * misma regla. El defecto original venía de que cada una declaraba la suya.
 */
export function nonBlankText(maxLength: number) {
  return { type: "string", pattern: "\\S", maxLength } as const;
}
