import Link from "next/link";
import { FileStack, Search } from "lucide-react";

export function Sidebar() {
  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-border bg-surface">
      <div className="border-b border-border px-4 py-4">
        <p className="text-xs text-text-muted">Alcaldía de Angelópolis</p>
        <p className="text-sm font-medium text-text-primary">Contratación directa</p>
      </div>

      <div className="p-3">
        <div className="flex items-center gap-2 rounded-md border border-border bg-base px-2.5 py-1.5">
          <Search className="h-3.5 w-3.5 text-text-muted" />
          <input
            placeholder="Buscar contrato..."
            className="w-full bg-transparent text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
          />
        </div>
      </div>

      <nav className="flex-1 px-3">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-md bg-surface-hover px-2.5 py-2 text-sm text-text-primary"
        >
          <FileStack className="h-4 w-4 text-accent" />
          Contratos CD
        </Link>
      </nav>

      <div className="border-t border-border px-4 py-3">
        <p className="text-xs text-text-muted">Vigía · v0.1 wireframe</p>
      </div>
    </aside>
  );
}
