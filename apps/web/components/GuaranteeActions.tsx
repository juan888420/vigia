"use client";

import Link from "next/link";
import { Pencil } from "lucide-react";
import { deleteGuarantee } from "@/lib/api";
import { DeleteWithConfirmation } from "./DeleteWithConfirmation";

export function GuaranteeActions({
  id,
  policyNumber,
  editHref,
}: {
  id: string;
  policyNumber: string;
  editHref: string;
}) {
  return (
    <div className="flex items-start gap-1">
      <Link
        href={editHref}
        aria-label={`Editar póliza ${policyNumber}`}
        className="rounded-md border border-border p-1.5 text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
      >
        <Pencil className="h-3.5 w-3.5" />
      </Link>
      <DeleteWithConfirmation
        label={`póliza ${policyNumber}`}
        confirmText={policyNumber}
        onDelete={() => deleteGuarantee(id)}
      />
    </div>
  );
}
