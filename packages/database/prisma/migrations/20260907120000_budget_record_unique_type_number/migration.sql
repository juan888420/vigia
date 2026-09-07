-- El mismo CDP/RP no puede cargarse dos veces en un contrato. No limita cuántos
-- respaldos presupuestales tiene: un contrato compuesto por partidas separadas
-- lleva varios CDP con números distintos, y eso sigue permitido.
-- CreateIndex
CREATE UNIQUE INDEX "budget_records_contractId_type_number_key" ON "budget_records"("contractId", "type", "number");
