import type { ContractEvent, EventPayload, EventType } from "./api";

// Módulo neutro (sin "use client"), igual que contract-form y payment-form.

export const EVENT_TYPE_OPTIONS: { value: EventType; label: string }[] = [
  { value: "AMENDMENT", label: "Otrosí" },
  { value: "ADDITION", label: "Adición" },
  { value: "EXTENSION", label: "Prórroga" },
  { value: "SUSPENSION", label: "Suspensión" },
  { value: "RESUMPTION", label: "Reinicio" },
  { value: "TERMINATION", label: "Terminación" },
  { value: "LIQUIDATION", label: "Liquidación" },
];

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  AMENDMENT: "Otrosí",
  ADDITION: "Adición",
  EXTENSION: "Prórroga",
  SUSPENSION: "Suspensión",
  RESUMPTION: "Reinicio",
  TERMINATION: "Terminación",
  LIQUIDATION: "Liquidación",
};

/**
 * Qué campos tiene sentido pedir según el tipo. El API acepta todos los campos
 * para cualquier tipo — la restricción es de formulario, no de validación:
 * pedirle `daysDelta` a una liquidación solo invita a llenarlo con ruido.
 *
 * `endDate` no aparece nunca: lo escribe el API cuando se crea el reinicio.
 */
export interface EventFieldVisibility {
  sequenceNumber: boolean;
  valueDelta: boolean;
  daysDelta: boolean;
  startDate: boolean;
  relatedEvent: boolean;
  description: boolean;
}

export function fieldsForType(type: EventType): EventFieldVisibility {
  switch (type) {
    case "AMENDMENT":
      // Un otrosí puede tocar valor, plazo o ambos.
      return { sequenceNumber: true, valueDelta: true, daysDelta: true, startDate: false, relatedEvent: false, description: true };
    case "ADDITION":
      return { sequenceNumber: true, valueDelta: true, daysDelta: false, startDate: false, relatedEvent: false, description: true };
    case "EXTENSION":
      return { sequenceNumber: true, valueDelta: false, daysDelta: true, startDate: false, relatedEvent: false, description: true };
    case "SUSPENSION":
      return { sequenceNumber: true, valueDelta: false, daysDelta: false, startDate: true, relatedEvent: false, description: true };
    case "RESUMPTION":
      return { sequenceNumber: false, valueDelta: false, daysDelta: false, startDate: false, relatedEvent: true, description: true };
    case "TERMINATION":
    case "LIQUIDATION":
      // Actos únicos: no se numeran.
      return { sequenceNumber: false, valueDelta: false, daysDelta: false, startDate: false, relatedEvent: false, description: true };
  }
}

export interface EventFormValues {
  type: EventType;
  sequenceNumber: string;
  eventDate: string;
  valueDelta: string;
  daysDelta: string;
  startDate: string;
  relatedEventId: string;
  description: string;
}

export const EMPTY_EVENT_FORM: EventFormValues = {
  type: "AMENDMENT",
  sequenceNumber: "",
  eventDate: "",
  valueDelta: "",
  daysDelta: "",
  startDate: "",
  relatedEventId: "",
  description: "",
};

function nullIfEmpty(value: string) {
  return value.trim() === "" ? null : value.trim();
}

/**
 * Solo se envían los campos que el tipo elegido admite: si alguien escribe un
 * valor, cambia el tipo y guarda, ese dato no debe colarse en la base.
 * Los montos viajan como string crudo, sin separadores de miles.
 */
export function toEventPayload(form: EventFormValues): EventPayload {
  const fields = fieldsForType(form.type);
  return {
    type: form.type,
    sequenceNumber:
      fields.sequenceNumber && form.sequenceNumber.trim() !== ""
        ? Number(form.sequenceNumber)
        : null,
    eventDate: form.eventDate,
    valueDelta: fields.valueDelta ? nullIfEmpty(form.valueDelta) : null,
    daysDelta:
      fields.daysDelta && form.daysDelta.trim() !== "" ? Number(form.daysDelta) : null,
    startDate: fields.startDate ? nullIfEmpty(form.startDate) : null,
    relatedEventId: fields.relatedEvent ? nullIfEmpty(form.relatedEventId) : null,
    description: nullIfEmpty(form.description),
  };
}

export function eventToFormValues(event: ContractEvent): EventFormValues {
  return {
    type: event.type,
    sequenceNumber: event.sequenceNumber === null ? "" : String(event.sequenceNumber),
    eventDate: event.eventDate,
    valueDelta: event.valueDelta ?? "",
    daysDelta: event.daysDelta === null ? "" : String(event.daysDelta),
    startDate: event.startDate ?? "",
    relatedEventId: event.relatedEventId ?? "",
    description: event.description ?? "",
  };
}

/** Nombre legible de un evento: "Otrosí 1", "Terminación". */
export function eventLabel(event: ContractEvent): string {
  const base = EVENT_TYPE_LABELS[event.type];
  return event.sequenceNumber === null ? base : `${base} ${event.sequenceNumber}`;
}

/** Siguiente número libre dentro del mismo tipo. La numeración corre por
 *  separado en cada tipo, así que Prórroga 1 y Suspensión 1 conviven. */
export function nextSequenceForType(events: ContractEvent[], type: EventType): string {
  const highest = events
    .filter((e) => e.type === type)
    .reduce((max, e) => Math.max(max, e.sequenceNumber ?? 0), 0);
  return String(highest + 1);
}

/**
 * Suspensiones que todavía puede reanudar este reinicio: las que no tienen ya
 * otro RESUMPTION apuntándolas. `currentEventId` excluye al propio evento en
 * edición, para que su suspensión actual siga siendo elegible.
 */
export function resumableSuspensions(
  events: ContractEvent[],
  currentEventId?: string,
): ContractEvent[] {
  const taken = new Set(
    events
      .filter((e) => e.type === "RESUMPTION" && e.id !== currentEventId && e.relatedEventId)
      .map((e) => e.relatedEventId as string),
  );
  return events.filter((e) => e.type === "SUSPENSION" && !taken.has(e.id));
}

/** Eventos que una póliza puede amparar. Una terminación o una liquidación no
 *  se amparan: no modifican valor ni plazo. */
export function insurableEvents(events: ContractEvent[]): ContractEvent[] {
  return events.filter(
    (e) => e.type === "AMENDMENT" || e.type === "ADDITION" || e.type === "EXTENSION",
  );
}
