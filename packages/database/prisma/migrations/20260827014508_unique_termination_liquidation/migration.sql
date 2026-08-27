-- Un contrato solo puede tener un acta de terminación y una de liquidación.
--
-- Va como índice único PARCIAL escrito a mano porque Prisma no sabe expresar
-- un `WHERE` en @@unique. El @@unique([contractId, type, sequenceNumber]) del
-- schema no cubre este caso: TERMINATION y LIQUIDATION no se numeran, y en
-- Postgres los NULL no colisionan entre sí, así que sin esto caben infinitas.
--
-- Los demás tipos (otrosí, adición, prórroga, suspensión, reinicio) sí se
-- repiten legítimamente y quedan fuera del índice.
CREATE UNIQUE INDEX "contract_events_one_termination_per_contract"
  ON "contract_events" ("contractId")
  WHERE "type" = 'TERMINATION';

CREATE UNIQUE INDEX "contract_events_one_liquidation_per_contract"
  ON "contract_events" ("contractId")
  WHERE "type" = 'LIQUIDATION';
