import { io, type Socket } from "socket.io-client";
import { API_URL, SOCKET_URL } from "./config";

let socket: Socket | null = null;
let reconnectHooked = false;
let refreshInFlight: Promise<boolean> | null = null;

async function refreshForSocket(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

export function getSocket() {
  if (!socket) {
    socket = io(SOCKET_URL, {
      withCredentials: true,
      autoConnect: false,
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 800,
      reconnectionDelayMax: 8000,
    });
  }
  return socket;
}

function ensureReconnectAuth(s: Socket) {
  if (reconnectHooked) return;
  reconnectHooked = true;
  s.on("connect_error", () => {
    void refreshForSocket().then((ok) => {
      if (ok && !s.connected) s.connect();
    });
  });
}

export function connectSocket() {
  const s = getSocket();
  ensureReconnectAuth(s);
  if (!s.connected) s.connect();
  return s;
}

export function disconnectSocket() {
  if (socket?.connected) socket.disconnect();
}
