import Link from "next/link";

// Las tres caras del expediente que ya existen. El detalle mock
// (/contratos/[id]) no entra aquí: no muestra datos reales todavía.

const TABS = [
  { key: "pagos", label: "Pagos" },
  { key: "eventos", label: "Eventos" },
  { key: "garantias", label: "Garantías" },
] as const;

export function ContractSubnav({
  contractId,
  active,
}: {
  contractId: string;
  active: (typeof TABS)[number]["key"];
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
