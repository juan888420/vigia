"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { listContractTypes, listOffices, type ContractTypeSummary, type Office } from "@/lib/api";
import {
  EMPTY_CONTRACT_FORM,
  daysBetween,
  toContractPayload,
  type ContractFormValues,
} from "@/lib/contract-form";
import type { ContractPayload } from "@/lib/api";

// Formulario compartido por /contratos/nuevo y /contratos/[id]/editar. La única
// diferencia entre ambos es qué hace `onSubmit`: POST o PATCH.

const inputClass =
  "w-full rounded-md border border-border bg-base px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-border-strong focus:outline-none";

const readOnlyInputClass =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-secondary focus:outline-none";

type CatalogState = "loading" | "ready" | "error";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs text-text-secondary">{label}</span>
      {hint && <span className="ml-1.5 text-xs text-text-muted">{hint}</span>}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

interface ContractFormProps {
  initialValues?: ContractFormValues;
  submitLabel: string;
  submittingLabel: string;
  /** Devuelve el error a mostrar, o lanza. El redirect lo maneja este componente. */
  onSubmit: (payload: ContractPayload) => Promise<unknown>;
}

export function ContractForm({
  initialValues = EMPTY_CONTRACT_FORM,
  submitLabel,
  submittingLabel,
  onSubmit,
}: ContractFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<ContractFormValues>(initialValues);
  const [offices, setOffices] = useState<Office[]>([]);
  const [contractTypes, setContractTypes] = useState<ContractTypeSummary[]>([]);
  const [catalogState, setCatalogState] = useState<CatalogState>("loading");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Si esto falla, los selects quedan sin opciones. El aviso tiene que salir
  // junto a ellos y no al pie del formulario: allí abajo queda fuera de
  // pantalla y el fallo se lee como "no hay oficinas registradas".
  const loadCatalogs = useCallback(() => {
    setCatalogState("loading");
    Promise.all([listOffices(), listContractTypes()])
      .then(([loadedOffices, loadedTypes]) => {
        setOffices(loadedOffices);
        setContractTypes(loadedTypes);
        // El MVP tiene una sola oficina y una sola modalidad: preseleccionarlas
        // evita un paso que no aporta ninguna decisión. Nunca pisa un valor ya
        // cargado, que es lo que ocurre al editar.
        setForm((current) => ({
          ...current,
          officeId: current.officeId || (loadedOffices.length === 1 ? loadedOffices[0].id : ""),
          contractTypeId:
            current.contractTypeId || (loadedTypes.length === 1 ? loadedTypes[0].id : ""),
        }));
        setCatalogState("ready");
      })
      .catch(() => setCatalogState("error"));
  }, []);

  useEffect(loadCatalogs, [loadCatalogs]);

  function update<K extends keyof ContractFormValues>(key: K, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  // El plazo se deriva de las fechas cuando ambas existen; si falta alguna, el
  // usuario lo escribe a mano. Se calcula en render en vez de guardarse en el
  // estado para que lo mostrado y lo enviado no puedan divergir:
  // toContractPayload aplica exactamente la misma regla.
  const computedTermDays = daysBetween(form.startDate, form.initialEndDate);
  const invalidDateRange =
    form.startDate !== "" && form.initialEndDate !== "" && computedTermDays === null;
  const termDaysIsDerived = computedTermDays !== null;
  const termDaysValue = termDaysIsDerived ? String(computedTermDays) : form.initialTermDays;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await onSubmit(toContractPayload(form));
      router.push("/");
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Error al guardar el contrato");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-5">
      {catalogState === "error" && (
        <div className="flex items-start gap-2 rounded-lg border border-status-atrasado-dim bg-status-atrasado-dim/40 px-3 py-2.5 text-sm text-status-atrasado">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div>
            <p>
              No se pudo cargar la oficina ni la modalidad. Verifica que el API esté corriendo en{" "}
              <span className="font-mono">localhost:3333</span>.
            </p>
            <button
              type="button"
              onClick={loadCatalogs}
              className="mt-1.5 rounded-md border border-status-atrasado px-2.5 py-1 text-xs transition-colors hover:bg-status-atrasado hover:text-base"
            >
              Reintentar
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Field label="Oficina">
          <select
            required
            disabled={catalogState !== "ready"}
            value={form.officeId}
            onChange={(e) => update("officeId", e.target.value)}
            className={`${inputClass} disabled:cursor-not-allowed disabled:text-text-muted`}
          >
            <option value="">
              {catalogState === "loading" ? "Cargando..." : "Seleccionar..."}
            </option>
            {offices.map((office) => (
              <option key={office.id} value={office.id}>
                {office.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Modalidad">
          <select
            required
            disabled={catalogState !== "ready"}
            value={form.contractTypeId}
            onChange={(e) => update("contractTypeId", e.target.value)}
            className={`${inputClass} disabled:cursor-not-allowed disabled:text-text-muted`}
          >
            <option value="">
              {catalogState === "loading" ? "Cargando..." : "Seleccionar..."}
            </option>
            {contractTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.code} — {type.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Número">
        <input
          required
          value={form.number}
          onChange={(e) => update("number", e.target.value)}
          placeholder="CD-001-2025"
          className={`${inputClass} font-mono`}
        />
      </Field>

      <Field label="Objeto">
        <textarea
          required
          rows={3}
          value={form.object}
          onChange={(e) => update("object", e.target.value)}
          className={`${inputClass} resize-y`}
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Contratista" hint="opcional">
          <input
            value={form.contractor}
            onChange={(e) => update("contractor", e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="NIT o cédula" hint="opcional">
          <input
            value={form.contractorId}
            onChange={(e) => update("contractorId", e.target.value)}
            className={`${inputClass} font-mono`}
          />
        </Field>
      </div>

      <Field label="Supervisor" hint="opcional">
        <input
          value={form.supervisor}
          onChange={(e) => update("supervisor", e.target.value)}
          className={inputClass}
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Valor inicial">
          <input
            required
            inputMode="decimal"
            value={form.initialValue}
            onChange={(e) => update("initialValue", e.target.value)}
            placeholder="10945259"
            className={`${inputClass} font-mono`}
          />
        </Field>

        <Field label="Anticipo" hint="opcional">
          <input
            inputMode="decimal"
            value={form.advanceValue}
            onChange={(e) => update("advanceValue", e.target.value)}
            className={`${inputClass} font-mono`}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Fecha de firma" hint="opcional">
          <input
            type="date"
            value={form.signatureDate}
            onChange={(e) => update("signatureDate", e.target.value)}
            className={`${inputClass} font-mono`}
          />
        </Field>

        <Field label="Fecha de inicio" hint="acta de inicio, opcional">
          <input
            type="date"
            value={form.startDate}
            onChange={(e) => update("startDate", e.target.value)}
            className={`${inputClass} font-mono`}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Terminación inicial" hint="antes de prórrogas, opcional">
          <input
            type="date"
            value={form.initialEndDate}
            onChange={(e) => update("initialEndDate", e.target.value)}
            className={`${inputClass} font-mono`}
          />
        </Field>

        <Field
          label="Plazo inicial en días"
          hint={termDaysIsDerived ? "calculado desde las fechas" : "opcional"}
        >
          <input
            inputMode="numeric"
            readOnly={termDaysIsDerived}
            value={termDaysValue}
            onChange={(e) => update("initialTermDays", e.target.value)}
            className={`${termDaysIsDerived ? readOnlyInputClass : inputClass} font-mono`}
          />
        </Field>
      </div>

      {invalidDateRange && (
        <p className="text-xs text-status-pendientes">
          La terminación inicial no es posterior a la fecha de inicio: el plazo no se puede
          calcular. Corrige las fechas o déjalas vacías para escribirlo a mano.
        </p>
      )}

      {error && (
        <p className="rounded-lg border border-status-atrasado-dim bg-status-atrasado-dim/40 px-3 py-2.5 text-sm text-status-atrasado">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3 border-t border-border pt-5">
        <button
          type="submit"
          disabled={submitting || catalogState !== "ready"}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-base transition-colors hover:bg-accent/80 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? submittingLabel : submitLabel}
        </button>
        <Link href="/" className="text-sm text-text-secondary hover:text-text-primary">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
