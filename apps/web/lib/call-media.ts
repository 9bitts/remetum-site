import {
  createLocalTracks,
  LocalAudioTrack,
  LocalVideoTrack,
  VideoPresets,
  type LocalTrack,
} from "livekit-client";

export type CallMedia = {
  audio?: LocalAudioTrack;
  video?: LocalVideoTrack;
};

let unlockedContext: AudioContext | null = null;

function audioContextCtor() {
  return (
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext
  );
}

export function getCallAudioContext() {
  return unlockedContext;
}

export async function unlockCallAudio() {
  const Ctor = audioContextCtor();
  if (!Ctor) return null;
  if (!unlockedContext || unlockedContext.state === "closed") {
    unlockedContext = new Ctor();
  }
  if (unlockedContext.state === "suspended") {
    try {
      await unlockedContext.resume();
    } catch {
      // Autoplay lock; LiveKit still tries after the next gesture.
    }
  }
  return unlockedContext;
}

export function callMediaErrorMessage(err: unknown) {
  const name = err && typeof err === "object" && "name" in err ? String(err.name) : "";
  const message =
    err instanceof Error ? err.message : "Não foi possível acessar o microfone";
  if (name === "NotAllowedError" || /permission|denied|notallowed/i.test(message)) {
    return "Permita o microfone e a câmera nas configurações do aparelho para ligar.";
  }
  if (name === "NotFoundError" || /notfound|requested device/i.test(message)) {
    return "Nenhum microfone ou câmera foi encontrado neste aparelho.";
  }
  if (name === "NotReadableError" || /in use|occupied|notreadable/i.test(message)) {
    return "O microfone ou a câmera já está em uso por outro app.";
  }
  if (/livekit|websocket|connect/i.test(message)) {
    return "Não foi possível conectar à chamada. Verifique a internet e tente de novo.";
  }
  return message;
}

export async function acquireCallMedia(video: boolean): Promise<CallMedia> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Este aparelho não suporta chamadas de voz e vídeo.");
  }
  await unlockCallAudio();

  const audio = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  } as const;

  try {
    const tracks = await createLocalTracks({
      audio,
      video: video
        ? { facingMode: "user", resolution: VideoPresets.h720.resolution }
        : false,
    });
    return pickTracks(tracks);
  } catch (err) {
    if (!video) throw err;
    const tracks = await createLocalTracks({ audio, video: false });
    return pickTracks(tracks);
  }
}

function pickTracks(tracks: LocalTrack[]): CallMedia {
  return {
    audio: tracks.find((t) => t.kind === "audio") as LocalAudioTrack | undefined,
    video: tracks.find((t) => t.kind === "video") as LocalVideoTrack | undefined,
  };
}

export function stopCallMedia(media: CallMedia | null | undefined) {
  if (!media) return;
  try {
    media.audio?.stop();
  } catch {
    // already stopped
  }
  try {
    media.video?.stop();
  } catch {
    // already stopped
  }
}
