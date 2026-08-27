// ─────────────────────────────────────────────────────────────────────────────
// Seed: contract type CD + its document checklist template.
//
// This file seeds TEMPLATE data only (ContractType, DocumentType,
// DocumentRequirement). No contracts, no thresholds, no alert severities —
// those are business decisions still pending client validation (see README →
// "Decisiones pendientes").
//
// Idempotent: every write is an upsert keyed by a stable `code`, so re-running
// the seed updates the template instead of duplicating it.
// ─────────────────────────────────────────────────────────────────────────────

import { PrismaClient, ContractStage } from '@prisma/client';

const prisma = new PrismaClient();

type RequirementSeed = {
  /// Stable anchor used by the classifier, the rules engine and the UI.
  code: string;
  name: string;
  stage: ContractStage;
  /// Short label used when standardizing a file name:
  /// "CD-001-2025_Acta-Inicio.pdf"
  fileLabel: string;
  description?: string;
  required: boolean;
  /// true = evaluated once per Payment instead of once per Contract.
  appliesToEachPayment?: boolean;
};

// ── Plantilla documental para contratación directa (CD) ──────────────────────
// Derivada de dos expedientes reales del cliente. `displayOrder` se asigna por
// la posición en este arreglo.
const CD_REQUIREMENTS: RequirementSeed[] = [
  // ── PRECONTRACTUAL — obligatorios ──────────────────────────────────────────
  {
    code: 'ESTUDIO_PREVIO',
    name: 'Estudio previo',
    stage: ContractStage.PRECONTRACTUAL,
    fileLabel: 'Estudio-Previo',
    required: true,
  },
  {
    code: 'CDP',
    name: 'Certificado de disponibilidad presupuestal (CDP)',
    stage: ContractStage.PRECONTRACTUAL,
    fileLabel: 'CDP',
    required: true,
  },
  {
    code: 'MATRIZ_RIESGOS',
    name: 'Matriz de riesgos',
    stage: ContractStage.PRECONTRACTUAL,
    fileLabel: 'Matriz-Riesgos',
    required: true,
  },
  {
    code: 'PRESUPUESTO',
    name: 'Presupuesto',
    stage: ContractStage.PRECONTRACTUAL,
    fileLabel: 'Presupuesto',
    required: true,
  },
  {
    code: 'RESOLUCION_JUSTIFICACION',
    name: 'Resolución de justificación/autorización',
    stage: ContractStage.PRECONTRACTUAL,
    fileLabel: 'Resolucion-Justificacion',
    required: true,
  },

  // ── PRECONTRACTUAL — opcionales (pendiente de confirmar con el cliente) ────
  // required = false hasta saber si entran en el seguimiento de esta oficina o
  // los controla otra área (README → decisión pendiente #5).
  {
    code: 'CERTIFICADO_EXPERIENCIA',
    name: 'Certificado de experiencia del contratista',
    stage: ContractStage.PRECONTRACTUAL,
    fileLabel: 'Certificado-Experiencia',
    description: 'Documento del contratista. Pendiente de confirmar si aplica a este seguimiento.',
    required: false,
  },
  {
    code: 'RUT',
    name: 'RUT del contratista',
    stage: ContractStage.PRECONTRACTUAL,
    fileLabel: 'RUT',
    description: 'Documento del contratista. Pendiente de confirmar si aplica a este seguimiento.',
    required: false,
  },
  {
    code: 'LIMITACIONES_REPRESENTANTE_LEGAL',
    name: 'Certificado de limitaciones del representante legal',
    stage: ContractStage.PRECONTRACTUAL,
    fileLabel: 'Limitaciones-Representante-Legal',
    description: 'Documento del contratista. Pendiente de confirmar si aplica a este seguimiento.',
    required: false,
  },
  {
    code: 'PLAN_AMORTIZACION',
    name: 'Plan de amortización',
    stage: ContractStage.PRECONTRACTUAL,
    fileLabel: 'Plan-Amortizacion',
    description: 'Solo aplica cuando el contrato pacta anticipo (Contract.advanceValue).',
    required: false,
  },

  // ── CONTRACTUAL — obligatorios ─────────────────────────────────────────────
  {
    code: 'RP',
    name: 'Registro presupuestal (RP/CRP)',
    stage: ContractStage.CONTRACTUAL,
    fileLabel: 'RP',
    required: true,
  },
  {
    code: 'ACTA_INICIO',
    name: 'Acta de inicio',
    stage: ContractStage.CONTRACTUAL,
    fileLabel: 'Acta-Inicio',
    required: true,
  },
  {
    code: 'POLIZA',
    name: 'Póliza(s)',
    stage: ContractStage.CONTRACTUAL,
    fileLabel: 'Poliza',
    description: 'Un ContractDocument por amparo, atado a su Guarantee.',
    required: true,
  },
  {
    code: 'APROBACION_POLIZA',
    name: 'Aprobación de póliza(s)',
    stage: ContractStage.CONTRACTUAL,
    fileLabel: 'Aprobacion-Poliza',
    required: true,
  },

  // ── CONTRACTUAL — opcional (pendiente de confirmar) ────────────────────────
  {
    code: 'CLAUSULADO',
    name: 'Clausulado',
    stage: ContractStage.CONTRACTUAL,
    fileLabel: 'Clausulado',
    description: 'Pendiente de confirmar si entra en el seguimiento de esta oficina.',
    required: false,
  },

  // ── SOPORTES DE PAGO ───────────────────────────────────────────────────────
  // Etapa CONTRACTUAL: ocurren durante la ejecución. Lo que los distingue del
  // resto no es la etapa sino appliesToEachPayment: se evalúan una vez por cada
  // Payment, no una sola vez por contrato.
  {
    code: 'ACTA_RECIBO_PARCIAL',
    name: 'Acta de recibo parcial',
    stage: ContractStage.CONTRACTUAL,
    fileLabel: 'Acta-Recibo-Parcial',
    required: true,
    appliesToEachPayment: true,
  },
  {
    code: 'CUENTA_COBRO',
    name: 'Cuenta de cobro',
    stage: ContractStage.CONTRACTUAL,
    fileLabel: 'Cuenta-Cobro',
    required: true,
    appliesToEachPayment: true,
  },
  {
    code: 'FACTURA_HONORARIOS',
    name: 'Factura u honorarios',
    stage: ContractStage.CONTRACTUAL,
    fileLabel: 'Factura-Honorarios',
    required: true,
    appliesToEachPayment: true,
  },
  {
    code: 'CERTIFICACION_BANCARIA',
    name: 'Certificación bancaria',
    stage: ContractStage.CONTRACTUAL,
    fileLabel: 'Certificacion-Bancaria',
    required: true,
    appliesToEachPayment: true,
  },
  {
    code: 'PAZ_SALVO_SEGURIDAD_SOCIAL',
    name: 'Certificado de paz y salvo de seguridad social',
    stage: ContractStage.CONTRACTUAL,
    fileLabel: 'Paz-Salvo-Seguridad-Social',
    required: true,
    appliesToEachPayment: true,
  },
  {
    code: 'PLANILLA_SEGURIDAD_SOCIAL',
    name: 'Planilla de seguridad social',
    stage: ContractStage.CONTRACTUAL,
    fileLabel: 'Planilla-Seguridad-Social',
    required: true,
    appliesToEachPayment: true,
  },
  {
    code: 'INFORME_SUPERVISION',
    name: 'Informe de supervisión',
    stage: ContractStage.CONTRACTUAL,
    fileLabel: 'Informe-Supervision',
    required: true,
    appliesToEachPayment: true,
  },
  {
    code: 'CERTIFICADO_CUMPLIDO',
    name: 'Certificado de cumplido',
    stage: ContractStage.CONTRACTUAL,
    fileLabel: 'Certificado-Cumplido',
    required: true,
    appliesToEachPayment: true,
  },
  {
    code: 'RECIBO_SATISFACCION',
    name: 'Recibo a satisfacción',
    stage: ContractStage.CONTRACTUAL,
    fileLabel: 'Recibo-Satisfaccion',
    required: true,
    appliesToEachPayment: true,
  },
  {
    code: 'COMPROBANTE_EGRESO',
    name: 'Comprobante de egreso',
    stage: ContractStage.CONTRACTUAL,
    fileLabel: 'Comprobante-Egreso',
    required: true,
    appliesToEachPayment: true,
  },
  {
    code: 'ORDEN_PAGO',
    name: 'Orden de pago',
    stage: ContractStage.CONTRACTUAL,
    fileLabel: 'Orden-Pago',
    required: true,
    appliesToEachPayment: true,
  },
  {
    code: 'TRANSFERENCIA',
    name: 'Transferencia',
    stage: ContractStage.CONTRACTUAL,
    fileLabel: 'Transferencia',
    required: true,
    appliesToEachPayment: true,
  },

  // ── POSTCONTRACTUAL — obligatorios ─────────────────────────────────────────
  // "Cuando corresponda" se resuelve por contrato con
  // ContractRequirementOverride, no relajando el requisito en la plantilla.
  {
    code: 'ACTA_TERMINACION',
    name: 'Acta de terminación',
    stage: ContractStage.POSTCONTRACTUAL,
    fileLabel: 'Acta-Terminacion',
    required: true,
  },
  {
    code: 'ACTA_RECIBO',
    name: 'Acta de recibo',
    stage: ContractStage.POSTCONTRACTUAL,
    fileLabel: 'Acta-Recibo',
    required: true,
  },
  {
    code: 'ACTA_LIQUIDACION',
    name: 'Acta de liquidación',
    stage: ContractStage.POSTCONTRACTUAL,
    fileLabel: 'Acta-Liquidacion',
    required: true,
  },
];

// ── Oficina de siembra ───────────────────────────────────────────────────────
// Un Contract necesita una Office existente. El MVP sirve a una sola oficina;
// `Office.name` no es único en el schema, así que la idempotencia se resuelve
// buscando primero en vez de con un upsert.
const SEED_OFFICE_NAME = 'Alcaldía de Angelópolis';

async function seedOffice() {
  const existing = await prisma.office.findFirst({ where: { name: SEED_OFFICE_NAME } });
  if (existing) return existing;
  return prisma.office.create({ data: { name: SEED_OFFICE_NAME } });
}

async function main() {
  const office = await seedOffice();

  const contractType = await prisma.contractType.upsert({
    where: { code: 'CD' },
    update: { name: 'Contratación directa' },
    create: { code: 'CD', name: 'Contratación directa' },
  });

  for (const [index, item] of CD_REQUIREMENTS.entries()) {
    const documentType = await prisma.documentType.upsert({
      where: { code: item.code },
      update: {
        name: item.name,
        stage: item.stage,
        fileLabel: item.fileLabel,
        description: item.description ?? null,
      },
      create: {
        code: item.code,
        name: item.name,
        stage: item.stage,
        fileLabel: item.fileLabel,
        description: item.description ?? null,
      },
    });

    await prisma.documentRequirement.upsert({
      where: {
        contractTypeId_documentTypeId: {
          contractTypeId: contractType.id,
          documentTypeId: documentType.id,
        },
      },
      update: {
        required: item.required,
        appliesToEachPayment: item.appliesToEachPayment ?? false,
        displayOrder: index,
      },
      create: {
        contractTypeId: contractType.id,
        documentTypeId: documentType.id,
        required: item.required,
        appliesToEachPayment: item.appliesToEachPayment ?? false,
        displayOrder: index,
      },
    });
  }

  const documentTypes = await prisma.documentType.count();
  const requirements = await prisma.documentRequirement.count({
    where: { contractTypeId: contractType.id },
  });
  const perPayment = await prisma.documentRequirement.count({
    where: { contractTypeId: contractType.id, appliesToEachPayment: true },
  });
  const optional = await prisma.documentRequirement.count({
    where: { contractTypeId: contractType.id, required: false },
  });

  console.log(
    `Seed OK — Office "${office.name}" · ContractType ${contractType.code} · ` +
      `DocumentType: ${documentTypes} · ` +
      `DocumentRequirement: ${requirements} (${perPayment} por pago, ${optional} opcionales)`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
