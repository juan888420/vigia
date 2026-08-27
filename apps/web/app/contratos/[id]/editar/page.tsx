import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ApiError, getContract } from "@/lib/api";
import { contractToFormValues } from "@/lib/contract-form";
import { EditContractForm } from "./EditContractForm";

export const dynamic = "force-dynamic";

export default async function EditarContratoPage({ params }: { params: { id: string } }) {
  let contract;
  try {
    contract = await getContract(params.id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  return (
    <div className="mx-auto max-w-2xl px-8 py-10">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Contratos CD
      </Link>

      <h1 className="text-lg font-medium text-text-primary">Editar contrato</h1>
      <p className="mt-1 font-mono text-sm text-text-secondary">{contract.number}</p>

      <EditContractForm id={contract.id} initialValues={contractToFormValues(contract)} />
    </div>
  );
}
