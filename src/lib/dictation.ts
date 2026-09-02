/** Microphone capture that produces a complete 16 kHz mono WAV blob. */
export class Dictation {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private chunks: Float32Array[] = [];

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.source = ctx.createMediaStreamSource(this.stream);
    this.node = ctx.createScriptProcessor(4096, 1, 1);
    this.chunks = [];
    this.node.onaudioprocess = (e) => this.chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    this.source.connect(this.node);
    this.node.connect(ctx.destination);
  }

  async stop(): Promise<Blob> {
    const rate = this.ctx?.sampleRate ?? 48000;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.node?.disconnect();
    this.source?.disconnect();
    const blob = encodeWav(this.chunks, rate);
    await this.ctx?.close();
    this.ctx = null;
    this.stream = null;
    this.node = null;
    this.source = null;
    this.chunks = [];
    return blob;
  }
}

function encodeWav(chunks: Float32Array[], sampleRate: number): Blob {
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const merged = new Float32Array(total);
  let o = 0;
  for (const c of chunks) {
    merged.set(c, o);
    o += c.length;
  }
  const target = 16000;
  const ratio = sampleRate / target;
  const outLen = Math.floor(merged.length / ratio);
  const pcm = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const s = Math.max(-1, Math.min(1, merged[Math.floor(i * ratio)] ?? 0));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const buffer = new ArrayBuffer(44 + pcm.length * 2);
  const view = new DataView(buffer);
  const str = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  view.setUint32(4, 36 + pcm.length * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, target, true);
  view.setUint32(28, target * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  str(36, "data");
  view.setUint32(40, pcm.length * 2, true);
  new Int16Array(buffer, 44).set(pcm);
  return new Blob([buffer], { type: "audio/wav" });
}

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0: { transcript: string };
};
type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
};
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
};

function speechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as Record<string, unknown>;
  return (w["SpeechRecognition"] ?? w["webkitSpeechRecognition"] ?? null) as
    | (new () => SpeechRecognitionLike)
    | null;
}

/** Live speech-to-text using the browser's SpeechRecognition API (interim results). */
export class LiveTranscriber {
  private rec: SpeechRecognitionLike | null = null;
  private finalText = "";

  get supported() {
    return speechRecognitionCtor() != null;
  }

  start(onUpdate: (live: string) => void) {
    const Ctor = speechRecognitionCtor();
    if (!Ctor) return;
    this.finalText = "";
    const rec = new Ctor();
    this.rec = rec;
    rec.lang = "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (!r) continue;
        if (r.isFinal) this.finalText += r[0].transcript + " ";
        else interim += r[0].transcript;
      }
      onUpdate((this.finalText + interim).trim());
    };
    rec.onerror = () => {};
    rec.start();
  }

  stop(): string {
    try {
      this.rec?.stop();
    } catch {
      /* noop */
    }
    this.rec = null;
    return this.finalText.trim();
  }
}

export async function transcribe(blob: Blob): Promise<string> {
  const fd = new FormData();
  fd.append("file", blob, "recording.wav");
  const res = await fetch("/api/public/transcribe", { method: "POST", body: fd });
  if (!res.ok) throw new Error((await res.text().catch(() => "")) || "Transcription failed.");
  const json = (await res.json()) as { text?: string };
  return json.text ?? "";
}
