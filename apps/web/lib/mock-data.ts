export type EstadoContrato = "al_dia" | "con_pendientes" | "atrasado";

export interface Documento {
  nombre: string;
  presente: boolean;
}

export interface Etapa {
  nombre: string;
  documentos: Documento[];
}

export interface Contrato {
  id: string;
  numero: string;
  objeto: string;
  estado: EstadoContrato;
  valor: number;
  pagado: number;
  fechaInicio: string;
  fechaVencimiento: string;
  etapas: Etapa[];
  alertas: string[];
}

// NOTA: estos son datos de ejemplo para el wireframe, tomados de la
// estructura real de carpetas de CD-001-2025 que compartió el cliente.
// El estado ("con_pendientes") y las alertas son ilustrativos — el motor
// de reglas real se construye cuando el esquema de datos esté validado.

export const contratos: Contrato[] = [
  {
    id: "cd-001-2025",
    numero: "CD-001-2025",
    objeto: "Adecuación de la placa polideportiva de El Pajonal, Angelópolis",
    estado: "con_pendientes",
    valor: 45_000_000,
    pagado: 22_500_000,
    fechaInicio: "2025-03-15",
    fechaVencimiento: "2025-09-15",
    etapas: [
      {
        nombre: "Precontractual",
        documentos: [
          { nombre: "Estudio previo", presente: true },
          { nombre: "CDP", presente: true },
          { nombre: "Matriz de riesgos", presente: true },
          { nombre: "Documentos del contratista", presente: true },
        ],
      },
      {
        nombre: "Contractual — Anticipo",
        documentos: [
          { nombre: "Acta de anticipo", presente: true },
          { nombre: "Pólizas", presente: true },
          { nombre: "Orden de pago", presente: true },
          { nombre: "Transferencia", presente: true },
        ],
      },
      {
        nombre: "Contractual — Pago 1",
        documentos: [
          { nombre: "Acta de recibo parcial", presente: true },
          { nombre: "Planillas seguridad social", presente: true },
          { nombre: "Informe de supervisión", presente: false },
          { nombre: "Comprobante de egreso", presente: true },
        ],
      },
      {
        nombre: "Postcontractual",
        documentos: [{ nombre: "Acta de terminación", presente: false }],
      },
    ],
    alertas: [
      "Falta el informe de supervisión del Pago 1",
      "Acta de terminación pendiente — el plazo vence en 26 días",
    ],
  },
  {
    id: "cd-002-2025",
    numero: "CD-002-2025",
    objeto: "Suministro de material de ferretería para mantenimiento vial",
    estado: "al_dia",
    valor: 18_000_000,
    pagado: 18_000_000,
    fechaInicio: "2025-01-10",
    fechaVencimiento: "2025-04-10",
    etapas: [
      {
        nombre: "Precontractual",
        documentos: [
          { nombre: "Estudio previo", presente: true },
          { nombre: "CDP", presente: true },
        ],
      },
      {
        nombre: "Contractual",
        documentos: [
          { nombre: "Acta de inicio", presente: true },
          { nombre: "Acta de recibo final", presente: true },
        ],
      },
      {
        nombre: "Postcontractual",
        documentos: [{ nombre: "Acta de liquidación", presente: true }],
      },
    ],
    alertas: [],
  },
  {
    id: "cd-003-2025",
    numero: "CD-003-2025",
    objeto: "Interventoría técnica al contrato de obra CO-015-2025",
    estado: "atrasado",
    valor: 30_000_000,
    pagado: 10_000_000,
    fechaInicio: "2025-02-01",
    fechaVencimiento: "2025-05-01",
    etapas: [
      {
        nombre: "Precontractual",
        documentos: [
          { nombre: "Estudio previo", presente: true },
          { nombre: "CDP", presente: true },
        ],
      },
      {
        nombre: "Contractual — Pago 1",
        documentos: [
          { nombre: "Acta de recibo parcial", presente: true },
          { nombre: "Informe de supervisión", presente: false },
        ],
      },
      {
        nombre: "Postcontractual",
        documentos: [{ nombre: "Acta de terminación", presente: false }],
      },
    ],
    alertas: [
      "Contrato vencido hace 12 días sin acta de terminación",
      "Falta informe de supervisión del Pago 1",
    ],
  },
];

export function getContrato(id: string) {
  return contratos.find((c) => c.id === id);
}
