import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ApiError, getBudgetRecord, getContract, listEvents } from "@/lib/api";
import { budgetRecordToFormValues, BUDGET_RECORD_TYPE_LABELS } from "@/lib/budget-form";
import { EditBudgetRecordForm } from "./EditBudgetRecordForm";

export const dynamic = "force-dynamic";

export default async function EditarPresupuestoPage({
  params,
}: {
  params: { id: string; recordId: string };
}) {
  let contract;
  let record;
  let events;
  try {
    [contract, record, events] = await Promise.all([
      getContract(params.id),
      getBudgetRecord(params.recordId),
      listEvents(params.id),
    ]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  if (record.contractId !== contract.id) notFound();

  return (
    <div className="mx-auto max-w-2xl px-8 py-10">
      <Link
        href={`/contratos/${contract.id}/presupuesto`}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Presupuesto de {contract.number}
      </Link>

      <h1 className="text-lg font-medium text-text-primary">Editar respaldo presupuestal</h1>
      <p className="mt-1 font-mono text-sm text-text-secondary">
        {contract.number} · {BUDGET_RECORD_TYPE_LABELS[record.type]} {record.number}
      </p>

      <EditBudgetRecordForm
        recordId={record.id}
        contractId={contract.id}
        events={events}
        initialValues={budgetRecordToFormValues(record)}
      />
    </div>
  );
}
