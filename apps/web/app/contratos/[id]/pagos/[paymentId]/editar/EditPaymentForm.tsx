"use client";

import { updatePayment, type PaymentPayload } from "@/lib/api";
import { PaymentForm } from "@/components/PaymentForm";
import type { PaymentFormValues } from "@/lib/payment-form";

export function EditPaymentForm({
  paymentId,
  contractId,
  initialValues,
}: {
  paymentId: string;
  contractId: string;
  initialValues: PaymentFormValues;
}) {
  return (
    <PaymentForm
      initialValues={initialValues}
      submitLabel="Guardar cambios"
      submittingLabel="Guardando..."
      backHref={`/contratos/${contractId}/pagos`}
      onSubmit={(payload: PaymentPayload) => updatePayment(paymentId, payload)}
    />
  );
}
