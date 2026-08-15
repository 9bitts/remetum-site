type RingtoneHandle = {
  start: () => Promise<void>;
  stop: () => void;
};

export function createRingtone(): RingtoneHandle {
  let ctx: AudioContext | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;

  function tone(at: AudioContext, startAt: number, duration: number) {
    const oscA = at.createOscillator();
    const oscB = at.createOscillator();
    const gain = at.createGain();
    oscA.type = "sine";
    oscB.type = "sine";
    oscA.frequency.value = 440;
    oscB.frequency.value = 480;
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(0.08, startAt + 0.02);
    gain.gain.setValueAtTime(0.08, startAt + duration - 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    oscA.connect(gain);
    oscB.connect(gain);
    gain.connect(at.destination);
    oscA.start(startAt);
    oscB.start(startAt);
    oscA.stop(startAt + duration);
    oscB.stop(startAt + duration);
  }

  function ringOnce(at: AudioContext) {
    const now = at.currentTime;
    tone(at, now, 0.42);
    tone(at, now + 0.55, 0.42);
  }

  return {
    async start() {
      if (stopped) return;
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) return;
      ctx = new AudioCtx();
      if (ctx.state === "suspended") {
        try {
          await ctx.resume();
        } catch {
          return;
        }
      }
      ringOnce(ctx);
      timer = setInterval(() => {
        if (ctx && !stopped) ringOnce(ctx);
      }, 1600);
    },
    stop() {
      stopped = true;
      if (timer) clearInterval(timer);
      timer = null;
      if (ctx) {
        void ctx.close();
        ctx = null;
      }
    },
  };
}
