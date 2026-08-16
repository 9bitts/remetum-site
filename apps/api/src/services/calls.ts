import { randomBytes } from "node:crypto";
import { getRedis } from "../redis.js";

export type CallStatus = "ringing" | "active" | "ended";

export type CallRecord = {
  conversationId: string;
  fromUserId: string;
  fromName: string;
  video: boolean;
  roomName: string;
  status: CallStatus;
  participantIds: string[];
  ringingIds: string[];
  joinedIds: string[];
  startedAt: string | null;
  group: boolean;
};

const memory = new Map<string, CallRecord>();
const ringTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
const RING_TIMEOUT_MS = 45_000;
const CALL_KEY = "remetum:call:";
const CALL_INDEX = "remetum:calls";

function clone(record: CallRecord): CallRecord {
  return {
    ...record,
    participantIds: [...record.participantIds],
    ringingIds: [...record.ringingIds],
    joinedIds: [...record.joinedIds],
  };
}

async function persist(callId: string, record: CallRecord) {
  memory.set(callId, record);
  const redis = await getRedis();
  if (!redis) return;
  try {
    await redis
      .multi()
      .set(`${CALL_KEY}${callId}`, JSON.stringify(record), "EX", 60 * 30)
      .sadd(CALL_INDEX, callId)
      .exec();
  } catch (err) {
    console.error("[calls] redis persist failed", err);
  }
}

async function removeStored(callId: string) {
  memory.delete(callId);
  const redis = await getRedis();
  if (!redis) return;
  try {
    await redis.multi().del(`${CALL_KEY}${callId}`).srem(CALL_INDEX, callId).exec();
  } catch (err) {
    console.error("[calls] redis remove failed", err);
  }
}

export function clearRingTimeout(callId: string) {
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
      void (async () => {
        const call = await getCall(callId);
        if (call?.status === "ringing") onTimeout();
      })();
    }, RING_TIMEOUT_MS),
  );
}

export async function createCall(input: {
  conversationId: string;
  fromUserId: string;
  fromName: string;
  video: boolean;
  participantIds: string[];
  group: boolean;
}) {
  const callId = randomBytes(12).toString("hex");
  const participantIds = [...new Set(input.participantIds)];
  const record: CallRecord = {
    conversationId: input.conversationId,
    fromUserId: input.fromUserId,
    fromName: input.fromName,
    video: input.video,
    roomName: `call_${callId}`,
    status: "ringing",
    participantIds,
    ringingIds: participantIds.filter((id) => id !== input.fromUserId),
    joinedIds: [input.fromUserId],
    startedAt: null,
    group: input.group,
  };
  await persist(callId, record);
  return { callId, ...clone(record) };
}

export async function getCall(callId: string) {
  const local = memory.get(callId);
  if (local) return clone(local);
  const redis = await getRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get(`${CALL_KEY}${callId}`);
    if (!raw) return null;
    const record = JSON.parse(raw) as CallRecord;
    memory.set(callId, record);
    return clone(record);
  } catch {
    return null;
  }
}

export async function listCalls() {
  const redis = await getRedis();
  if (!redis) {
    return [...memory.entries()].map(([callId, record]) => ({
      callId,
      ...clone(record),
    }));
  }
  try {
    const ids = await redis.smembers(CALL_INDEX);
    const found: Array<{ callId: string } & CallRecord> = [];
    for (const callId of ids) {
      const call = await getCall(callId);
      if (call) found.push({ callId, ...call });
    }
    return found;
  } catch {
    return [...memory.entries()].map(([callId, record]) => ({
      callId,
      ...clone(record),
    }));
  }
}

export async function getRingingCallsForCallee(userId: string) {
  const all = await listCalls();
  return all.filter(
    (call) => call.status === "ringing" && call.ringingIds.includes(userId),
  );
}

export async function patchCall(
  callId: string,
  patch: Partial<CallRecord>,
) {
  const current = await getCall(callId);
  if (!current) return null;
  if (patch.status && patch.status !== "ringing") clearRingTimeout(callId);
  if (patch.status === "ended") {
    await removeStored(callId);
    return { ...current, ...patch, status: "ended" as const };
  }
  const next = { ...current, ...patch };
  await persist(callId, next);
  return clone(next);
}

export async function endCall(callId: string) {
  return patchCall(callId, { status: "ended" });
}

export function isCallMember(call: CallRecord, userId: string) {
  return call.participantIds.includes(userId);
}

export function callDurationMs(call: CallRecord) {
  if (!call.startedAt) return null;
  return Math.max(0, Date.now() - new Date(call.startedAt).getTime());
}
