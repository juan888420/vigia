import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ApiError, getContract, listEvents } from "@/lib/api";
import { EMPTY_EVENT_FORM, nextSequenceForType } from "@/lib/event-form";
import { NewEventForm } from "./NewEventForm";

export const dynamic = "force-dynamic";

export default async function NuevoEventoPage({ params }: { params: { id: string } }) {
  let contract;
  let events;
  try {
    [contract, events] = await Promise.all([getContract(params.id), listEvents(params.id)]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  return (
    <div className="mx-auto max-w-2xl px-8 py-10">
      <Link
        href={`/contratos/${contract.id}/eventos`}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Eventos de {contract.number}
      </Link>

      <h1 className="text-lg font-medium text-text-primary">Nuevo evento</h1>
      <p className="mt-1 text-sm text-text-secondary">
        Los campos cambian según el tipo de acto que registres.
      </p>

      <NewEventForm
        contractId={contract.id}
        events={events}
        initialValues={{
          ...EMPTY_EVENT_FORM,
          sequenceNumber: nextSequenceForType(events, EMPTY_EVENT_FORM.type),
        }}
      />
    </div>
  );
}
