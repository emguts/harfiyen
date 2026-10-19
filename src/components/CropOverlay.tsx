import { useRef } from "react";
import { ASPECTS, cropFor, dragCrop, framing, wholeCrop, type Aspect, type Crop, type Handle } from "../lib/crop";

/** A row of buttons, one of them pressed, on a dark pill over the video. */
const GROUP = "inline-flex gap-0.5 rounded-full bg-black/70 p-0.5 shadow-[0_2px_10px_rgba(0,0,0,0.35)] backdrop-blur-md";
const CHIP =
  "h-7 rounded-full border-0 bg-transparent px-2.5 text-[12px] font-medium text-white/75 transition-colors duration-150 hover:not-disabled:text-white disabled:opacity-40 aria-pressed:bg-white aria-pressed:text-black max-[480px]:px-2";
const ACTION =
  "h-8 rounded-full border-0 px-4 text-[12.5px] font-medium shadow-[0_2px_10px_rgba(0,0,0,0.35)] backdrop-blur-md";

const CORNERS: { handle: Handle; at: string; cursor: string }[] = [
  { handle: "nw", at: "-top-3.5 -left-3.5", cursor: "cursor-nwse-resize" },
  { handle: "ne", at: "-top-3.5 -right-3.5", cursor: "cursor-nesw-resize" },
  { handle: "sw", at: "-bottom-3.5 -left-3.5", cursor: "cursor-nesw-resize" },
  { handle: "se", at: "-bottom-3.5 -right-3.5", cursor: "cursor-nwse-resize" },
];
const EDGES: { handle: Handle; at: string; bar: string; cursor: string }[] = [
  { handle: "n", at: "-top-3.5 left-1/2 -translate-x-1/2", bar: "h-1 w-5", cursor: "cursor-ns-resize" },
  { handle: "s", at: "-bottom-3.5 left-1/2 -translate-x-1/2", bar: "h-1 w-5", cursor: "cursor-ns-resize" },
  { handle: "w", at: "-left-3.5 top-1/2 -translate-y-1/2", bar: "h-5 w-1", cursor: "cursor-ew-resize" },
  { handle: "e", at: "-right-3.5 top-1/2 -translate-y-1/2", bar: "h-5 w-1", cursor: "cursor-ew-resize" },
];

/**
 * Framing on the player: the shape of the frame, whether the picture fills
 * it (a slice, dragged and resized here) or fits inside it (over a blurred
 * copy or black), and the frame's size in pixels.
 *
 * `rect` is where the picture shows on the stage, in CSS pixels: the whole
 * picture while filling, the framed result while fitting.
 */
export function CropOverlay({
  draft,
  onDraft,
  picture,
  rect,
  onDone,
  onCancel,
}: {
  draft: Crop;
  onDraft: (c: Crop) => void;
  /** The video's displayed size in pixels. */
  picture: { w: number; h: number };
  rect: { left: number; top: number; width: number; height: number };
  onDone: () => void;
  onCancel: () => void;
}) {
  const drag = useRef<{ handle: Handle; start: Crop; x: number; y: number; id: number } | null>(null);
  const fixed = draft.aspect !== "free";
  const filling = draft.fit === "fill" || !fixed;
  const { size, none } = framing(draft, picture.w, picture.h);

  const setAspect = (aspect: Aspect) => {
    if (aspect === draft.aspect) return;
    // A free frame starts from the slice as it is; a fixed one from the largest slice around the same centre.
    if (aspect === "free") return onDraft({ ...draft, aspect, fit: "fill" });
    const cx = draft.x + draft.w / 2;
    const cy = draft.y + draft.h / 2;
    onDraft({ ...cropFor(aspect, picture.w, picture.h, cx, cy), fit: draft.fit, backdrop: draft.backdrop });
  };

  const start = (handle: Handle) => (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { handle, start: draft, x: e.clientX, y: e.clientY, id: e.pointerId };
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = (e.clientX - d.x) / rect.width;
    const dy = (e.clientY - d.y) / rect.height;
    onDraft(dragCrop(d.start, d.handle, dx, dy, picture.w, picture.h));
  };
  const end = (e: React.PointerEvent) => {
    if (drag.current?.id === e.pointerId) drag.current = null;
  };
  const pointer = { onPointerMove: move, onPointerUp: end, onPointerCancel: end };

  return (
    <div className="absolute inset-0 z-10 touch-none select-none" onClick={(e) => e.stopPropagation()}>
      {filling && (
        // The picture's area; the slice inside it, the rest dimmed.
        <div
          className="absolute overflow-hidden"
          style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
        >
          <div
            className="absolute cursor-move border border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.6)] outline-none"
            style={{
              left: `${draft.x * 100}%`,
              top: `${draft.y * 100}%`,
              width: `${draft.w * 100}%`,
              height: `${draft.h * 100}%`,
            }}
            onPointerDown={start("move")}
            {...pointer}
          >
            {/* Thirds, for placing the subject. */}
            <span className="pointer-events-none absolute inset-y-0 left-1/3 w-px bg-white/30" />
            <span className="pointer-events-none absolute inset-y-0 left-2/3 w-px bg-white/30" />
            <span className="pointer-events-none absolute inset-x-0 top-1/3 h-px bg-white/30" />
            <span className="pointer-events-none absolute inset-x-0 top-2/3 h-px bg-white/30" />
          </div>
        </div>
      )}
      {filling && (
        // Handles sit outside the clipped area so their hit targets reach past the picture's edge.
        <div
          className="pointer-events-none absolute"
          style={{
            left: rect.left + draft.x * rect.width,
            top: rect.top + draft.y * rect.height,
            width: draft.w * rect.width,
            height: draft.h * rect.height,
          }}
        >
          {CORNERS.map((c) => (
            <span
              key={c.handle}
              className={`pointer-events-auto absolute grid size-7 place-items-center ${c.at} ${c.cursor} [@media(pointer:coarse)]:size-10`}
              onPointerDown={start(c.handle)}
              {...pointer}
            >
              <span className="size-3 rounded-[3px] border-2 border-white bg-black/40 shadow-[0_0_3px_rgba(0,0,0,0.6)]" />
            </span>
          ))}
          {!fixed &&
            EDGES.map((c) => (
              <span
                key={c.handle}
                className={`pointer-events-auto absolute grid size-7 place-items-center ${c.at} ${c.cursor} [@media(pointer:coarse)]:size-10`}
                onPointerDown={start(c.handle)}
                {...pointer}
              >
                <span className={`rounded-full bg-white shadow-[0_0_3px_rgba(0,0,0,0.6)] ${c.bar}`} />
              </span>
            ))}
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap justify-center gap-1.5 p-2.5">
        <div className={`${GROUP} pointer-events-auto`} role="radiogroup" aria-label="Kadraj oranı">
          {ASPECTS.map((a) => (
            <button
              key={a.value}
              type="button"
              className={CHIP}
              role="radio"
              aria-checked={draft.aspect === a.value}
              aria-pressed={draft.aspect === a.value}
              title={a.title}
              onClick={() => setAspect(a.value)}
            >
              {a.label}
            </button>
          ))}
        </div>
        {fixed && (
          <div className={`${GROUP} pointer-events-auto`} role="radiogroup" aria-label="Yerleşim">
            <button
              type="button"
              className={CHIP}
              role="radio"
              aria-checked={draft.fit === "fill"}
              aria-pressed={draft.fit === "fill"}
              title="Kareyi doldurur, taşan kısım kırpılır"
              onClick={() => onDraft({ ...draft, fit: "fill" })}
            >
              Doldur
            </button>
            <button
              type="button"
              className={CHIP}
              role="radio"
              aria-checked={draft.fit === "fit"}
              aria-pressed={draft.fit === "fit"}
              title="Videonun tamamı karenin içine sığar"
              onClick={() => onDraft({ ...draft, fit: "fit" })}
            >
              Sığdır
            </button>
          </div>
        )}
        {fixed && draft.fit === "fit" && (
          <div className={`${GROUP} pointer-events-auto`} role="radiogroup" aria-label="Zemin">
            <button
              type="button"
              className={CHIP}
              role="radio"
              aria-checked={draft.backdrop === "blur"}
              aria-pressed={draft.backdrop === "blur"}
              title="Boşluklarda videonun bulanık hâli"
              onClick={() => onDraft({ ...draft, backdrop: "blur" })}
            >
              Bulanık
            </button>
            <button
              type="button"
              className={CHIP}
              role="radio"
              aria-checked={draft.backdrop === "black"}
              aria-pressed={draft.backdrop === "black"}
              title="Boşluklar siyah"
              onClick={() => onDraft({ ...draft, backdrop: "black" })}
            >
              Siyah
            </button>
          </div>
        )}
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-center gap-2 p-2.5">
        <span className="rounded-full bg-black/70 px-2.5 py-1 text-[11.5px] text-white/80 tabular-nums backdrop-blur-md">
          {none ? "Kırpılmıyor" : `${size.width} × ${size.height}`}
        </span>
        {!none && (
          <button
            type="button"
            className={`${ACTION} pointer-events-auto bg-black/70 text-white/80 hover:bg-black/85 hover:text-white`}
            title="Videonun tamamı, kırpmadan"
            onClick={() => onDraft(wholeCrop())}
          >
            Sıfırla
          </button>
        )}
        <button type="button" className={`${ACTION} pointer-events-auto bg-black/70 text-white hover:bg-black/85`} onClick={onCancel}>
          Vazgeç
        </button>
        <button type="button" className={`${ACTION} pointer-events-auto bg-cini text-white hover:brightness-110`} onClick={onDone}>
          Bitti
        </button>
      </div>
    </div>
  );
}
