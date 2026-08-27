import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ApiError, getContract, getGuarantee, listEvents } from "@/lib/api";
import { guaranteeToFormValues } from "@/lib/guarantee-form";
import { EditGuaranteeForm } from "./EditGuaranteeForm";

export const dynamic = "force-dynamic";

export default async function EditarGarantiaPage({
  params,
}: {
  params: { id: string; guaranteeId: string };
}) {
  let contract;
  let guarantee;
  let events;
  try {
    [contract, guarantee, events] = await Promise.all([
      getContract(params.id),
      getGuarantee(params.guaranteeId),
      listEvents(params.id),
    ]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  if (guarantee.contractId !== contract.id) notFound();

  return (
    <div className="mx-auto max-w-2xl px-8 py-10">
      <Link
        href={`/contratos/${contract.id}/garantias`}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Garantías de {contract.number}
      </Link>

      <h1 className="text-lg font-medium text-text-primary">Editar póliza</h1>
      <p className="mt-1 font-mono text-sm text-text-secondary">
        {contract.number} · {guarantee.policyNumber}
      </p>

      <EditGuaranteeForm
        guaranteeId={guarantee.id}
        contractId={contract.id}
        events={events}
        initialValues={guaranteeToFormValues(guarantee)}
      />
    </div>
  );
}
