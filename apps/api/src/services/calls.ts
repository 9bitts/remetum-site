import { randomBytes } from "node:crypto";

export type CallStatus = "ringing" | "active" | "ended";

export type CallRecord = {
  conversationId: string;
  fromUserId: string;
  toUserId: string;
  fromName: string;
  video: boolean;
  roomName: string;
  status: CallStatus;
};

const calls = new Map<string, CallRecord>();
const ringTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
const RING_TIMEOUT_MS = 45_000;

function clearRingTimeout(callId: string) {
  const timer = ringTimeouts.get(callId);
  if (timer) clearTimeout(timer);
  ringTimeouts.delete(callId);
}

export function scheduleRingTimeout(callId: string, onTimeout: () => void) {
  clearRingTimeout(callId);
  ringTimeouts.set(
    callId,
    setTimeout(() => {
      ringTimeouts.delete(callId);
      const call = calls.get(callId);
      if (call?.status === "ringing") onTimeout();
    }, RING_TIMEOUT_MS),
  );
}

export function createCall(input: {
  conversationId: string;
  fromUserId: string;
  toUserId: string;
  fromName: string;
  video: boolean;
}) {
  const callId = randomBytes(12).toString("hex");
  const roomName = `call_${callId}`;
  const record: CallRecord = {
    conversationId: input.conversationId,
    fromUserId: input.fromUserId,
    toUserId: input.toUserId,
    fromName: input.fromName,
    video: input.video,
    roomName,
    status: "ringing",
  };
  calls.set(callId, record);
  return { callId, ...record };
}

export function getCall(callId: string) {
  return calls.get(callId) ?? null;
}

export function getRingingCallsForCallee(userId: string) {
  const pending: Array<{ callId: string } & CallRecord> = [];
  for (const [callId, call] of calls) {
    if (call.status === "ringing" && call.toUserId === userId) {
      pending.push({ callId, ...call });
    }
  }
  return pending;
}

export function setCallStatus(callId: string, status: CallStatus) {
  const call = calls.get(callId);
  if (!call) return null;
  if (status !== "ringing") clearRingTimeout(callId);
  call.status = status;
  if (status === "ended") {
    calls.delete(callId);
  }
  return call;
}

export function endCall(callId: string) {
  return setCallStatus(callId, "ended");
}
