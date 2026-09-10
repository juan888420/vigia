import Anthropic from "@anthropic-ai/sdk";

// Cliente de la API de Claude.
//
// Singleton por la misma razón que el de Prisma: `tsx watch` recarga los
// módulos en cada guardado y crearía un cliente nuevo (con su propio pool de
// conexiones HTTP) en cada uno.
//
// La clave NUNCA se escribe en el código. Sale de ANTHROPIC_API_KEY, que se
// carga por el mismo mecanismo que DATABASE_URL: el `--env-file` de los
// scripts `dev` y `start` de este workspace, apuntando a
// packages/database/.env.

const globalForAnthropic = globalThis as unknown as { anthropic?: Anthropic };

/** Falta la clave = el endpoint de clasificación no puede funcionar. Se
 *  comprueba al usarlo, no al arrancar: el resto del API no depende de la IA y
 *  no tiene por qué dejar de levantar por esto. */
export function isAnthropicConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function getAnthropicClient(): Anthropic {
  const client = globalForAnthropic.anthropic ?? new Anthropic();
  if (process.env.NODE_ENV !== "production") {
    globalForAnthropic.anthropic = client;
  }
  return client;
}
