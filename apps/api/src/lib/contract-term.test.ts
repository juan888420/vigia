import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { resolveInitialTermDays } from "./contract-term";
import { toDate } from "./validation";

// Las fechas se construyen con el mismo `toDate` que usan las rutas, no con
// `new Date(...)` a mano: si esa conversión cambiara, estos tests tienen que
// verlo. Todas las columnas son @db.Date y llegan a medianoche UTC.

describe("resolveInitialTermDays", () => {
  describe("con las dos fechas presentes: mandan las fechas", () => {
    it("deriva el plazo cuando el body no trae initialTermDays", () => {
      // El caso real de CD-001-2025: 183 días de diferencia + 1 (conteo
      // inclusivo, el día de inicio cuenta) = 184.
      const result = resolveInitialTermDays({
        startDate: toDate("2025-03-21"),
        initialEndDate: toDate("2025-09-20"),
        initialTermDays: undefined,
      });

      assert.deepEqual(result, { ok: true, value: 184 });
    });

    it("acepta un initialTermDays que coincide con el derivado", () => {
      const result = resolveInitialTermDays({
        startDate: toDate("2025-03-21"),
        initialEndDate: toDate("2025-09-20"),
        initialTermDays: 184,
      });

      assert.deepEqual(result, { ok: true, value: 184 });
    });

    it("rechaza un initialTermDays que contradice a las fechas", () => {
      const result = resolveInitialTermDays({
        startDate: toDate("2025-03-21"),
        initialEndDate: toDate("2025-09-20"),
        initialTermDays: 150,
      });

      assert.equal(result.ok, false);
      // El mensaje tiene que nombrar los dos números: sin ellos, quien recibe
      // el 400 no sabe si corregir el plazo o las fechas.
      assert.match(
        result.ok ? "" : result.error,
        /se esperaba 184, se recibió 150/,
      );
    });

    it("trata un null explícito como ausencia de valor, no como conflicto", () => {
      // Mandar null es pedir que no haya plazo; las fechas ya deciden que sí
      // lo hay. Es un caso legítimo, no un 400.
      const result = resolveInitialTermDays({
        startDate: toDate("2025-03-21"),
        initialEndDate: toDate("2025-09-20"),
        initialTermDays: null,
      });

      assert.deepEqual(result, { ok: true, value: 184 });
    });

    it("cuenta 1 día cuando el contrato empieza y termina el mismo día", () => {
      const result = resolveInitialTermDays({
        startDate: toDate("2025-03-21"),
        initialEndDate: toDate("2025-03-21"),
        initialTermDays: undefined,
      });

      assert.deepEqual(result, { ok: true, value: 1 });
    });
  });

  describe("sin las dos fechas: no hay contra qué comparar", () => {
    it("guarda el plazo manual tal cual cuando falta initialEndDate", () => {
      const result = resolveInitialTermDays({
        startDate: toDate("2025-01-10"),
        initialEndDate: null,
        initialTermDays: 200,
      });

      assert.deepEqual(result, { ok: true, value: 200 });
    });

    it("guarda el plazo manual tal cual cuando falta startDate", () => {
      const result = resolveInitialTermDays({
        startDate: null,
        initialEndDate: toDate("2025-07-12"),
        initialTermDays: 200,
      });

      assert.deepEqual(result, { ok: true, value: 200 });
    });

    it("no valida el plazo manual contra nada: acepta cualquier número", () => {
      // 9999 días es absurdo para un contrato, pero sin fechas no hay forma
      // determinística de saberlo y no es esta función quien lo juzga.
      const result = resolveInitialTermDays({
        startDate: toDate("2025-01-10"),
        initialEndDate: null,
        initialTermDays: 9999,
      });

      assert.deepEqual(result, { ok: true, value: 9999 });
    });

    it("devuelve null sin fechas y sin plazo en el body", () => {
      const result = resolveInitialTermDays({
        startDate: null,
        initialEndDate: null,
        initialTermDays: undefined,
      });

      assert.deepEqual(result, { ok: true, value: null });
    });

    it("devuelve null cuando se anula la fecha que sustentaba el plazo", () => {
      // El PATCH que borra startDate: el plazo viejo se quedó sin base y no
      // debe sobrevivir.
      const result = resolveInitialTermDays({
        startDate: null,
        initialEndDate: toDate("2025-07-12"),
        initialTermDays: undefined,
      });

      assert.deepEqual(result, { ok: true, value: null });
    });
  });

  describe("con la terminación anterior al inicio", () => {
    it("respeta el plazo manual en vez de borrarlo", () => {
      // Mismo fallback que el formulario (`derivedTermDays ?? manualTermDays`):
      // no hay plazo que derivar de unas fechas invertidas, pero eso no es
      // razón para perder el dato que sí venía.
      const result = resolveInitialTermDays({
        startDate: toDate("2025-07-12"),
        initialEndDate: toDate("2025-01-10"),
        initialTermDays: 99,
      });

      assert.deepEqual(result, { ok: true, value: 99 });
    });

    it("devuelve null si tampoco vino un plazo manual", () => {
      const result = resolveInitialTermDays({
        startDate: toDate("2025-07-12"),
        initialEndDate: toDate("2025-01-10"),
        initialTermDays: undefined,
      });

      assert.deepEqual(result, { ok: true, value: null });
    });

    it("no rechaza el plazo manual aunque no coincida: no hay derivado", () => {
      // Con fechas invertidas nunca se llega a la comparación del caso 1.
      const result = resolveInitialTermDays({
        startDate: toDate("2025-07-12"),
        initialEndDate: toDate("2025-01-10"),
        initialTermDays: 1,
      });

      assert.equal(result.ok, true);
    });
  });
});
