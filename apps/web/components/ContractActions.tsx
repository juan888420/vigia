"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { deleteContract } from "@/lib/api";

// El borrado es real y no hay papelera: la confirmación exige leer el número
// del contrato antes de destruirlo, en vez de un window.confirm que se acepta
// por reflejo.

export function ContractActions({ id, number }: { id: string; number: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      await deleteContract(id);
      setConfirming(false);
      router.refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "No se pudo eliminar");
      setDeleting(false);
    }
  }

  if (confirming) {
    return (
      <div className="flex flex-col items-end gap-2">
        <p className="text-xs text-text-secondary">
          ¿Eliminar <span className="font-mono text-text-primary">{number}</span>? No se puede
          deshacer.
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="rounded-md bg-status-atrasado px-2.5 py-1 text-xs font-medium text-base transition-colors hover:bg-status-atrasado/80 disabled:opacity-50"
          >
            {deleting ? "Eliminando..." : "Sí, eliminar"}
          </button>
          <button
            onClick={() => {
              setConfirming(false);
              setError(null);
            }}
            disabled={deleting}
            className="rounded-md border border-border px-2.5 py-1 text-xs text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
          >
            Cancelar
          </button>
        </div>
        {error && <p className="text-xs text-status-atrasado">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Link
        href={`/contratos/${id}/editar`}
        aria-label={`Editar ${number}`}
        className="rounded-md border border-border p-1.5 text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
      >
        <Pencil className="h-3.5 w-3.5" />
      </Link>
      <button
        onClick={() => setConfirming(true)}
        aria-label={`Eliminar ${number}`}
        className="rounded-md border border-border p-1.5 text-text-secondary transition-colors hover:border-status-atrasado hover:text-status-atrasado"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
