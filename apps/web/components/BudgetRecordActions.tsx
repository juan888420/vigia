"use client";

import Link from "next/link";
import { Pencil } from "lucide-react";
import { deleteBudgetRecord } from "@/lib/api";
import { DeleteWithConfirmation } from "./DeleteWithConfirmation";

export function BudgetRecordActions({
  id,
  label,
  editHref,
}: {
  id: string;
  /** "CDP 121". Tipo y número juntos: el número solo sería ambiguo, porque un
   *  contrato puede tener el CDP 121 y el RP 121. */
  label: string;
  editHref: string;
}) {
  return (
    <div className="flex items-start gap-1">
      <Link
        href={editHref}
        aria-label={`Editar ${label}`}
        className="rounded-md border border-border p-1.5 text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
      >
        <Pencil className="h-3.5 w-3.5" />
      </Link>
      <DeleteWithConfirmation
        label={label}
        confirmText={label}
        onDelete={() => deleteBudgetRecord(id)}
      />
    </div>
  );
}
