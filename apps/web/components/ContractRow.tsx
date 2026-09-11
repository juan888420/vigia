import Link from "next/link";
import type { Contract } from "@/lib/api";
import { formatMoney } from "@/lib/api";
import { ContractActions } from "./ContractActions";

// El estado, el saldo y los hallazgos no salen aquí: los calcula el motor de
// reglas y viven en el detalle, al que se llega por el número del contrato.
//
// El valor SÍ es el vigente, no el inicial. Que el listado mostrara el inicial
// mientras el detalle mostraba el vigente hacía que el mismo contrato
// apareciera con dos cifras distintas según la pantalla. Ambas llegan del API
// ya calculadas: aquí no se suma ninguna adición.
//
// El enlace envuelve el número y no la tarjeta entera: la fila ya contiene sus
// propias acciones (editar, eliminar), y anidar botones dentro de un enlace
// deja un objetivo de clic ambiguo.

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

/**
 * Valor del contrato. Si una adición movió el valor, se muestran los dos con su
 * etiqueta: sin ellas, dos cifras juntas no dicen cuál es cuál. Si nadie lo
 * movió, una sola cifra sin etiqueta — rotular "vigente" un número que nunca
 * cambió solo añade ruido a la mayoría de las filas.
 *
 * El inicial NO va tachado: no es un error corregido, es el dato histórico que
 * un acto administrativo modificó.
 */
function ContractValue({
  initialValue,
  currentValue,
}: {
  initialValue: string;
  currentValue: string;
}) {
  // Comparación de strings, no de números: ambos vienen del mismo Decimal(15,2)
  // serializado igual, y pasarlos por float para compararlos introduciría
  // imprecisión justo donde se decide si dos montos son el mismo.
  if (initialValue === currentValue) {
    return <span className="font-mono text-sm text-text-primary">{formatMoney(currentValue)}</span>;
  }

  return (
    <div className="text-right">
      <div className="flex items-baseline justify-end gap-1.5">
        <span className="font-mono text-sm text-text-primary">{formatMoney(currentValue)}</span>
        <span className="text-sm text-text-secondary">vigente</span>
      </div>
      <p className="mt-0.5 text-xs text-text-muted">
        inicial: <span className="font-mono">{formatMoney(initialValue)}</span>
      </p>
    </div>
  );
}

export function ContractRow({ contract }: { contract: Contract }) {
  return (
    <article className="rounded-lg border border-border bg-surface p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Link
              href={`/contratos/${contract.id}`}
              className="font-mono text-sm text-text-primary underline-offset-4 transition-colors hover:text-accent hover:underline"
            >
              {contract.number}
            </Link>
            <span className="rounded border border-border-strong px-1.5 py-0.5 font-mono text-[10px] text-text-muted">
              {contract.contractType.code}
            </span>
          </div>
          <p className="mt-1 max-w-md text-sm text-text-secondary">{contract.object}</p>
          {contract.contractor && (
            <p className="mt-2 text-sm text-text-secondary">
              <span className="text-text-muted">Contratista: </span>
              {contract.contractor}
              {contract.contractorId && (
                <span className="ml-1.5 font-mono text-xs text-text-muted">
                  {contract.contractorId}
                </span>
              )}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-3">
          <ContractValue
            initialValue={contract.initialValue}
            currentValue={contract.currentValue}
          />
          <ContractActions id={contract.id} number={contract.number} />
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-border pt-4 sm:grid-cols-4">
        <Field label="Supervisor" value={contract.supervisor} />
        <Field label="Plazo inicial" value={contract.initialTermDays ? `${contract.initialTermDays} días` : null} />
        <Field label="Inicio" value={contract.startDate} />
        <Field label="Terminación inicial" value={contract.initialEndDate} />
      </dl>
    </article>
  );
}
