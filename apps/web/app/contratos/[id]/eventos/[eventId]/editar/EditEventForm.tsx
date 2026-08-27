"use client";

import { updateEvent, type ContractEvent, type EventPayload } from "@/lib/api";
import { EventForm } from "@/components/EventForm";
import type { EventFormValues } from "@/lib/event-form";

export function EditEventForm({
  eventId,
  contractId,
  events,
  currentEvent,
  initialValues,
}: {
  eventId: string;
  contractId: string;
  events: ContractEvent[];
  currentEvent: ContractEvent;
  initialValues: EventFormValues;
}) {
  return (
    <EventForm
      initialValues={initialValues}
      events={events}
      currentEvent={currentEvent}
      submitLabel="Guardar cambios"
      submittingLabel="Guardando..."
      backHref={`/contratos/${contractId}/eventos`}
      onSubmit={(payload: EventPayload) => updateEvent(eventId, payload)}
    />
  );
}
