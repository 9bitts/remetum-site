"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
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

function playMedia(el: HTMLMediaElement) {
  el.autoplay = true;
  el.setAttribute("playsinline", "true");
  el.setAttribute("webkit-playsinline", "true");
  if (el instanceof HTMLVideoElement) {
    el.playsInline = true;
    el.controls = false;
  }
  const attempt = () => void el.play().catch(() => undefined);
  attempt();
  el.onloadedmetadata = attempt;
  el.oncanplay = attempt;
}

function attachToElement(
  track: RemoteTrack | LocalTrack,
  el: HTMLMediaElement | null,
  muted: boolean,
) {
  if (!el) return;
  el.muted = muted;
  if (el instanceof HTMLAudioElement) el.volume = 1;
  track.attach(el);
  const mediaTrack = track.mediaStreamTrack;
  if (mediaTrack && mediaTrack.readyState !== "ended") {
    el.srcObject = new MediaStream([mediaTrack]);
  }
  playMedia(el);
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
  const [remotes, setRemotes] = useState<Array<{ id: string; name: string }>>(
    [],
  );
  const localMediaRef = useRef(localMedia);
  localMediaRef.current = localMedia;
  const roomRef = useRef<Room | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const remoteVideos = useRef<Map<string, HTMLVideoElement>>(new Map());
  const remoteVideoTrackRef = useRef<RemoteTrack | null>(null);
  const remoteVideoTracks = useRef<Map<string, RemoteTrack>>(new Map());
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
      setRemotes([]);
      remoteVideoTrackRef.current = null;
      remoteVideoTracks.current.clear();
      return;
    }

    let cancelled = false;
    const audioContext = getCallAudioContext();
    const room = new Room({
      adaptiveStream: false,
      dynacast: false,
      webAudioMix: audioContext ? { audioContext } : true,
      audioCaptureDefaults: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      videoCaptureDefaults: {
        facingMode: "user",
      },
      publishDefaults: {
        simulcast: false,
        videoCodec: "vp8",
        dtx: true,
      },
    });
    roomRef.current = room;

    function syncRemotes() {
      setRemotes(
        [...room.remoteParticipants.values()].map((p) => ({
          id: p.identity,
          name: p.name || p.identity,
        })),
      );
    }

    function attachRemote(
      track: RemoteTrack,
      _publication: RemoteTrackPublication,
      participant: RemoteParticipant,
    ) {
      if (track.kind === Track.Kind.Video) {
        remoteVideoTrackRef.current = track;
        remoteVideoTracks.current.set(participant.identity, track);
        const el =
          remoteVideos.current.get(participant.identity) ?? remoteVideoRef.current;
        attachToElement(track, el, true);
      }
      if (track.kind === Track.Kind.Audio) {
        attachToElement(track, remoteAudioRef.current, false);
      }
      syncRemotes();
    }

    function detachRemote(
      track: RemoteTrack,
      _publication: RemoteTrackPublication,
      participant: RemoteParticipant,
    ) {
      track.detach();
      if (track.kind === Track.Kind.Video) {
        if (remoteVideoTrackRef.current === track) {
          remoteVideoTrackRef.current = null;
        }
        remoteVideoTracks.current.delete(participant.identity);
        const el =
          remoteVideos.current.get(participant.identity) ?? remoteVideoRef.current;
        if (el) el.srcObject = null;
      }
      syncRemotes();
    }

    function bindExistingRemoteTracks() {
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
        bindExistingRemoteTracks();
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

  useLayoutEffect(() => {
    if (remoteVideoTracks.current.size === 0) {
      const fallback = remoteVideoTrackRef.current;
      if (fallback && remoteVideoRef.current) {
        attachToElement(fallback, remoteVideoRef.current, true);
      }
      return;
    }
    for (const [id, track] of remoteVideoTracks.current) {
      const el = remoteVideos.current.get(id) ?? remoteVideoRef.current;
      attachToElement(track, el, true);
    }
  }, [remotes, state?.phase]);

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
        : remotes.length > 0
          ? "Em chamada"
          : "Aguardando…";

  return (
    <div className="fixed inset-0 z-[60] bg-[#0B0B0D]">
      {video ? (
        remotes.length > 1 ? (
          <div className="fixed inset-0 z-[60] grid grid-cols-2 bg-black">
            {remotes.map((remote) => (
              <video
                key={remote.id}
                ref={(el) => {
                  if (el) {
                    remoteVideos.current.set(remote.id, el);
                    const track = remoteVideoTracks.current.get(remote.id);
                    if (track) attachToElement(track, el, true);
                  } else {
                    remoteVideos.current.delete(remote.id);
                  }
                }}
                autoPlay
                playsInline
                muted
                className="h-full w-full bg-black object-cover"
              />
            ))}
          </div>
        ) : (
          <video
            ref={(el) => {
              remoteVideoRef.current = el;
              const track = remoteVideoTrackRef.current;
              if (el && track) attachToElement(track, el, true);
            }}
            autoPlay
            playsInline
            muted
            className="fixed inset-0 z-[60] h-full w-full bg-black object-cover"
          />
        )
      ) : (
        <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-gradient-to-b from-[#1a1610] to-[#0B0B0D]">
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
      )}
      <audio ref={remoteAudioRef} autoPlay className="hidden" />
      {video ? (
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          className={`fixed right-4 bottom-28 z-[62] h-36 w-28 rounded-xl border border-white/10 object-cover shadow-xl ${
            facing === "user" && !camOff ? "-scale-x-100" : ""
          } ${camOff ? "hidden" : ""}`}
        />
      ) : null}
      {video && remotes.length === 0 ? (
        <div className="pointer-events-none fixed inset-0 z-[61] flex items-center justify-center">
          <p className="rounded-full bg-black/50 px-4 py-2 text-sm text-[#F2F2F0]">
            {statusLabel}
          </p>
        </div>
      ) : null}

      <div className="fixed right-0 bottom-0 left-0 z-[63] border-t border-white/5 bg-[#0B0B0D]/95 px-4 py-4">
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
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-6">
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
