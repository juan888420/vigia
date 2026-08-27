import { Prisma } from "@prisma/client";

/**
 * Traduce los errores conocidos de Prisma a respuestas HTTP. Devuelve null
 * cuando el error no es uno de los esperados, para que suba y quede en el log
 * en vez de convertirse en un 400 genérico que oculte un fallo real.
 *
 * Los mensajes se pueden afinar por recurso: quien llama sabe si el conflicto
 * es "ya existe ese número de contrato" o "ya existe ese pago".
 */
export interface PrismaErrorMessages {
  /** P2002 — violación de restricción única. */
  conflict?: string;
  /** P2003 — FK inexistente. */
  foreignKey?: string;
  /** P2025 — update/delete sobre un id que no existe. */
  notFound?: string;
}

export function prismaErrorResponse(
  error: unknown,
  messages: PrismaErrorMessages = {},
): { status: number; body: object } | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return null;

  switch (error.code) {
    case "P2002":
      return {
        status: 409,
        body: { error: messages.conflict ?? "El registro ya existe" },
      };
    case "P2003":
      return {
        status: 400,
        body: { error: messages.foreignKey ?? "Una de las referencias no existe" },
      };
    case "P2025":
      return { status: 404, body: { error: messages.notFound ?? "Registro no encontrado" } };
    default:
      return null;
  }
}
