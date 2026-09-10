import Link from "next/link";
import type { Contract } from "@/lib/api";
import { formatMoney } from "@/lib/api";
import { ContractActions } from "./ContractActions";

// Muestra únicamente lo que está guardado en la base. El estado, el saldo y los
// hallazgos no salen aquí: los calcula el motor de reglas y viven en el detalle,
// al que se llega por el número del contrato.
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
          <span className="font-mono text-sm text-text-primary">
            {formatMoney(contract.initialValue)}
          </span>
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
