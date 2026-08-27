"use client";

import { createEvent, type ContractEvent, type EventPayload } from "@/lib/api";
import { EventForm } from "@/components/EventForm";
import type { EventFormValues } from "@/lib/event-form";

export function NewEventForm({
  contractId,
  events,
  initialValues,
}: {
  contractId: string;
  events: ContractEvent[];
  initialValues: EventFormValues;
}) {
  return (
    <EventForm
      initialValues={initialValues}
      events={events}
      submitLabel="Guardar evento"
      submittingLabel="Guardando..."
      backHref={`/contratos/${contractId}/eventos`}
      onSubmit={(payload: EventPayload) => createEvent(contractId, payload)}
    />
  );
}
