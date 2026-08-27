import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ApiError, getContract, listPayments } from "@/lib/api";
import { EMPTY_PAYMENT_FORM, nextSequenceNumber } from "@/lib/payment-form";
import { NewPaymentForm } from "./NewPaymentForm";

export const dynamic = "force-dynamic";

export default async function NuevoPagoPage({ params }: { params: { id: string } }) {
  let contract;
  let payments;
  try {
    [contract, payments] = await Promise.all([getContract(params.id), listPayments(params.id)]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  return (
    <div className="mx-auto max-w-2xl px-8 py-10">
      <Link
        href={`/contratos/${contract.id}/pagos`}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Pagos de {contract.number}
      </Link>

      <h1 className="text-lg font-medium text-text-primary">Nuevo pago</h1>
      <p className="mt-1 text-sm text-text-secondary">
        Los soportes documentales del pago se cargan más adelante.
      </p>

      <NewPaymentForm
        contractId={contract.id}
        initialValues={{
          ...EMPTY_PAYMENT_FORM,
          sequenceNumber: nextSequenceNumber(payments),
        }}
      />
    </div>
  );
}
