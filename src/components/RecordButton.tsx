import { useEffect, useState } from "react";
import { clock } from "../lib/format";

const BASE =
  "inline-flex h-[34px] min-w-[34px] flex-none items-center justify-center gap-2 rounded-[17px] border transition-[background,border-color] duration-150";
/** Recording (or about to): red pill with a stop square and the time. */
const ON = `${BASE} border-transparent bg-mercan py-0 pr-3 pl-2.5 shadow-[0_0_0_0_rgba(239,107,86,0.5)] hover:border-[rgba(239,107,86,0.6)] hover:bg-[#e05a45]`;
const STOP = "size-2.5 rounded-[2px] bg-white";
const TIME = "text-[12px] font-semibold text-white tabular-nums";

/** Transport-bar record control; shows the elapsed time while recording. */
export function RecordButton({
  recording,
  waiting,
  onStart,
  onStop,
}: {
  recording: boolean;
  /** Recording will start once the model is ready; clicking cancels. */
  waiting: boolean;
  onStart: () => void;
  onStop: () => void;
}) {
  const [since, setSince] = useState(0);
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (!recording) return;
    const t0 = Date.now();
    setSince(t0);
    setNow(t0);
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [recording]);

  if (waiting) {
    return (
      <button
        className={`${ON} opacity-75`}
        onClick={onStop}
        title="Model hazır olunca kayıt başlayacak. İptal etmek için tıkla."
        aria-label="Kayıt beklemesini iptal et"
      >
        <span className={STOP} aria-hidden />
        <span className={TIME}>Model bekleniyor</span>
      </button>
    );
  }

  return recording ? (
    <button
      className={`${ON} animate-rec-ring motion-reduce:animate-none`}
      onClick={onStop} title="Kaydı durdur (R)" aria-label="Kaydı durdur">
      <span className={STOP} aria-hidden />
      <span className={TIME}>{clock((now - since) / 1000)}</span>
    </button>
  ) : (
    <button
      className={`${BASE} border-line bg-pane-2 p-0 hover:border-[rgba(239,107,86,0.6)] hover:bg-[rgba(239,107,86,0.12)]`}
      onClick={onStart} title="Mikrofondan kaydet (R)" aria-label="Mikrofondan kaydet">
      <span className="size-3 rounded-full bg-mercan" aria-hidden />
    </button>
  );
}
