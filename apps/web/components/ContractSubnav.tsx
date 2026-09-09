import Link from "next/link";

// Las cinco caras del expediente. El diagnóstico NO es una de ellas: no es una
// cara sino la conclusión que el motor de reglas saca de todas, y por eso vive
// en la pantalla principal del contrato (/contratos/[id]) en vez de en una
// pestaña aparte.
//
// `active` es opcional: en el detalle no hay ninguna pestaña activa porque el
// detalle es la raíz de la que cuelgan todas.

const TABS = [
  { key: "presupuesto", label: "Presupuesto" },
  { key: "pagos", label: "Pagos" },
  { key: "eventos", label: "Eventos" },
  { key: "garantias", label: "Garantías" },
  { key: "documentos", label: "Documentos" },
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
          href={`/contratos/${contractId}/${tab.key}`}
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
