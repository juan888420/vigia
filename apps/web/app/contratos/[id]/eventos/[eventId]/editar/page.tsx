import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ApiError, getContract, getEvent, listEvents } from "@/lib/api";
import { eventLabel, eventToFormValues } from "@/lib/event-form";
import { EditEventForm } from "./EditEventForm";

export const dynamic = "force-dynamic";

export default async function EditarEventoPage({
  params,
}: {
  params: { id: string; eventId: string };
}) {
  let contract;
  let event;
  let events;
  try {
    [contract, event, events] = await Promise.all([
      getContract(params.id),
      getEvent(params.eventId),
      listEvents(params.id),
    ]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  // Un evento de otro contrato no se edita desde esta URL: la ruta estaría
  // mintiendo sobre a qué expediente pertenece.
  if (event.contractId !== contract.id) notFound();

  return (
    <div className="mx-auto max-w-2xl px-8 py-10">
      <Link
        href={`/contratos/${contract.id}/eventos`}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Eventos de {contract.number}
      </Link>

      <h1 className="text-lg font-medium text-text-primary">Editar evento</h1>
      <p className="mt-1 font-mono text-sm text-text-secondary">
        {contract.number} · {eventLabel(event)}
      </p>

      <EditEventForm
        eventId={event.id}
        contractId={contract.id}
        events={events}
        currentEvent={event}
        initialValues={eventToFormValues(event)}
      />
    </div>
  );
}
