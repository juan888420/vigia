"use client";

import Link from "next/link";
import { Pencil } from "lucide-react";
import { deleteDocument } from "@/lib/api";
import { DeleteWithConfirmation } from "./DeleteWithConfirmation";

export function DocumentActions({
  id,
  originalFileName,
  editHref,
}: {
  id: string;
  /** El nombre original es el identificador que hay que teclear para borrar:
   *  es lo que el funcionario reconoce como "su" archivo. */
  originalFileName: string;
  editHref: string;
}) {
  return (
    <div className="flex items-start gap-1">
      <Link
        href={editHref}
        aria-label={`Editar ${originalFileName}`}
        className="rounded-md border border-border p-1.5 text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
      >
        <Pencil className="h-3.5 w-3.5" />
      </Link>
      <DeleteWithConfirmation
        label={originalFileName}
        confirmText={originalFileName}
        onDelete={() => deleteDocument(id)}
      />
    </div>
  );
}
