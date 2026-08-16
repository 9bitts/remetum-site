"use client";

import { useEffect, useRef, useState } from "react";
import {
  Room,
  RoomEvent,
  Track,
  type RemoteTrack,
  type RemoteTrackPublication,
  type RemoteParticipant,
} from "livekit-client";
import type { CallAcceptedEvent, CallOfferEvent } from "@ebano/shared";
import { createRingtone } from "@/lib/ringtone";

export type CallUiState =
  | {
      phase: "outgoing";
      conversationId: string;
      callId: string | null;
      video: boolean;
      peerName: string;
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

function attachLocalCamera(room: Room, el: HTMLVideoElement | null) {
  const localVideo = room.localParticipant.getTrackPublication(
    Track.Source.Camera,
  )?.videoTrack;
  if (localVideo && el) localVideo.attach(el);
}

export function CallOverlay({
  state,
  onAccept,
  onReject,
  onCancel,
  onHangup,
  onDismissError,
}: {
  state: CallUiState | null;
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
  const [remotes, setRemotes] = useState<Array<{ id: string; name: string }>>(
    [],
  );
  const roomRef = useRef<Room | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideos = useRef<Map<string, HTMLVideoElement>>(new Map());
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (!state || state.phase !== "active") {
      setConnectError(null);
      setFacing("user");
      setFlipError(null);
      return;
    }

    let cancelled = false;
    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      videoCaptureDefaults: {
        facingMode: "user",
      },
    });
    roomRef.current = room;
    setRemotes([]);

    function syncRemotes() {
      const next = [...room.remoteParticipants.values()].map((p) => ({
        id: p.identity,
        name: p.name || p.identity,
      }));
      setRemotes(next);
    }

    function attachRemote(
      track: RemoteTrack,
      _publication: RemoteTrackPublication,
      participant: RemoteParticipant,
    ) {
      if (track.kind === Track.Kind.Video) {
        const el =
          remoteVideos.current.get(participant.identity) ??
          remoteVideoRef.current;
        if (el) track.attach(el);
      }
      if (track.kind === Track.Kind.Audio && remoteAudioRef.current) {
        track.attach(remoteAudioRef.current);
      }
      syncRemotes();
    }

    room.on(RoomEvent.TrackSubscribed, attachRemote);
    room.on(RoomEvent.ParticipantConnected, syncRemotes);
    room.on(RoomEvent.ParticipantDisconnected, syncRemotes);

    void (async () => {
      try {
        await room.connect(state.accepted.livekitUrl, state.accepted.token);
        if (cancelled) {
          await room.disconnect();
          return;
        }
        await room.localParticipant.setMicrophoneEnabled(true);
        if (state.accepted.video) {
          await room.localParticipant.setCameraEnabled(true, {
            facingMode: "user",
          });
        }
        attachLocalCamera(room, localVideoRef.current);
        syncRemotes();
        for (const participant of room.remoteParticipants.values()) {
          for (const pub of participant.trackPublications.values()) {
            if (pub.track) {
              attachRemote(
                pub.track as RemoteTrack,
                pub as RemoteTrackPublication,
                participant,
              );
            }
          }
        }
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
      room.off(RoomEvent.ParticipantConnected, syncRemotes);
      room.off(RoomEvent.ParticipantDisconnected, syncRemotes);
      void room.disconnect();
      roomRef.current = null;
    };
  }, [state]);

  useEffect(() => {
    const room = roomRef.current;
    if (!room) return;
    for (const participant of room.remoteParticipants.values()) {
      for (const pub of participant.trackPublications.values()) {
        if (pub.track?.kind === Track.Kind.Video) {
          const el =
            remoteVideos.current.get(participant.identity) ??
            remoteVideoRef.current;
          if (el) pub.track.attach(el);
        }
      }
    }
  }, [remotes]);

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
    if (!room || flipping) return;
    const next: CameraFacing = facing === "user" ? "environment" : "user";
    setFlipping(true);
    setFlipError(null);
    try {
      const videoTrack = room.localParticipant.getTrackPublication(
        Track.Source.Camera,
      )?.videoTrack;
      const devices = await Room.getLocalDevices("videoinput");
      const currentId = videoTrack?.mediaStreamTrack.getSettings().deviceId;
      const byLabel = devices.find((d) => {
        const label = d.label.toLowerCase();
        return next === "user"
          ? /front|user|facing|frontal|frente/.test(label)
          : /back|rear|environment|traseira|posterior/.test(label);
      });
      const other = devices.find(
        (d) => d.deviceId && d.deviceId !== currentId,
      );
      const options = byLabel?.deviceId
        ? { deviceId: byLabel.deviceId }
        : other?.deviceId
          ? { deviceId: other.deviceId }
          : { facingMode: next };

      if (videoTrack) {
        await videoTrack.restartTrack(options);
      } else {
        await room.localParticipant.setCameraEnabled(true, options);
      }
      if (room.options.videoCaptureDefaults) {
        room.options.videoCaptureDefaults.facingMode = next;
      }
      attachLocalCamera(room, localVideoRef.current);
      setFacing(next);
    } catch {
      setFlipError("Não foi possível virar a câmera neste aparelho");
    } finally {
      setFlipping(false);
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

  if (state.phase === "outgoing" || state.phase === "incoming") {
    const peerName =
      state.phase === "outgoing" ? state.peerName : state.offer.fromName;
    const video =
      state.phase === "outgoing" ? state.video : state.offer.video;
    const label =
      state.phase === "outgoing" ? "Chamando…" : "Chamada recebida";

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
            {label} · {video ? "Vídeo" : "Voz"}
          </p>
          <div className="mt-10 flex items-center justify-center gap-6">
            {state.phase === "incoming" ? (
              <>
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
              </>
            ) : (
              <button
                type="button"
                onClick={onCancel}
                className="rounded-xl border border-white/15 px-6 py-3 text-sm text-[#F2F2F0] hover:bg-white/5"
              >
                Cancelar
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const video = state.accepted.video;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#0B0B0D]">
      <div className="relative flex-1 overflow-hidden">
        {video ? (
          remotes.length > 1 ? (
            <div className="grid h-full grid-cols-2 gap-1 bg-black p-1">
              {remotes.map((remote) => (
                <video
                  key={remote.id}
                  ref={(el) => {
                    if (el) remoteVideos.current.set(remote.id, el);
                    else remoteVideos.current.delete(remote.id);
                  }}
                  autoPlay
                  playsInline
                  className="h-full w-full object-cover"
                />
              ))}
            </div>
          ) : (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="h-full w-full object-cover"
            />
          )
        ) : (
          <div className="flex h-full flex-col items-center justify-center bg-gradient-to-b from-[#1a1610] to-[#0B0B0D]">
            <div className="flex h-32 w-32 items-center justify-center rounded-full bg-[#C9A227]/15 ring-1 ring-[#C9A227]/40">
              <span className="text-4xl font-semibold text-[#C9A227]">
                {state.peerName
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((p) => p[0]?.toUpperCase() ?? "")
                  .join("") || "?"}
              </span>
            </div>
            <p className="mt-4 text-lg text-[#F2F2F0]">{state.peerName}</p>
            <p className="mt-1 text-sm text-[#9A9A9E]">Em chamada</p>
          </div>
        )}
        <audio ref={remoteAudioRef} autoPlay />
        {video ? (
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className={`absolute right-4 bottom-4 h-36 w-28 rounded-xl border border-white/10 object-cover shadow-xl ${
              facing === "user" ? "-scale-x-100" : ""
            }`}
          />
        ) : null}
      </div>

      <div className="border-t border-white/5 px-4 py-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs tracking-[0.2em] text-[#C9A227] uppercase">
              Remetum
            </p>
            <p className="text-sm text-[#F2F2F0]">{state.peerName}</p>
          </div>
          <div className="flex items-center gap-2">
            {video ? (
              <button
                type="button"
                disabled={flipping}
                onClick={() => void flipCamera()}
                className="rounded-xl border border-[#C9A227]/70 px-4 py-2.5 text-sm font-medium text-[#C9A227] hover:bg-[#C9A227] hover:text-[#0B0B0D] disabled:opacity-60"
              >
                {flipping ? "Trocando…" : "Virar câmera"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={onHangup}
              className="rounded-xl bg-red-500 px-5 py-2.5 text-sm font-medium text-white"
            >
              Encerrar
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
              onClick={onHangup}
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
