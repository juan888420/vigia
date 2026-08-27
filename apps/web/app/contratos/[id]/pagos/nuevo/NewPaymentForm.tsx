"use client";

import { createPayment, type PaymentPayload } from "@/lib/api";
import { PaymentForm } from "@/components/PaymentForm";
import type { PaymentFormValues } from "@/lib/payment-form";

// Envuelve el formulario compartido para atar el contractId al POST. Existe
// solo porque la página es un server component y no puede pasar un closure.

export function NewPaymentForm({
  contractId,
  initialValues,
}: {
  contractId: string;
  initialValues: PaymentFormValues;
}) {
  return (
    <PaymentForm
      initialValues={initialValues}
      submitLabel="Guardar pago"
      submittingLabel="Guardando..."
      backHref={`/contratos/${contractId}/pagos`}
      onSubmit={(payload: PaymentPayload) => createPayment(contractId, payload)}
    />
  );
}
