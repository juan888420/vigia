-- Distingue el pago que cierra la ejecución del contrato de uno parcial. Sin
-- restricción de unicidad: un contrato en ejecución todavía no tiene ninguno.
-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "isFinal" BOOLEAN NOT NULL DEFAULT false;
