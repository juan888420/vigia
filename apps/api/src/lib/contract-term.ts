// Derivación de `Contract.initialTermDays` a partir de las fechas del contrato.
//
// POR QUÉ ESTE MÓDULO EXISTE Y NO VIVE EN rules/dates.ts
//
// Aquí se cuenta el plazo con conteo INCLUSIVO: el día de inicio es el primer
// día del plazo. `rules/dates.ts` cuenta PLANO, porque el motor de reglas
// desplaza fechas de vencimiento (`daysDelta`), que es otra pregunta. Las dos
// convenciones son correctas para lo que cada una representa y por eso se
// mantienen en módulos separados: juntarlas invita a que alguien tome la
// función equivocada por tener el nombre parecido. Ver el comentario extenso
// de `computeCurrentEndDate` en ../rules/derived.ts y el de `daysBetween` en
// apps/web/lib/contract-form.ts.
//
// La cuenta inclusiva se reimplementa aquí en vez de importarse del formulario:
// `apps/web` es otro workspace y el API no puede depender de él. Son cuatro
// líneas; compartirlas exigiría un paquete nuevo solo para esto.

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Días de plazo entre dos fechas, con conteo INCLUSIVO.
 *
 * Réplica exacta de `daysBetween` en apps/web/lib/contract-form.ts, incluido su
 * caso límite: terminación igual al inicio vale 1 día, y terminación anterior
 * al inicio devuelve null (no hay plazo que contar). Del 2025-03-21 al
 * 2025-09-20 son 183 de diferencia + 1 = 184 días.
 *
 * Ambas fechas llegan ancladas a medianoche UTC desde columnas @db.Date, así
 * que la división es exacta.
 */
function inclusiveTermDays(start: Date, end: Date): number | null {
  const difference = Math.round((end.getTime() - start.getTime()) / MS_PER_DAY);
  return difference >= 0 ? difference + 1 : null;
}

export interface TermDaysInput {
  /** Fecha EFECTIVA tras fusionar el body con lo ya guardado (null si no hay). */
  startDate: Date | null;
  /** Fecha EFECTIVA tras fusionar el body con lo ya guardado (null si no hay). */
  initialEndDate: Date | null;
  /** Lo que trae el body. `undefined` = la clave no se envió. */
  initialTermDays: number | null | undefined;
}

/** Result en vez de excepción: el conflicto es un 400 del cliente, no un fallo
 *  del servidor, y así la ruta lo traduce sin try/catch. */
export type TermDaysResult =
  | { ok: true; value: number | null }
  | { ok: false; error: string };

/**
 * Decide qué `initialTermDays` se escribe. Único punto de verdad: lo llaman
 * tanto POST como PATCH de /contratos, con las fechas ya resueltas.
 *
 * Con ambas fechas presentes MANDAN LAS FECHAS: el plazo es su consecuencia,
 * no un dato independiente que pueda contradecirlas. Un número que no cuadre
 * se rechaza en vez de descartarse en silencio — aceptar un campo y tirarlo
 * sin avisar deja al cliente creyendo que se guardó.
 *
 * Sin ambas fechas no hay nada contra qué comparar, así que el número del body
 * se guarda tal cual: es el escape legítimo del contrato cuyo plazo se conoce
 * ("6 meses") pero cuyas fechas exactas todavía no.
 */
export function resolveInitialTermDays(input: TermDaysInput): TermDaysResult {
  // `null` explícito y clave ausente colapsan aquí a "no hay número que
  // contradiga las fechas". Un null explícito con fechas completas no es un
  // conflicto: es pedir que no haya valor, y las fechas ya deciden que sí lo hay.
  const provided = input.initialTermDays ?? null;

  // Casos 2 y 3: sin las dos fechas no hay derivación posible. Se escribe lo
  // que venga, y si no vino nada se escribe null — un plazo que quedó sin
  // fechas que lo sustenten no debe sobrevivir al cambio que se las quitó.
  if (input.startDate === null || input.initialEndDate === null) {
    return { ok: true, value: provided };
  }

  const derived = inclusiveTermDays(input.startDate, input.initialEndDate);

  // Caso 4: terminación anterior al inicio. El formulario ya se comporta así
  // (`derivedTermDays ?? manualTermDays`): no hay plazo que derivar, así que
  // se respeta el manual en vez de borrar el dato por unas fechas invertidas.
  if (derived === null) {
    return { ok: true, value: provided };
  }

  // Caso 1.
  if (provided !== null && provided !== derived) {
    return {
      ok: false,
      error: `initialTermDays no coincide con el plazo calculado a partir de las fechas: se esperaba ${derived}, se recibió ${provided}`,
    };
  }

  return { ok: true, value: derived };
}
