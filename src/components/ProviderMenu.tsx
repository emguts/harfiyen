import { useState } from "react";
import type { EngineState } from "../lib/useTranscriber";
import type { ProviderChoice } from "../worker/protocol";
import { IconAuto, IconCheck, IconChevron, IconCpu, IconGpu } from "./icons";
import { Menu, MenuFoot, MenuGroup, MenuItem, MenuNote, MenuTitle } from "./Menu";
import { TbLabel, toolbarButton } from "./ui";

/** Where the model runs: GPU in the brand blue, CPU in turquoise; white on a hovered item. */
const PROVIDER_COLOR: Record<ProviderChoice, string> = { auto: "text-fg-2", webgpu: "text-cini", wasm: "text-firuze" };
const ON_HOVER = "group-[:hover:not(:disabled)]/item:text-inherit";

const CHOICES: { value: ProviderChoice; label: string; note: string; Icon: typeof IconCpu }[] = [
  {
    value: "auto",
    label: "Otomatik",
    note: "Ekran kartı varsa onu kullanır, sorun çıkarsa işlemciye geçer.",
    Icon: IconAuto,
  },
  { value: "webgpu", label: "Ekran kartı (WebGPU)", note: "En hızlısı.", Icon: IconGpu },
  { value: "wasm", label: "İşlemci (WASM)", note: "Daha yavaş, ama her cihazda çalışır.", Icon: IconCpu },
];

export interface ProviderProps {
  value: ProviderChoice;
  engine: EngineState;
  onChange: (p: ProviderChoice) => void;
  /** Why the chosen model cannot run on the CPU, if it cannot. */
  cpuUnavailable: string | null;
  /** Why the chosen model does not use the GPU, if it does not. */
  gpuUnavailable: string | null;
  /** A transcription is running; switching would abort it. */
  locked: boolean;
}

/** What the model runs on: once loaded, what it actually runs on (a GPU failure moves it to the CPU). */
export function shownProvider({ value, engine }: Pick<ProviderProps, "value" | "engine">) {
  const ready = engine.phase === "ready" ? engine : null;
  const current = ready ? (ready.provider === "wasm" ? "wasm" : "webgpu") : value;
  return { ready, current, shown: CHOICES.find((c) => c.value === current)! };
}

/** Toolbar control: where the model runs, and what it runs on right now. */
export function ProviderMenu(props: ProviderProps) {
  const [open, setOpen] = useState(false);
  const { ready, current, shown } = shownProvider(props);

  return (
    <Menu
      open={open}
      onOpenChange={setOpen}
      trigger={
        <button
          className={toolbarButton()}
          aria-haspopup="menu"
          aria-expanded={open}
          title={ready?.gpu ?? ready?.fallbackReason ?? "Modelin çalıştığı yer"}
          onClick={() => setOpen((o) => !o)}
        >
          <span className={`inline-grid place-items-center ${PROVIDER_COLOR[current]}`}>
            <shown.Icon />
          </span>
          <TbLabel>{shown.label.split(" (")[0]}</TbLabel>
          <IconChevron size={12} />
        </button>
      }
    >
      <ProviderChoices {...props} onDone={() => setOpen(false)} />
    </Menu>
  );
}

/** Where the model may run; also in the phone toolbar's "⋯" menu. */
export function ProviderChoices({
  value,
  engine,
  onChange,
  cpuUnavailable,
  gpuUnavailable,
  locked,
  onDone,
}: ProviderProps & { onDone: () => void }) {
  const { ready } = shownProvider({ value, engine });
  return (
    <>
      <MenuGroup>
        <MenuTitle>Model nerede çalışsın</MenuTitle>
        {CHOICES.map((c) => {
          const blocked = c.value === "wasm" ? cpuUnavailable : c.value === "webgpu" ? gpuUnavailable : null;
          return (
            <MenuItem
              key={c.value}
              choice
              role="menuitemradio"
              aria-checked={c.value === value}
              disabled={locked || (!!blocked && c.value !== value)}
              onClick={() => {
                onDone();
                if (c.value !== value) onChange(c.value);
              }}
            >
              <span className="grid h-[18px] w-[14px] flex-none place-items-center" aria-hidden>
                {c.value === value && <IconCheck size={14} />}
              </span>
              <span className={`grid h-[18px] flex-none place-items-center ${PROVIDER_COLOR[c.value]} ${ON_HOVER}`}>
                <c.Icon />
              </span>
              <span className="grid gap-0.5">
                <span>{c.label}</span>
                <MenuNote>{blocked ?? c.note}</MenuNote>
              </span>
            </MenuItem>
          );
        })}
      </MenuGroup>
      {ready?.fallbackReason && <MenuFoot>{ready.fallbackReason}</MenuFoot>}
      {ready?.gpu && <MenuFoot>Şu an: {ready.gpu}</MenuFoot>}
      {locked && <MenuFoot>Yazıya dökme sürerken değiştirilemez.</MenuFoot>}
    </>
  );
}
