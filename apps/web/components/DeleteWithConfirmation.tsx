"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

// Borrado que exige teclear el identificador del registro. Un botón de
// confirmación se acepta por reflejo; escribir "Prórroga 2" obliga a leer qué
// se está destruyendo. No hay papelera: el borrado es real.

export function DeleteWithConfirmation({
  label,
  confirmText,
  onDelete,
}: {
  /** Qué se elimina, para el texto y el aria-label: "Prórroga 2". */
  label: string;
  /** Lo que hay que teclear. Normalmente igual a `label`. */
  confirmText: string;
  onDelete: () => Promise<unknown>;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matches = typed.trim().toLocaleLowerCase() === confirmText.trim().toLocaleLowerCase();

  async function handleDelete() {
    if (!matches) return;
    setDeleting(true);
    setError(null);
    try {
      await onDelete();
      setConfirming(false);
      setTyped("");
      router.refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "No se pudo eliminar");
      setDeleting(false);
    }
  }

  function cancel() {
    setConfirming(false);
    setTyped("");
    setError(null);
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        aria-label={`Eliminar ${label}`}
        className="rounded-md border border-border p-1.5 text-text-secondary transition-colors hover:border-status-atrasado hover:text-status-atrasado"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    );
  }

  // El panel se posiciona por encima del contenido en vez de ocupar sitio en la
  // fila: en flujo normal empujaba el resto de la tarjeta y estrujaba el objeto
  // del contrato a una columna de pocas palabras.
  return (
    <div className="relative">
      <button
        aria-label={`Eliminar ${label}`}
        className="rounded-md border border-status-atrasado p-1.5 text-status-atrasado"
        onClick={cancel}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
      <div className="absolute right-0 top-full z-20 mt-1 w-64 rounded-md border border-status-atrasado-dim bg-surface p-3 shadow-lg">
        <p className="text-xs text-text-secondary">
          Escribe <span className="font-mono text-text-primary">{confirmText}</span> para eliminar. No
          se puede deshacer.
        </p>
        <input
          autoFocus
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleDelete();
            }
            if (e.key === "Escape") cancel();
          }}
          aria-label={`Confirmar eliminación de ${label}`}
          className="mt-2 w-full rounded-md border border-border bg-base px-2.5 py-1.5 font-mono text-xs text-text-primary focus:border-border-strong focus:outline-none"
        />
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={handleDelete}
            disabled={!matches || deleting}
            className="rounded-md bg-status-atrasado px-2.5 py-1 text-xs font-medium text-base transition-colors hover:bg-status-atrasado/80 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {deleting ? "Eliminando..." : "Eliminar"}
          </button>
          <button
            onClick={cancel}
            disabled={deleting}
            className="rounded-md border border-border px-2.5 py-1 text-xs text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
          >
            Cancelar
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-status-atrasado">{error}</p>}
      </div>
    </div>
  );
}
