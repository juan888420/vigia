import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ApiError, getContract, getPayment } from "@/lib/api";
import { paymentToFormValues } from "@/lib/payment-form";
import { EditPaymentForm } from "./EditPaymentForm";

export const dynamic = "force-dynamic";

export default async function EditarPagoPage({
  params,
}: {
  params: { id: string; paymentId: string };
}) {
  let contract;
  let payment;
  try {
    [contract, payment] = await Promise.all([getContract(params.id), getPayment(params.paymentId)]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  // Un pago que existe pero pertenece a otro contrato no se edita desde esta
  // URL: la ruta quedaría mintiendo sobre a qué expediente pertenece.
  if (payment.contractId !== contract.id) notFound();

  return (
    <div className="mx-auto max-w-2xl px-8 py-10">
      <Link
        href={`/contratos/${contract.id}/pagos`}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Pagos de {contract.number}
      </Link>

      <h1 className="text-lg font-medium text-text-primary">Editar pago</h1>
      <p className="mt-1 font-mono text-sm text-text-secondary">
        {contract.number} · Pago {payment.sequenceNumber}
      </p>

      <EditPaymentForm
        paymentId={payment.id}
        contractId={contract.id}
        initialValues={paymentToFormValues(payment)}
      />
    </div>
  );
}
