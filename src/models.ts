// The speech models the user can choose from. Files live under
// VITE_MODELS_BASE_URL (default /models) in each model's directory.

export type ModelId = "seda" | "whisper-turbo" | "whisper-turbo-q4";

export const MODELS_BASE = (import.meta.env.VITE_MODELS_BASE_URL || `${import.meta.env.BASE_URL}models`).replace(/\/+$/, "");

export interface ModelInfo {
  id: ModelId;
  /** Which engine runs it. */
  engine: "seda" | "whisper";
  name: string;
  /** Short tag next to the name. */
  tier: string;
  note: string;
  /** Approximate first download, ONNX runtime included. */
  size: string;
  /** Model and weight precision, for the inspector and exports. */
  spec: string;
  dir: string;
  /**
   * Files listed in the directory's model.json, downloaded and cached.
   * Whisper: encoder, decoder, vocab, VAD, in this order.
   */
  files: string[];
  link: string;
  /** Streams with low latency, so it can transcribe the microphone. */
  live: boolean;
  /** Needs WebGPU. */
  gpuOnly: boolean;
  /** Needs 16-bit float shaders (shader-f16) on the GPU. */
  needsF16: boolean;
  /** Writes punctuation and capitals itself. */
  punctuates: boolean;
}

export const MODELS: ModelInfo[] = [
  {
    id: "seda",
    engine: "seda",
    name: "Seda",
    tier: "Hızlı",
    note: "Küçük ve hızlı; canlı kayıtta ve her cihazda çalışır.",
    size: "105 MB",
    spec: "seda-v0.1",
    dir: "seda-v0.1",
    files: ["encoder.webgpu.onnx", "decoder.onnx", "joiner.int8.onnx", "rnnlm.int8.onnx", "lodr.bin", "tokens.txt"],
    link: "https://huggingface.co/atasoglu/seda-v0.1",
    live: true,
    gpuOnly: false,
    needsF16: false,
    punctuates: false,
  },
  {
    id: "whisper-turbo",
    engine: "whisper",
    name: "Whisper Turbo",
    tier: "Yüksek doğruluk",
    note: "En az hata, noktalama ve rakamlarla yazar. Büyük indirme, ekran kartı gerekir; canlı kayıtta kullanılmaz.",
    size: "1,5 GB",
    spec: "whisper-large-v3-turbo (fp16 encoder, q4f16 decoder)",
    dir: "whisper-large-v3-turbo",
    files: ["encoder_model_fp16.onnx", "decoder_model_merged_q4f16.onnx", "vocab.json", "silero_vad.onnx"],
    link: "https://huggingface.co/openai/whisper-large-v3-turbo",
    live: false,
    gpuOnly: true,
    needsF16: true,
    punctuates: true,
  },
  {
    id: "whisper-turbo-q4",
    engine: "whisper",
    name: "Whisper Turbo Hafif",
    tier: "Daha küçük",
    note: "Whisper Turbo'nun 4 bitlik hâli: üçte bir boyutta, zor seste biraz daha fazla hata. Ekran kartı gerekir; canlı kayıtta kullanılmaz.",
    size: "600 MB",
    spec: "whisper-large-v3-turbo (q4f16 encoder, q4f16 decoder)",
    dir: "whisper-large-v3-turbo",
    files: ["encoder_model_q4f16.onnx", "decoder_model_merged_q4f16.onnx", "vocab.json", "silero_vad.onnx"],
    link: "https://huggingface.co/openai/whisper-large-v3-turbo",
    live: false,
    gpuOnly: true,
    needsF16: true,
    punctuates: true,
  },
];

export const DEFAULT_MODEL: ModelId = "seda";

export const modelInfo = (id: ModelId): ModelInfo => MODELS.find((m) => m.id === id) ?? MODELS[0];

export const isModelId = (v: unknown): v is ModelId => MODELS.some((m) => m.id === v);

export const modelFileUrl = (m: ModelInfo, file: string) => `${MODELS_BASE}/${m.dir}/${file}`;
