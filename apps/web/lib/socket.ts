import { io, type Socket } from "socket.io-client";
import { API_URL } from "./config";

let socket: Socket | null = null;

export function getSocket() {
  if (!socket) {
    socket = io(API_URL, {
      withCredentials: true,
      autoConnect: false,
      transports: ["websocket", "polling"],
    });
  }
  return socket;
}

export function connectSocket() {
  const s = getSocket();
  if (!s.connected) s.connect();
  return s;
}

export function disconnectSocket() {
  if (socket?.connected) socket.disconnect();
}
