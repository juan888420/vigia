// Aritmética de fechas para el motor de reglas.
//
// Todas las columnas de fecha del schema son @db.Date y Prisma las devuelve
// como Date a medianoche UTC. Operar en UTC mantiene esa invariante: sumar
// días en hora local desplazaría el día en cualquier zona distinta de UTC.

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Medianoche UTC del día que representa `value`. */
export function startOfUtcDay(value: Date): Date {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

/** Días calendario. Negativo si `days` lo es. */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

/** Días calendario de `from` a `to`. Positivo si `to` es posterior. */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);
}

/** "2025-08-27". El mismo formato que devuelve el resto del API. */
export function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
