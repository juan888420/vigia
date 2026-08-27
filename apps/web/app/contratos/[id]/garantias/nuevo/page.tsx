import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ApiError, getContract, listEvents } from "@/lib/api";
import { NewGuaranteeForm } from "./NewGuaranteeForm";

export const dynamic = "force-dynamic";

export default async function NuevaGarantiaPage({ params }: { params: { id: string } }) {
  let contract;
  let events;
  try {
    [contract, events] = await Promise.all([getContract(params.id), listEvents(params.id)]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  return (
    <div className="mx-auto max-w-2xl px-8 py-10">
      <Link
        href={`/contratos/${contract.id}/garantias`}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Garantías de {contract.number}
      </Link>

      <h1 className="text-lg font-medium text-text-primary">Nueva póliza</h1>
      <p className="mt-1 text-sm text-text-secondary">
        Una fila por amparo, tal como vienen separadas en el expediente.
      </p>

      <NewGuaranteeForm contractId={contract.id} events={events} />
    </div>
  );
}
