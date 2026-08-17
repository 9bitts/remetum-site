import { MAX_UPLOAD_BYTES, uploadTooLargeMessage } from "./upload";

export type IncomingShare =
  | { kind: "text"; text: string }
  | { kind: "file"; file: File };

type NativePayload = {
  kind?: string;
  text?: string;
  message?: string;
  filename?: string;
  mimeType?: string;
  size?: number;
  id?: number;
  data?: string;
  next?: number;
  done?: boolean;
};

type NativePlugin = {
  getPending: () => Promise<NativePayload>;
  readChunk: (opts: { offset: number }) => Promise<NativePayload>;
  discard: () => Promise<void>;
  addListener?: (
    event: string,
    cb: (data: NativePayload) => void,
  ) => Promise<{ remove: () => Promise<void> }> | { remove: () => Promise<void> | void };
};

const SHARE_CACHE = "remetum-share-target-v1";
const SHARE_FILE = "/__share-target/file";
const SHARE_TEXT = "/__share-target/text";

function nativePlugin(): NativePlugin | null {
  if (typeof window === "undefined") return null;
  const cap = (
    window as unknown as {
      Capacitor?: {
        isNativePlatform?: () => boolean;
        Plugins?: { IncomingShare?: NativePlugin };
        registerPlugin?: (name: string) => NativePlugin;
      };
    }
  ).Capacitor;
  if (!cap?.isNativePlatform?.()) return null;
  return cap.Plugins?.IncomingShare ?? cap.registerPlugin?.("IncomingShare") ?? null;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function bytesFromBase64(b64: string) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function concatChunks(chunks: Uint8Array[]) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

async function fileFromNative(plugin: NativePlugin, meta: NativePayload): Promise<File> {
  const size = meta.size ?? 0;
  if (size > MAX_UPLOAD_BYTES) {
    throw new Error(uploadTooLargeMessage(size));
  }
  const chunks: Uint8Array[] = [];
  let offset = 0;
  while (true) {
    const part = await plugin.readChunk({ offset });
    if (!part.data) break;
    const bytes = bytesFromBase64(part.data);
    chunks.push(bytes);
    offset = part.next ?? offset + bytes.length;
    if (part.done || offset >= size) break;
  }
  const bytes = concatChunks(chunks);
  const blob = new Blob([bytes.buffer]);
  const filename = meta.filename || "arquivo";
  const mime = meta.mimeType || "application/octet-stream";
  return new File([blob], filename, { type: mime });
}

async function parseNative(plugin: NativePlugin, data: NativePayload | undefined): Promise<IncomingShare | null> {
  if (!data || !data.kind || data.kind === "none") return null;
  if (data.kind === "error") {
    throw new Error(data.message || "Falha ao receber arquivo");
  }
  if (data.kind === "text" && data.text?.trim()) {
    return { kind: "text", text: data.text.trim() };
  }
  if (data.kind === "file") {
    return { kind: "file", file: await fileFromNative(plugin, data) };
  }
  return null;
}

async function consumeNative(): Promise<IncomingShare | null> {
  const plugin = nativePlugin();
  if (!plugin) return null;
  let data = await plugin.getPending();
  for (let i = 0; i < 40 && data?.kind === "busy"; i += 1) {
    await sleep(200);
    data = await plugin.getPending();
  }
  if (data?.kind === "busy") {
    throw new Error("Arquivo ainda está sendo preparado");
  }
  try {
    return await parseNative(plugin, data);
  } catch (err) {
    try {
      await plugin.discard();
    } catch {
      // ignore
    }
    throw err;
  }
}

async function consumePwaCache(): Promise<IncomingShare | null> {
  if (typeof caches === "undefined") return null;
  const cache = await caches.open(SHARE_CACHE);
  const fileRes = await cache.match(SHARE_FILE);
  if (fileRes) {
    await cache.delete(SHARE_FILE);
    await cache.delete(SHARE_TEXT);
    const blob = await fileRes.blob();
    if (blob.size > MAX_UPLOAD_BYTES) {
      throw new Error(uploadTooLargeMessage(blob.size));
    }
    const encoded = fileRes.headers.get("X-Filename");
    let filename = "arquivo";
    try {
      filename = encoded ? decodeURIComponent(encoded) : "arquivo";
    } catch {
      filename = encoded || "arquivo";
    }
    const type = fileRes.headers.get("Content-Type") || blob.type || "application/octet-stream";
    return { kind: "file", file: new File([blob], filename, { type }) };
  }
  const textRes = await cache.match(SHARE_TEXT);
  if (textRes) {
    await cache.delete(SHARE_TEXT);
    const text = (await textRes.text()).trim();
    if (!text) return null;
    return { kind: "text", text };
  }
  return null;
}

export async function consumeIncomingShare(): Promise<IncomingShare | null> {
  const native = await consumeNative();
  if (native) return native;
  return consumePwaCache();
}

export function subscribeIncomingShare(
  onShare: (share: IncomingShare) => void,
  onError: (message: string) => void,
): () => void {
  const plugin = nativePlugin();
  if (!plugin?.addListener) return () => undefined;
  let active = true;
  const handle = plugin.addListener("shareReceived", () => {
    if (!active) return;
    void consumeIncomingShare()
      .then((share) => {
        if (share && active) onShare(share);
      })
      .catch((err) => {
        onError(err instanceof Error ? err.message : "Falha ao receber arquivo");
      });
  });
  return () => {
    active = false;
    void Promise.resolve(handle).then((listener) => listener.remove());
  };
}

export async function discardIncomingShare() {
  try {
    await nativePlugin()?.discard();
  } catch {
    // ignore
  }
  try {
    if (typeof caches === "undefined") return;
    const cache = await caches.open(SHARE_CACHE);
    await cache.delete(SHARE_FILE);
    await cache.delete(SHARE_TEXT);
  } catch {
    // ignore
  }
}

export function incomingShareLabel(share: IncomingShare) {
  if (share.kind === "text") {
    const text = share.text.replace(/\s+/g, " ").trim();
    return text.length > 80 ? `${text.slice(0, 77)}…` : text;
  }
  return share.file.name || "Arquivo";
}
