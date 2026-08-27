"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createContract } from "@/lib/api";
import { ContractForm } from "@/components/ContractForm";

export default function NuevoContratoPage() {
  return (
    <div className="mx-auto max-w-2xl px-8 py-10">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Contratos CD
      </Link>

      <h1 className="text-lg font-medium text-text-primary">Nuevo contrato</h1>
      <p className="mt-1 text-sm text-text-secondary">
        Solo condiciones iniciales. Pagos, modificaciones y pólizas se registran después.
      </p>

      <ContractForm
        submitLabel="Guardar contrato"
        submittingLabel="Guardando..."
        onSubmit={createContract}
      />
    </div>
  );
}
