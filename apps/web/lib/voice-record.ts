const PREROLL_SECONDS = 0.35;

const WORKLET = `
class VoiceCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel && channel.length) {
      this.port.postMessage(channel.slice());
    }
    return true;
  }
}
registerProcessor("voice-capture", VoiceCaptureProcessor);
`;

function createAudioContext() {
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  return new Ctor();
}

function mergeFloat32(chunks: Float32Array[]) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function trimLeadingSilence(samples: Float32Array, sampleRate: number) {
  const threshold = 0.012;
  let start = 0;
  while (start < samples.length && Math.abs(samples[start] ?? 0) < threshold) {
    start += 1;
  }
  if (start === 0) return samples;
  if (start >= samples.length) return samples.subarray(0, 0);
  const pad = Math.min(start, Math.floor(sampleRate * 0.05));
  return samples.subarray(start - pad);
}

function encodeWav(samples: Float32Array, sampleRate: number) {
  const dataSize = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  function writeString(offset: number, value: string) {
    for (let i = 0; i < value.length; i += 1) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  }

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

export class VoiceCapture {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private node: AudioNode | null = null;
  private mute: GainNode | null = null;
  private arming: Promise<void> | null = null;
  private chunks: Float32Array[] = [];
  private preroll: Float32Array[] = [];
  private recording = false;
  private aborted = false;
  private sampleRate = 48000;
  private workletUrl: string | null = null;

  arm() {
    this.aborted = false;
    if (this.stream || this.arming) return this.arming ?? Promise.resolve();
    this.arming = this.openMic().finally(() => {
      this.arming = null;
    });
    return this.arming;
  }

  async start() {
    await this.arm();
    if (this.aborted || !this.stream || !this.ctx) {
      throw new Error("Microfone indisponível");
    }
    this.recording = true;
  }

  async stop() {
    const preroll = this.preroll;
    const recorded = this.chunks;
    const sampleRate = this.sampleRate;
    const wasRecording = this.recording;
    this.recording = false;
    this.release();
    if (!wasRecording || (preroll.length === 0 && recorded.length === 0)) {
      return null;
    }

    const prerollSamples = preroll.length
      ? trimLeadingSilence(mergeFloat32(preroll), sampleRate)
      : new Float32Array(0);
    const recordedSamples = recorded.length
      ? mergeFloat32(recorded)
      : new Float32Array(0);
    const samples = mergeFloat32(
      [prerollSamples, recordedSamples].filter((part) => part.length > 0),
    );
    if (samples.length < sampleRate * 0.15) return null;
    const blob = encodeWav(samples, sampleRate);
    const file = new File([blob], `audio-${Date.now()}.wav`, {
      type: "audio/wav",
    });
    return {
      file,
      durationMs: Math.round((samples.length / sampleRate) * 1000),
    };
  }

  abort() {
    this.aborted = true;
    this.recording = false;
    this.chunks = [];
    this.preroll = [];
    this.release();
  }

  private async openMic() {
    const ctx = createAudioContext();
    if (!ctx) throw new Error("Áudio indisponível");
    this.ctx = ctx;
    if (ctx.state === "suspended") await ctx.resume();
    this.sampleRate = ctx.sampleRate;

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: false,
        channelCount: 1,
      },
    });
    this.stream = stream;
    if (this.aborted) {
      this.release();
      return;
    }

    const source = ctx.createMediaStreamSource(stream);
    this.source = source;
    const mute = ctx.createGain();
    mute.gain.value = 0;
    this.mute = mute;

    const onFrame = (frame: Float32Array) => {
      if (this.recording) {
        this.chunks.push(frame);
        return;
      }
      this.preroll.push(frame);
      const max = Math.floor(this.sampleRate * PREROLL_SECONDS);
      let total = this.preroll.reduce((sum, chunk) => sum + chunk.length, 0);
      while (this.preroll.length > 1 && total > max) {
        const removed = this.preroll.shift();
        total -= removed?.length ?? 0;
      }
    };

    const node = await this.connectCapture(ctx, onFrame);
    this.node = node;
    source.connect(node);
    node.connect(mute);
    mute.connect(ctx.destination);
  }

  private async connectCapture(
    ctx: AudioContext,
    onFrame: (frame: Float32Array) => void,
  ) {
    try {
      const blob = new Blob([WORKLET], { type: "application/javascript" });
      this.workletUrl = URL.createObjectURL(blob);
      await ctx.audioWorklet.addModule(this.workletUrl);
      const worklet = new AudioWorkletNode(ctx, "voice-capture");
      worklet.port.onmessage = (event: MessageEvent<Float32Array>) => {
        onFrame(event.data);
      };
      return worklet;
    } catch {
      const processor = ctx.createScriptProcessor(1024, 1, 1);
      processor.onaudioprocess = (event) => {
        onFrame(new Float32Array(event.inputBuffer.getChannelData(0)));
      };
      return processor;
    }
  }

  private release() {
    try {
      this.source?.disconnect();
      this.node?.disconnect();
      this.mute?.disconnect();
    } catch {
      // already disconnected
    }
    this.source = null;
    this.node = null;
    this.mute = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    if (this.workletUrl) {
      URL.revokeObjectURL(this.workletUrl);
      this.workletUrl = null;
    }
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
    this.chunks = [];
    this.preroll = [];
  }
}
