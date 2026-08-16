export type CallMessageEvent =
  | "missed"
  | "rejected"
  | "cancelled"
  | "ended"
  | "unavailable";

export type CallMessagePayload = {
  event: CallMessageEvent;
  video: boolean;
};

export function encodeCallMessage(payload: CallMessagePayload): string {
  return JSON.stringify(payload);
}

export function parseCallMessage(
  content: string | null | undefined,
): CallMessagePayload | null {
  if (!content) return null;
  try {
    const parsed = JSON.parse(content) as Partial<CallMessagePayload>;
    if (
      parsed.event !== "missed" &&
      parsed.event !== "rejected" &&
      parsed.event !== "cancelled" &&
      parsed.event !== "ended" &&
      parsed.event !== "unavailable"
    ) {
      return null;
    }
    return { event: parsed.event, video: Boolean(parsed.video) };
  } catch {
    return null;
  }
}

export function formatCallMessage(
  payload: CallMessagePayload | null,
  durationMs?: number | null,
): string {
  if (!payload) return "Chamada";
  const kind = payload.video ? "vídeo" : "voz";
  if (payload.event === "ended") {
    if (durationMs && durationMs >= 1000) {
      const totalSec = Math.round(durationMs / 1000);
      const min = Math.floor(totalSec / 60);
      const sec = String(totalSec % 60).padStart(2, "0");
      return `Chamada de ${kind} · ${min}:${sec}`;
    }
    return `Chamada de ${kind} encerrada`;
  }
  if (payload.event === "rejected") return `Chamada de ${kind} recusada`;
  if (payload.event === "cancelled") return `Chamada de ${kind} cancelada`;
  return `Chamada de ${kind} perdida`;
}
