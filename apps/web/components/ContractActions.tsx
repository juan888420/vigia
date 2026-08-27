"use client";

import Link from "next/link";
import { Coins, FileClock, Pencil, ShieldCheck } from "lucide-react";
import { deleteContract } from "@/lib/api";
import { DeleteWithConfirmation } from "./DeleteWithConfirmation";

const sectionLink =
  "inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1.5 text-xs text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary";

export function ContractActions({ id, number }: { id: string; number: string }) {
  return (
    <div className="flex items-start gap-1">
      <Link href={`/contratos/${id}/pagos`} className={sectionLink}>
        <Coins className="h-3.5 w-3.5" />
        Pagos
      </Link>
      <Link href={`/contratos/${id}/eventos`} className={sectionLink}>
        <FileClock className="h-3.5 w-3.5" />
        Eventos
      </Link>
      <Link href={`/contratos/${id}/garantias`} className={`${sectionLink} mr-1`}>
        <ShieldCheck className="h-3.5 w-3.5" />
        Garantías
      </Link>
      <Link
        href={`/contratos/${id}/editar`}
        aria-label={`Editar ${number}`}
        className="rounded-md border border-border p-1.5 text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
      >
        <Pencil className="h-3.5 w-3.5" />
      </Link>
      <DeleteWithConfirmation
        label={number}
        confirmText={number}
        onDelete={() => deleteContract(id)}
      />
    </div>
  );
}
