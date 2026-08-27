"use client";

import Link from "next/link";
import { Pencil } from "lucide-react";
import { deletePayment } from "@/lib/api";
import { DeleteWithConfirmation } from "./DeleteWithConfirmation";

export function PaymentActions({
  id,
  sequenceNumber,
  editHref,
}: {
  id: string;
  sequenceNumber: number;
  editHref: string;
}) {
  const label = `Pago ${sequenceNumber}`;

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
        onDelete={() => deletePayment(id)}
      />
    </div>
  );
}
