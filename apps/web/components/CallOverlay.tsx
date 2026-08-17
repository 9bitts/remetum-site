"use client";

import { useEffect, useRef, useState } from "react";
import {
  ConnectionState,
  Room,
  RoomEvent,
  Track,
  type LocalTrack,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
} from "livekit-client";
import type { CallAcceptedEvent, CallOfferEvent } from "@ebano/shared";
import { createRingtone } from "@/lib/ringtone";
import {
  getCallAudioContext,
  type CallMedia,
} from "@/lib/call-media";

export type CallUiState =
  | {
      phase: "outgoing";
      conversationId: string;
      callId: string | null;
      video: boolean;
      peerName: string;
      token: string | null;
      livekitUrl: string | null;
      roomName: string | null;
    }
  | {
      phase: "incoming";
      offer: CallOfferEvent;
    }
  | {
      phase: "active";
      accepted: CallAcceptedEvent;
      peerName: string;
    }
  | {
      phase: "error";
      message: string;
    };

type CameraFacing = "user" | "environment";

type RoomConnection = {
  callId: string;
  token: string;
  url: string;
  video: boolean;
};

function connectionOf(state: CallUiState | null): RoomConnection | null {
  if (!state) return null;
  if (state.phase === "outgoing" && state.token && state.livekitUrl && state.callId) {
    return {
      callId: state.callId,
      token: state.token,
      url: state.livekitUrl,
      video: state.video,
    };
  }
  if (state.phase === "active") {
    return {
      callId: state.accepted.callId,
      token: state.accepted.token,
      url: state.accepted.livekitUrl,
      video: state.accepted.video,
    };
  }
  return null;
}

function attachMediaElement(
  track: RemoteTrack | LocalTrack,
  parent: HTMLElement | null,
  className: string,
  muted = false,
) {
  const el = track.attach();
  el.autoplay = true;
  el.muted = muted;
  el.className = className;
  el.setAttribute("playsinline", "true");
  if (el instanceof HTMLVideoElement) el.playsInline = true;
  if (el instanceof HTMLAudioElement) el.volume = 1;
  parent?.appendChild(el);
  void el.play().catch(() => undefined);
  return el;
}

export function CallOverlay({
  state,
  localMedia,
  onAccept,
  onReject,
  onCancel,
  onHangup,
  onDismissError,
}: {
  state: CallUiState | null;
  localMedia: CallMedia | null;
  onAccept: () => void;
  onReject: () => void;
  onCancel: () => void;
  onHangup: () => void;
  onDismissError: () => void;
}) {
  const [connectError, setConnectError] = useState<string | null>(null);
  const [facing, setFacing] = useState<CameraFacing>("user");
  const [flipping, setFlipping] = useState(false);
  const [flipError, setFlipError] = useState<string | null>(null);
  const [micMuted, setMicMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [roomState, setRoomState] = useState<ConnectionState>(
    ConnectionState.Disconnected,
  );
  const [remoteCount, setRemoteCount] = useState(0);
  const localMediaRef = useRef(localMedia);
  localMediaRef.current = localMedia;
  const roomRef = useRef<Room | null>(null);
  const remoteStageRef = useRef<HTMLDivElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const connection = connectionOf(state);

  useEffect(() => {
    if (!localMedia?.video || !localVideoRef.current) return;
    localMedia.video.attach(localVideoRef.current);
    return () => {
      if (localVideoRef.current) localMedia.video?.detach(localVideoRef.current);
    };
  }, [localMedia, state?.phase]);

  useEffect(() => {
    if (!connection) {
      setConnectError(null);
      setFacing("user");
      setFlipError(null);
      setMicMuted(false);
      setCamOff(false);
      setRoomState(ConnectionState.Disconnected);
      setRemoteCount(0);
      return;
    }

    let cancelled = false;
    const audioContext = getCallAudioContext();
    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      webAudioMix: audioContext ? { audioContext } : true,
      audioCaptureDefaults: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      videoCaptureDefaults: {
        facingMode: "user",
      },
    });
    roomRef.current = room;

    function syncRemotes() {
      setRemoteCount(room.remoteParticipants.size);
    }

    function attachRemote(
      track: RemoteTrack,
      _publication: RemoteTrackPublication,
      _participant: RemoteParticipant,
    ) {
      const isVideo = track.kind === Track.Kind.Video;
      attachMediaElement(
        track,
        remoteStageRef.current,
        isVideo
          ? "h-full w-full min-h-0 object-cover"
          : "pointer-events-none absolute h-px w-px opacity-0",
        false,
      );
      syncRemotes();
    }

    function detachRemote(track: RemoteTrack) {
      for (const el of track.detach()) {
        el.remove();
      }
      syncRemotes();
    }

    room.on(RoomEvent.TrackSubscribed, attachRemote);
    room.on(RoomEvent.TrackUnsubscribed, detachRemote);
    room.on(RoomEvent.ParticipantConnected, syncRemotes);
    room.on(RoomEvent.ParticipantDisconnected, syncRemotes);
    room.on(RoomEvent.ConnectionStateChanged, (next) => {
      if (!cancelled) setRoomState(next);
    });
    room.on(RoomEvent.Disconnected, () => {
      if (!cancelled) {
        setRoomState(ConnectionState.Disconnected);
      }
    });
    room.on(RoomEvent.MediaDevicesError, (err) => {
      if (!cancelled) {
        setConnectError(
          err instanceof Error ? err.message : "Falha nos dispositivos de mídia",
        );
      }
    });

    void (async () => {
      try {
        await room.prepareConnection(connection.url, connection.token);
        if (cancelled) return;
        await room.connect(connection.url, connection.token);
        if (cancelled) {
          await room.disconnect(false);
          return;
        }

        const media = localMediaRef.current;
        const hasMic = room.localParticipant.getTrackPublication(
          Track.Source.Microphone,
        );
        if (media?.audio) {
          if (!hasMic) await room.localParticipant.publishTrack(media.audio);
        } else {
          try {
            await room.localParticipant.setMicrophoneEnabled(true);
          } catch (err) {
            if (!cancelled) {
              setConnectError(
                err instanceof Error
                  ? err.message
                  : "Não foi possível ligar o microfone",
              );
            }
            return;
          }
        }

        if (connection.video) {
          const hasCam = room.localParticipant.getTrackPublication(
            Track.Source.Camera,
          );
          if (media?.video) {
            if (!hasCam) await room.localParticipant.publishTrack(media.video);
            if (localVideoRef.current) media.video.attach(localVideoRef.current);
          } else if (!hasCam) {
            try {
              await room.localParticipant.setCameraEnabled(true, {
                facingMode: "user",
              });
              const localVideo = room.localParticipant.getTrackPublication(
                Track.Source.Camera,
              )?.videoTrack;
              if (localVideo && localVideoRef.current) {
                localVideo.attach(localVideoRef.current);
              }
            } catch {
              // continue without camera
            }
          }
        }

        syncRemotes();
        // Existing remote tracks arrive via TrackSubscribed after connect.
      } catch (err) {
        if (!cancelled) {
          setConnectError(
            err instanceof Error ? err.message : "Falha ao conectar à chamada",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      room.off(RoomEvent.TrackSubscribed, attachRemote);
      room.off(RoomEvent.TrackUnsubscribed, detachRemote);
      room.off(RoomEvent.ParticipantConnected, syncRemotes);
      room.off(RoomEvent.ParticipantDisconnected, syncRemotes);
      void room.disconnect(false);
      if (roomRef.current === room) roomRef.current = null;
    };
  }, [connection?.callId, connection?.token, connection?.url]);

  useEffect(() => {
    if (!state || (state.phase !== "outgoing" && state.phase !== "active")) {
      return;
    }
    let wake: WakeLockSentinel | null = null;
    const request = async () => {
      try {
        wake = await navigator.wakeLock?.request("screen");
      } catch {
        // unsupported
      }
    };
    void request();
    const onVis = () => {
      if (document.visibilityState === "visible") void request();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      void wake?.release();
    };
  }, [state?.phase]);

  const incomingCallId =
    state?.phase === "incoming" ? state.offer.callId : null;

  useEffect(() => {
    if (!incomingCallId) return;

    const ringtone = createRingtone();
    void ringtone.start();
    const vibrateId =
      typeof navigator !== "undefined" && "vibrate" in navigator
        ? window.setInterval(() => {
            navigator.vibrate?.([300, 140, 300]);
          }, 1600)
        : null;
    navigator.vibrate?.([300, 140, 300]);

    return () => {
      ringtone.stop();
      if (vibrateId) clearInterval(vibrateId);
      navigator.vibrate?.(0);
    };
  }, [incomingCallId]);

  async function flipCamera() {
    const room = roomRef.current;
    const next: CameraFacing = facing === "user" ? "environment" : "user";
    setFlipping(true);
    setFlipError(null);
    try {
      const videoTrack =
        localMedia?.video ??
        room?.localParticipant.getTrackPublication(Track.Source.Camera)
          ?.videoTrack;
      if (!videoTrack) {
        await room?.localParticipant.setCameraEnabled(true, { facingMode: next });
        setFacing(next);
        return;
      }
      const devices = await Room.getLocalDevices("videoinput");
      const currentId = videoTrack.mediaStreamTrack.getSettings().deviceId;
      const byLabel = devices.find((d) => {
        const label = d.label.toLowerCase();
        return next === "user"
          ? /front|user|facing|frontal|frente/.test(label)
          : /back|rear|environment|traseira|posterior/.test(label);
      });
      const other = devices.find((d) => d.deviceId && d.deviceId !== currentId);
      const options = byLabel?.deviceId
        ? { deviceId: byLabel.deviceId }
        : other?.deviceId
          ? { deviceId: other.deviceId }
          : { facingMode: next };

      await videoTrack.restartTrack(options);
      if (localVideoRef.current) videoTrack.attach(localVideoRef.current);
      if (room?.options.videoCaptureDefaults) {
        room.options.videoCaptureDefaults.facingMode = next;
      }
      setFacing(next);
    } catch {
      setFlipError("Não foi possível virar a câmera neste aparelho");
    } finally {
      setFlipping(false);
    }
  }

  async function toggleMic() {
    const room = roomRef.current;
    const next = !micMuted;
    try {
      if (localMedia?.audio) {
        if (next) await localMedia.audio.mute();
        else await localMedia.audio.unmute();
      } else {
        await room?.localParticipant.setMicrophoneEnabled(!next);
      }
      setMicMuted(next);
    } catch {
      // ignore
    }
  }

  async function toggleCam() {
    const room = roomRef.current;
    const next = !camOff;
    try {
      if (localMedia?.video) {
        if (next) await localMedia.video.mute();
        else await localMedia.video.unmute();
      } else {
        await room?.localParticipant.setCameraEnabled(!next);
      }
      setCamOff(next);
    } catch {
      // ignore
    }
  }

  if (!state) return null;

  if (state.phase === "error") {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-6">
        <div className="w-full max-w-sm rounded-[var(--radius-ebano)] border border-white/10 bg-[#121214] p-6 text-center shadow-2xl">
          <p className="text-xs tracking-[0.2em] text-[#C9A227] uppercase">
            Chamada
          </p>
          <p className="mt-3 text-sm text-red-300">{state.message}</p>
          <button
            type="button"
            onClick={onDismissError}
            className="mt-5 rounded-xl bg-[#C9A227] px-4 py-2 text-sm font-medium text-[#0B0B0D]"
          >
            Fechar
          </button>
        </div>
      </div>
    );
  }

  if (state.phase === "incoming") {
    const peerName = state.offer.fromName;
    const video = state.offer.video;

    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-gradient-to-b from-[#1a1610] via-[#0B0B0D] to-[#0B0B0D] p-6">
        <div className="w-full max-w-sm text-center">
          <p className="text-xs tracking-[0.25em] text-[#C9A227] uppercase">
            Remetum
          </p>
          <div className="mx-auto mt-8 flex h-28 w-28 items-center justify-center rounded-full bg-[#C9A227]/15 ring-1 ring-[#C9A227]/40">
            <span className="text-3xl font-semibold text-[#C9A227]">
              {peerName
                .split(/\s+/)
                .slice(0, 2)
                .map((p) => p[0]?.toUpperCase() ?? "")
                .join("") || "?"}
            </span>
          </div>
          <h2 className="mt-6 text-2xl font-semibold text-[#F2F2F0]">
            {peerName}
          </h2>
          <p className="mt-2 text-sm text-[#9A9A9E]">
            Chamada recebida · {video ? "Vídeo" : "Voz"}
          </p>
          <div className="mt-10 flex items-center justify-center gap-6">
            <button
              type="button"
              onClick={onReject}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500/90 text-white shadow-lg"
              aria-label="Recusar"
            >
              ✕
            </button>
            <button
              type="button"
              onClick={onAccept}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg"
              aria-label="Aceitar"
            >
              ✓
            </button>
          </div>
        </div>
      </div>
    );
  }

  const video =
    state.phase === "active" ? state.accepted.video : state.video;
  const peerName = state.peerName;
  const ringing = state.phase === "outgoing";
  const statusLabel = ringing
    ? "Chamando…"
    : roomState === ConnectionState.Reconnecting
      ? "Reconectando…"
      : roomState === ConnectionState.Connecting
        ? "Conectando…"
        : remoteCount > 0
          ? "Em chamada"
          : "Aguardando…";

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#0B0B0D]">
      <div className="relative flex-1 overflow-hidden">
        {video ? (
          <div
            ref={remoteStageRef}
            className={`h-full w-full bg-black ${
              remoteCount > 1 ? "grid grid-cols-2 gap-1" : ""
            }`}
          />
        ) : (
          <>
            <div
              ref={remoteStageRef}
              className="pointer-events-none absolute inset-0 overflow-hidden"
            />
            <div className="flex h-full flex-col items-center justify-center bg-gradient-to-b from-[#1a1610] to-[#0B0B0D]">
              <div className="flex h-32 w-32 items-center justify-center rounded-full bg-[#C9A227]/15 ring-1 ring-[#C9A227]/40">
                <span className="text-4xl font-semibold text-[#C9A227]">
                  {peerName
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((p) => p[0]?.toUpperCase() ?? "")
                    .join("") || "?"}
                </span>
              </div>
              <p className="mt-4 text-lg text-[#F2F2F0]">{peerName}</p>
              <p className="mt-1 text-sm text-[#9A9A9E]">{statusLabel}</p>
            </div>
          </>
        )}
        {video ? (
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className={`absolute right-4 bottom-4 h-36 w-28 rounded-xl border border-white/10 object-cover shadow-xl ${
              facing === "user" && !camOff ? "-scale-x-100" : ""
            } ${camOff ? "hidden" : ""}`}
          />
        ) : null}
        {video && remoteCount === 0 ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p className="rounded-full bg-black/50 px-4 py-2 text-sm text-[#F2F2F0]">
              {statusLabel}
            </p>
          </div>
        ) : null}
      </div>

      <div className="border-t border-white/5 px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs tracking-[0.2em] text-[#C9A227] uppercase">
              Remetum
            </p>
            <p className="truncate text-sm text-[#F2F2F0]">{peerName}</p>
            <p className="text-xs text-[#9A9A9E]">{statusLabel}</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => void toggleMic()}
              className={`rounded-xl border px-3 py-2.5 text-sm ${
                micMuted
                  ? "border-red-400/70 text-red-300"
                  : "border-white/15 text-[#F2F2F0]"
              }`}
            >
              {micMuted ? "Mic off" : "Mic"}
            </button>
            {video ? (
              <>
                <button
                  type="button"
                  onClick={() => void toggleCam()}
                  className={`rounded-xl border px-3 py-2.5 text-sm ${
                    camOff
                      ? "border-red-400/70 text-red-300"
                      : "border-white/15 text-[#F2F2F0]"
                  }`}
                >
                  {camOff ? "Câm. off" : "Câmera"}
                </button>
                <button
                  type="button"
                  disabled={flipping || camOff}
                  onClick={() => void flipCamera()}
                  className="rounded-xl border border-[#C9A227]/70 px-3 py-2.5 text-sm font-medium text-[#C9A227] hover:bg-[#C9A227] hover:text-[#0B0B0D] disabled:opacity-60"
                >
                  {flipping ? "Trocando…" : "Virar"}
                </button>
              </>
            ) : null}
            <button
              type="button"
              onClick={ringing ? onCancel : onHangup}
              className="rounded-xl bg-red-500 px-5 py-2.5 text-sm font-medium text-white"
            >
              {ringing ? "Cancelar" : "Encerrar"}
            </button>
          </div>
        </div>
        {flipError ? (
          <p className="mt-2 text-right text-xs text-red-300">{flipError}</p>
        ) : null}
      </div>

      {connectError ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-6">
          <div className="w-full max-w-sm rounded-[var(--radius-ebano)] border border-white/10 bg-[#121214] p-6 text-center">
            <p className="text-sm text-red-300">{connectError}</p>
            <button
              type="button"
              onClick={ringing ? onCancel : onHangup}
              className="mt-4 rounded-xl bg-[#C9A227] px-4 py-2 text-sm font-medium text-[#0B0B0D]"
            >
              Fechar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
