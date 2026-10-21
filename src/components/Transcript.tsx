import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Word } from "../engine";
import { buildCues, importedCues, READING_RULES, type Cue } from "../lib/cues";
import type { Match } from "../lib/find";
import { clock } from "../lib/format";
import { speakerColor } from "../lib/speakers";
import { IconCheck, IconClock, IconEdit, IconSpeaker, IconTrash } from "./icons";
import { Menu, MenuGroup, MenuItem, MenuTitle } from "./Menu";
import { TimingEditor } from "./TimingEditor";
import { EmptyNote, IconButton } from "./ui";

interface Props {
  words: Word[];
  tentative: Word[];
  running: boolean;
  /** Running, but the model is still loading. */
  waiting?: boolean;
  time: number;
  playing: boolean;
  onSeek: (t: number) => void;
  /** Present when the transcript can be edited (decoding finished). */
  onEdit?: (first: number, count: number, text: string) => void;
  /** Present with onEdit: words first..first+count-1 placed in start..end, or moved by seconds. */
  onRetime?: (first: number, count: number, start: number, end: number) => void;
  onShift?: (first: number, count: number, seconds: number) => void;
  /** Find hits to mark, and which one is current. */
  found?: { matches: Match[]; current: number };
  /** Language of the words, for the spelling check while editing. */
  lang: string;
  /** The speakers' names, when they were told apart (the words then carry `speaker`). */
  speakerNames?: string[];
  /** Present with speakerNames when they can be changed: start..end is said by `speaker` (a new number adds one). */
  onSpeaker?: (start: number, end: number, speaker: number) => void;
}

/** Who says a line: one speaker per line, since lines break where the speaker changes. */
const speakerOf = (c: Cue) => c.words[0]?.speaker;

/** Pick who says a line or a turn: the speakers, and a new one. */
function SpeakerMenu({
  names,
  current,
  title,
  align,
  onPick,
  trigger,
}: {
  names: string[];
  current: number;
  title: string;
  align: "left" | "right";
  onPick: (speaker: number) => void;
  trigger: (toggle: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Menu open={open} onOpenChange={setOpen} align={align} width="w-[220px]" trigger={trigger(() => setOpen((o) => !o))}>
      <MenuGroup>
        <MenuTitle>{title}</MenuTitle>
        {names.map((n, i) => (
          <MenuItem
            key={i}
            onClick={() => {
              setOpen(false);
              if (i !== current) onPick(i);
            }}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="size-2 shrink-0 rounded-full" style={{ background: speakerColor(i) }} />
              <span className="truncate">{n}</span>
            </span>
            {i === current && <IconCheck size={14} />}
          </MenuItem>
        ))}
      </MenuGroup>
      <MenuGroup>
        <MenuItem
          onClick={() => {
            setOpen(false);
            onPick(names.length);
          }}
        >
          Yeni konuşmacı
        </MenuItem>
      </MenuGroup>
    </Menu>
  );
}

/** Index of the word being spoken at time t, or -1. */
function activeIndex(words: Word[], t: number): number {
  let lo = 0;
  let hi = words.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (words[mid].start <= t) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans >= 0 && t < words[ans].end + 0.25 ? ans : -1;
}

function CueEditor({ initial, onDone }: { initial: string; onDone: (text: string | null) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(initial);
  useLayoutEffect(() => {
    const t = ref.current!;
    t.style.height = "0";
    t.style.height = `${t.scrollHeight}px`;
  }, [value]);
  useEffect(() => {
    const t = ref.current!;
    t.focus();
    t.setSelectionRange(t.value.length, t.value.length);
  }, []);
  return (
    <textarea
      ref={ref}
      className="-my-[3px] block w-full resize-none overflow-hidden rounded-ui-sm border border-cini bg-bg px-1.5 py-0.5 text-[15px] leading-[1.6] font-[560] text-fg outline-none [font-family:inherit]"
      value={value}
      spellCheck
      aria-label="Satırı düzenle"
      onChange={(e) => setValue(e.target.value.replace(/\n/g, " "))}
      onBlur={() => onDone(value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onDone(value);
        } else if (e.key === "Escape") {
          e.preventDefault();
          onDone(null);
        }
      }}
    />
  );
}

const CueRow = memo(function CueRow({
  cue,
  active,
  tentativeFrom,
  marks,
  onSeek,
  onEdit,
  onRetime,
  onShift,
  now,
  speakerNames,
  turnEnd,
  onSpeaker,
}: {
  cue: Cue;
  /** Index of the active word within this cue, or -1. */
  active: number;
  /** Words from this index on are still being decoded. */
  tentativeFrom: number;
  /** Per word: "1" inside a find hit, "2" inside the current one, else "0". Empty if none. */
  marks: string;
  onSeek: (t: number) => void;
  onEdit?: (first: number, count: number, text: string) => void;
  onRetime?: (first: number, count: number, start: number, end: number) => void;
  onShift?: (first: number, count: number, seconds: number) => void;
  now: () => number;
  speakerNames?: string[];
  /** Set on the first line of a speaker's turn: where the turn ends. Its name shows above the line. */
  turnEnd?: number;
  onSpeaker?: (start: number, end: number, speaker: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [timing, setTiming] = useState(false);
  const text = cue.words.map((w) => w.text).join(" ");
  const speaker = speakerNames ? speakerOf(cue) : undefined;
  const finish = (value: string | null) => {
    setEditing(false);
    if (value !== null && value.trim() !== text) onEdit?.(cue.first, cue.words.length, value);
  };
  return (
    <li
      className={`group/cue relative grid scroll-m-10 grid-cols-[52px_minmax(0,1fr)] items-baseline border-l-2 py-1.5 pr-3.5 pl-0 transition-[background,border-color] duration-150 ease-[ease] ${
        active >= 0 ? "border-cini bg-linear-to-r from-cini-wash to-transparent to-75%" : "border-transparent"
      }`}
      data-start={cue.start}
    >
      {speaker !== undefined && turnEnd !== undefined && (
        <div className="col-span-2 pt-1 pb-0.5 pl-3">
          {onSpeaker ? (
            <SpeakerMenu
              names={speakerNames!}
              current={speaker}
              title="Bu konuşmayı söyleyen"
              align="left"
              onPick={(s) => onSpeaker(cue.start, turnEnd, s)}
              trigger={(toggle) => (
                <button
                  className="-mx-1.5 flex items-center gap-1.5 rounded-ui-sm border-0 bg-transparent px-1.5 py-0.5 text-[11.5px] font-semibold hover:bg-raised"
                  style={{ color: speakerColor(speaker) }}
                  onClick={toggle}
                  title="Konuşmacıyı değiştir"
                >
                  <span className="size-2 rounded-full" style={{ background: speakerColor(speaker) }} />
                  {speakerNames![speaker]}
                </button>
              )}
            />
          ) : (
            <span className="flex items-center gap-1.5 text-[11.5px] font-semibold" style={{ color: speakerColor(speaker) }}>
              <span className="size-2 rounded-full" style={{ background: speakerColor(speaker) }} />
              {speakerNames![speaker]}
            </span>
          )}
        </div>
      )}
      <button
        className={`justify-self-start border-0 bg-transparent py-0 pr-0 pl-3 text-[11px] font-medium tabular-nums transition-colors duration-150 ease-[ease] [font-feature-settings:'tnum'_1] hover:text-wave-played ${
          active >= 0 ? "text-wave-played" : "text-fg-3"
        }`}
        onClick={() => onSeek(cue.start)}
        aria-label={`${clock(cue.start)} konumuna git`}
      >
        {clock(cue.start)}
      </button>
      {editing ? (
        <CueEditor initial={text} onDone={finish} />
      ) : (
        <p
          className="m-0 font-[family-name:var(--read)] text-[14.5px] leading-[1.65] font-[480] tracking-[-0.008em]"
          onDoubleClick={() => onEdit && setEditing(true)}>
          {cue.words.map((w, i) => (
            <span key={i}>
              <span
                className={`-mx-px inline-block rounded-[4px] px-[3px] py-px transition-[background,color] duration-150 ease-[ease] hover:bg-raised motion-reduce:transition-none ${
                  i === active
                    ? "bg-cini font-[550] text-white shadow-[0_1px_4px_rgba(71,109,230,0.4)]"
                    : marks[i] === "2"
                      ? "bg-[#e8b54a] text-[#1a1408]"
                      : marks[i] === "1"
                        ? "bg-[rgba(232,181,74,0.22)]"
                        : i >= tentativeFrom
                      ? "text-firuze"
                      : ""
                }`}
                onClick={() => onSeek(w.start)}
              >
                {w.text}
              </span>{" "}
            </span>
          ))}
        </p>
      )}
      {onEdit && !editing && (
        <span className="absolute top-[3px] right-1.5 hidden gap-0.5 rounded-ui bg-raised p-0.5 group-hover/cue:flex focus-within:flex">
          <IconButton onClick={() => setEditing(true)} title="Düzenle (çift tıkla)" aria-label="Satırı düzenle">
            <IconEdit />
          </IconButton>
          {speaker !== undefined && onSpeaker && (
            <SpeakerMenu
              names={speakerNames!}
              current={speaker}
              title="Bu satırı söyleyen"
              align="right"
              onPick={(s) => onSpeaker(cue.start, cue.end, s)}
              trigger={(toggle) => (
                <IconButton onClick={toggle} title="Bu satırın konuşmacısı" aria-label="Bu satırın konuşmacısını değiştir">
                  <IconSpeaker />
                </IconButton>
              )}
            />
          )}
          {onRetime && onShift && (
            <IconButton onClick={() => setTiming((t) => !t)} title="Zamanı düzenle" aria-label="Satırın zamanını düzenle">
              <IconClock />
            </IconButton>
          )}
          <IconButton onClick={() => onEdit(cue.first, cue.words.length, "")} title="Satırı sil" aria-label="Satırı sil">
            <IconTrash />
          </IconButton>
        </span>
      )}
      {timing && onRetime && onShift && (
        <TimingEditor cue={cue} now={now} onRetime={onRetime} onShift={onShift} onClose={() => setTiming(false)} />
      )}
    </li>
  );
},
// Cues are rebuilt on every progress update; only re-render rows that changed.
(a, b) =>
  a.active === b.active &&
  a.tentativeFrom === b.tentativeFrom &&
  a.marks === b.marks &&
  a.onSeek === b.onSeek &&
  a.onEdit === b.onEdit &&
  a.onRetime === b.onRetime &&
  a.onShift === b.onShift &&
  a.speakerNames === b.speakerNames &&
  a.turnEnd === b.turnEnd &&
  a.onSpeaker === b.onSpeaker &&
  a.cue.first === b.cue.first &&
  a.cue.words.length === b.cue.words.length &&
  a.cue.words.every((w, i) => w === b.cue.words[i]));

export function Transcript({
  words,
  tentative,
  running,
  waiting,
  time,
  playing,
  onSeek,
  onEdit,
  onRetime,
  onShift,
  found,
  lang,
  speakerNames,
  onSpeaker,
}: Props) {
  // The playhead for "Şu an" buttons, without re-rendering rows as it moves.
  const timeRef = useRef(time);
  timeRef.current = time;
  const now = useCallback(() => timeRef.current, []);
  const all = useMemo(() => (tentative.length ? words.concat(tentative) : words), [words, tentative]);
  const cues = useMemo(() => importedCues(all) ?? buildCues(all, READING_RULES), [all]);
  // Per cue, a string of find marks (see CueRow); "" where nothing is marked.
  const marks = useMemo(() => {
    if (!found?.matches.length) return null;
    const m = new Uint8Array(all.length);
    found.matches.forEach((h, k) => m.fill(k === found.current ? 2 : 1, h.first, h.last + 1));
    return cues.map((c) => {
      const part = m.subarray(c.first, c.first + c.words.length);
      return part.some(Boolean) ? part.join("") : "";
    });
  }, [all, cues, found]);
  // Per cue that starts a speaker's turn, where the turn ends.
  const turnEnds = useMemo(() => {
    if (!speakerNames) return null;
    const out = new Map<number, number>();
    let start = -1;
    cues.forEach((c, i) => {
      if (i === 0 || speakerOf(c) !== speakerOf(cues[i - 1])) start = i;
      out.set(start, c.end);
    });
    return out;
  }, [cues, speakerNames]);
  const active = playing || time > 0 ? activeIndex(all, time) : -1;
  const list = useRef<HTMLOListElement>(null);
  const userScrolledAt = useRef(0);

  // Follow the playhead, unless the reader scrolled on their own recently.
  const activeCue = active < 0 ? -1 : cues.findIndex((c) => active < c.first + c.words.length);
  useEffect(() => {
    if (activeCue < 0 || !playing || Date.now() - userScrolledAt.current < 4000) return;
    list.current?.children[activeCue]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeCue, playing]);

  // Bring the current find hit into view.
  const hit = found?.matches[found.current]?.first ?? -1;
  const hitCue = hit < 0 ? -1 : cues.findIndex((c) => hit < c.first + c.words.length);
  useEffect(() => {
    if (hitCue >= 0) list.current?.children[hitCue]?.scrollIntoView({ block: "nearest" });
  }, [hitCue, hit]);

  // While decoding, keep the newest line in view if the reader is at the end.
  // The list scrolls inside its panel (the nearest scrollable ancestor).
  const nearEnd = useRef(true);
  useEffect(() => {
    const el = list.current?.closest("[data-scroll]");
    if (!el) return;
    const onScroll = () => {
      nearEnd.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    };
    const onUser = () => (userScrolledAt.current = Date.now());
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("wheel", onUser, { passive: true });
    el.addEventListener("touchmove", onUser, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("wheel", onUser);
      el.removeEventListener("touchmove", onUser);
    };
  }, [all.length > 0]);
  useEffect(() => {
    if (running && !playing && nearEnd.current) {
      list.current?.lastElementChild?.scrollIntoView({ block: "end" });
    }
  }, [cues.length, running, playing]);

  if (!all.length) {
    return (
      <EmptyNote aria-live="polite">
        {waiting
          ? "Model hazırlanıyor, bitince yazıya dökme başlayacak."
          : running
            ? "Konuşma bekleniyor…"
            : "Bu dosyada konuşma bulunamadı."}
      </EmptyNote>
    );
  }

  return (
    <ol className="m-0 list-none p-0 pb-6" ref={list} lang={lang}>
      {cues.map((c, i) => {
        const end = c.first + c.words.length;
        return (
          <CueRow
            key={c.first}
            cue={c}
            active={active >= c.first && active < end ? active - c.first : -1}
            tentativeFrom={Math.min(c.words.length, Math.max(0, words.length - c.first))}
            marks={marks?.[i] ?? ""}
            onSeek={onSeek}
            onEdit={onEdit}
            onRetime={onRetime}
            onShift={onShift}
            now={now}
            speakerNames={speakerNames}
            turnEnd={turnEnds?.get(i)}
            onSpeaker={onSpeaker}
          />
        );
      })}
    </ol>
  );
}
