import Link from "next/link";

// Resumen + las cinco caras del expediente.
//
// "Resumen" es la pantalla principal del contrato (/contratos/[id]): estado,
// cifras vigentes, riel del expediente y hallazgos. No es una cara más sino la
// conclusión que el motor de reglas saca de todas, y por eso encabeza la
// navegación en vez de colgar de ella. Está aquí para que desde cualquier
// pestaña se pueda volver sin editar la URL a mano.

const TABS = [
  { key: "resumen", label: "Resumen", path: "" },
  { key: "presupuesto", label: "Presupuesto", path: "/presupuesto" },
  { key: "pagos", label: "Pagos", path: "/pagos" },
  { key: "eventos", label: "Eventos", path: "/eventos" },
  { key: "garantias", label: "Garantías", path: "/garantias" },
  { key: "documentos", label: "Documentos", path: "/documentos" },
] as const;

export function ContractSubnav({
  contractId,
  active,
}: {
  contractId: string;
  active?: (typeof TABS)[number]["key"];
}) {
  return (
    <nav className="mb-8 mt-6 flex items-center gap-1 border-b border-border">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={`/contratos/${contractId}${tab.path}`}
          aria-current={tab.key === active ? "page" : undefined}
          className={
            tab.key === active
              ? "-mb-px border-b-2 border-accent px-3 py-2 text-sm font-medium text-text-primary"
              : "-mb-px border-b-2 border-transparent px-3 py-2 text-sm text-text-secondary transition-colors hover:text-text-primary"
          }
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
