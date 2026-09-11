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

/**
 * El modelo que usan TODAS las llamadas a Claude del proyecto.
 *
 * Vive aquí y no en cada ruta porque el valor estaba repetido en
 * classification.ts y extraction.ts, y dos copias de una constante son dos
 * copias que se desincronizan: clasificar con un modelo y extraer con otro es
 * exactamente el tipo de incoherencia que nadie nota hasta que los resultados
 * no cuadran.
 *
 * Sonnet 5 y no Opus 5: decisión explícita, no un ahorro automático. Las dos
 * tareas son lectura de documentos con salida estructurada y esquema cerrado
 * —no razonamiento abierto—, que es donde Sonnet rinde de sobra. El `effort`
 * sigue siendo el dial de profundidad y se gradúa por ruta: `low` para
 * clasificar, `high` para extraer cifras y fechas.
 */
const DEFAULT_MODEL = "claude-sonnet-5";

/**
 * El modelo efectivo. `ANTHROPIC_MODEL` permite cambiarlo sin volver a
 * desplegar —probar un modelo distinto contra un expediente real es una
 * variable de entorno, no un commit— y la constante de arriba es el valor por
 * defecto cuando no está definida.
 *
 * Un override oculto sería peligroso si no se pudiera saber qué modelo corrió,
 * pero no es el caso: /clasificar y /extraer devuelven `model` en su respuesta,
 * así que el modelo real siempre es visible en el resultado. Se lee en cada
 * llamada y no al importar para que `tsx watch` recoja el cambio al reiniciar.
 */
export function getModel(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
}

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
