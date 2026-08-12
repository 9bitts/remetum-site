import { randomBytes } from "node:crypto";

export type CallStatus = "ringing" | "active" | "ended";

export type CallRecord = {
  conversationId: string;
  fromUserId: string;
  toUserId: string;
  video: boolean;
  roomName: string;
  status: CallStatus;
};

const calls = new Map<string, CallRecord>();

export function createCall(input: {
  conversationId: string;
  fromUserId: string;
  toUserId: string;
  video: boolean;
}) {
  const callId = randomBytes(12).toString("hex");
  const roomName = `call_${callId}`;
  const record: CallRecord = {
    conversationId: input.conversationId,
    fromUserId: input.fromUserId,
    toUserId: input.toUserId,
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

export function setCallStatus(callId: string, status: CallStatus) {
  const call = calls.get(callId);
  if (!call) return null;
  call.status = status;
  if (status === "ended") {
    calls.delete(callId);
  }
  return call;
}

export function endCall(callId: string) {
  return setCallStatus(callId, "ended");
}
