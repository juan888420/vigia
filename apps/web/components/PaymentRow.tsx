import type { Payment, PaymentStatus } from "@/lib/api";
import { formatMoney } from "@/lib/api";
import { PAYMENT_STATUS_LABELS } from "@/lib/payment-form";
import { PaymentActions } from "./PaymentActions";

// Muestra solo lo guardado. `status` es el estado administrativo declarado
// (¿ya se giró?), NO la completitud documental del pago: esa la derivará el
// motor de reglas comparando los soportes con los DocumentRequirement marcados
// appliesToEachPayment. Por eso aquí no hay checklist ni "faltan N soportes".

const statusStyle: Record<PaymentStatus, string> = {
  REGISTERED: "bg-status-pendientes-dim text-status-pendientes",
  PAID: "bg-status-al-dia-dim text-status-al-dia",
  CANCELLED: "bg-surface-hover text-text-muted",
};

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd className={value ? "mt-0.5 text-sm text-text-secondary" : "mt-0.5 text-sm text-text-muted"}>
        {value ?? "Sin registrar"}
      </dd>
    </div>
  );
}

export function PaymentRow({ payment, contractId }: { payment: Payment; contractId: string }) {
  return (
    <article className="rounded-lg border border-border bg-surface p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-text-primary">
              Pago {payment.sequenceNumber}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusStyle[payment.status]}`}
            >
              {PAYMENT_STATUS_LABELS[payment.status]}
            </span>
            {payment.isAdvance && (
              <span className="rounded border border-border-strong px-1.5 py-0.5 text-[10px] text-text-muted">
                Anticipo
              </span>
            )}
          </div>
          {payment.notes && <p className="mt-1.5 max-w-md text-sm text-text-secondary">{payment.notes}</p>}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-3">
          <span className="font-mono text-sm text-text-primary">{formatMoney(payment.value)}</span>
          <PaymentActions
            id={payment.id}
            sequenceNumber={payment.sequenceNumber}
            editHref={`/contratos/${contractId}/pagos/${payment.id}/editar`}
          />
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-border pt-4">
        <Field label="Fecha del acta" value={payment.actDate} />
        <Field label="Fecha del giro" value={payment.paidAt} />
      </dl>
    </article>
  );
}
