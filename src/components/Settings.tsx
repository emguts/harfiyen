import { useEffect, useRef, useState, type ReactNode } from "react";
import { About } from "./About";
import { AppearanceSettings } from "./AppearanceSettings";
import { IconClose } from "./icons";
import { ModelSettings } from "./ModelSettings";
import { IconButton } from "./ui";

// The settings window: sections on the left, the chosen one on the right.
// It stays mounted while closed, so a model download keeps going.

type SectionId = "models" | "appearance" | "about";

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: "models", label: "Modeller" },
  { id: "appearance", label: "Görünüm" },
  { id: "about", label: "Hakkında" },
];

export function Settings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [section, setSection] = useState<SectionId>("models");

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const content: Record<SectionId, ReactNode> = {
    models: <ModelSettings active={open} />,
    appearance: <AppearanceSettings />,
    about: <About />,
  };

  return (
    <dialog
      ref={dialog}
      aria-label="Ayarlar"
      onClose={onClose}
      // A click on the backdrop lands on the dialog itself.
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="m-auto h-[min(640px,calc(100dvh-32px))] w-[min(780px,calc(100vw-32px))] overflow-hidden rounded-xl border border-line bg-pane p-0 text-fg shadow-[0_24px_64px_var(--shadow-pop)] backdrop:bg-black/55 backdrop:backdrop-blur-[2px] open:flex open:flex-col"
    >
      <div className="flex items-center justify-between border-b border-line-soft px-4 py-3">
        <h2 className="m-0 text-[14px] font-semibold tracking-[-0.015em]">Ayarlar</h2>
        <IconButton onClick={onClose} title="Kapat" aria-label="Kapat">
          <IconClose size={14} />
        </IconButton>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[168px_minmax(0,1fr)] max-[600px]:grid-cols-1 max-[600px]:grid-rows-[auto_minmax(0,1fr)]">
        <nav className="flex flex-col gap-0.5 border-r border-line-soft p-2 max-[600px]:flex-row max-[600px]:border-r-0 max-[600px]:border-b">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              aria-current={s.id === section ? "page" : undefined}
              onClick={() => setSection(s.id)}
              className={`rounded-ui-sm border-0 px-2.5 py-1.5 text-left text-[12.5px] transition-colors duration-120 ${
                s.id === section ? "bg-cini-wash text-fg" : "bg-transparent text-fg-2 hover:bg-raised hover:text-fg"
              }`}
            >
              {s.label}
            </button>
          ))}
        </nav>
        <div className="min-h-0 overflow-y-auto p-4 [scrollbar-color:var(--raised)_transparent] [scrollbar-width:thin]">
          {/* Every section stays mounted, so switching does not drop its state. */}
          {SECTIONS.map((s) => (
            <div key={s.id} hidden={s.id !== section}>
              {content[s.id]}
            </div>
          ))}
        </div>
      </div>
    </dialog>
  );
}
