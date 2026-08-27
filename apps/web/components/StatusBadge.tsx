import type { EstadoContrato } from "@/lib/mock-data";

const config: Record<EstadoContrato, { label: string; dot: string; text: string; bg: string }> = {
  al_dia: {
    label: "Al día",
    dot: "bg-status-al-dia",
    text: "text-status-al-dia",
    bg: "bg-status-al-dia-dim",
  },
  con_pendientes: {
    label: "Con pendientes",
    dot: "bg-status-pendientes",
    text: "text-status-pendientes",
    bg: "bg-status-pendientes-dim",
  },
  atrasado: {
    label: "Atrasado",
    dot: "bg-status-atrasado",
    text: "text-status-atrasado",
    bg: "bg-status-atrasado-dim",
  },
};

export function StatusBadge({ estado }: { estado: EstadoContrato }) {
  const c = config[estado];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${c.bg} ${c.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}
