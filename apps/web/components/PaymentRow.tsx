import type { Payment, PaymentStatus, PaymentSupport } from "@/lib/api";
import { formatMoney } from "@/lib/api";
import { PAYMENT_STATUS_LABELS } from "@/lib/payment-form";
import { PaymentActions } from "./PaymentActions";

// `status` es el estado administrativo declarado (¿ya se giró?), NO la
// completitud documental: esa la calcula el motor de reglas comparando los
// soportes cargados contra los DocumentRequirement marcados
// appliesToEachPayment, y llega ya resuelta en `support`. Aquí no se decide
// qué falta, solo se muestra — es el mismo cruce del que salen los hallazgos
// DOCUMENTO_FALTANTE_PAGO, así que ambas lecturas no pueden contradecirse.

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

/** Soportes de este pago. Se omite entero si la modalidad no exige ninguno
 *  por pago: un "0/0" no dice nada. */
function SupportChecklist({ support }: { support: PaymentSupport }) {
  if (support.total === 0) return null;

  const complete = support.present === support.total;

  return (
    <div className="mt-4 border-t border-border pt-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-muted">Soportes</span>
        <span
          className={`font-mono text-sm ${
            complete ? "text-status-al-dia" : "text-status-pendientes"
          }`}
        >
          {support.present}/{support.total}
        </span>
      </div>

      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-hover">
        <div
          className={`h-full rounded-full ${complete ? "bg-status-al-dia" : "bg-status-pendientes"}`}
          style={{ width: `${Math.round((support.present / support.total) * 100)}%` }}
        />
      </div>

      {complete ? (
        <p className="mt-2 text-xs text-text-muted">Este pago tiene todos sus soportes.</p>
      ) : (
        <p className="mt-2 text-xs text-text-muted">
          Falta: <span className="text-text-secondary">{support.missing.join(" · ")}</span>
        </p>
      )}
    </div>
  );
}

export function PaymentRow({
  payment,
  contractId,
  support,
}: {
  payment: Payment;
  contractId: string;
  /** Ausente solo si el diagnóstico no trae este pago, que no debería pasar:
   *  la pantalla no inventa un checklist propio si falta. */
  support?: PaymentSupport;
}) {
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
            {payment.isFinal && (
              <span className="rounded border border-border-strong px-1.5 py-0.5 text-[10px] text-text-muted">
                Pago final
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

      {support && <SupportChecklist support={support} />}
    </article>
  );
}
