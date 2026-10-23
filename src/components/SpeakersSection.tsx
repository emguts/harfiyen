import { useState } from "react";
import { duration as fmtDuration } from "../lib/format";
import { speakerColor, talkTime, type Speakers } from "../lib/speakers";
import { speakersProgress, type SpeakersState } from "../lib/useSpeakers";
import { IconMore } from "./icons";
import { Progress } from "./Indicators";
import { Menu, MenuGroup, MenuItem, MenuTitle } from "./Menu";
import { OPT, OPT_TITLE, Select } from "./Select";
import { Button, Hint, IconButton, Row, RowLabel, Section, SectionActions } from "./ui";

type Count = "auto" | "2" | "3" | "4" | "5" | "6";

const COUNTS: { value: Count; label: string }[] = [
  { value: "auto", label: "Kendisi bulsun" },
  ...(["2", "3", "4", "5", "6"] as const).map((n) => ({ value: n, label: `${n} kişi` })),
];

/** A speaker's name, changed once the field is left or Enter is pressed. Keyed by the name, so it starts over when that changes. */
function NameField({ name, onRename }: { name: string; onRename: (name: string) => void }) {
  const [value, setValue] = useState(name);
  const commit = () => {
    if (value.trim() !== name) onRename(value);
    else setValue(name);
  };
  return (
    <input
      className="h-7 min-w-0 flex-1 rounded-ui-sm border border-line bg-bg px-2 text-[12.5px] text-fg outline-none focus:border-cini"
      value={value}
      aria-label="Konuşmacının adı"
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        else if (e.key === "Escape") {
          setValue(name);
          e.currentTarget.blur();
        }
      }}
    />
  );
}

function MergeMenu({ names, from, onMerge }: { names: string[]; from: number; onMerge: (into: number) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Menu
      open={open}
      onOpenChange={setOpen}
      width="w-[220px]"
      trigger={
        <IconButton onClick={() => setOpen((o) => !o)} title="Başka biriyle birleştir" aria-label={`${names[from]} başka biriyle birleştir`}>
          <IconMore />
        </IconButton>
      }
    >
      <MenuGroup>
        <MenuTitle>Aynı kişi, birleştir</MenuTitle>
        {names.map((n, i) =>
          i === from ? null : (
            <MenuItem
              key={i}
              onClick={() => {
                setOpen(false);
                onMerge(i);
              }}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="size-2 shrink-0 rounded-full" style={{ background: speakerColor(i) }} />
                <span className="truncate">{n}</span>
              </span>
            </MenuItem>
          ),
        )}
      </MenuGroup>
    </Menu>
  );
}

/**
 * Telling who speaks when; `unavailable` says why it cannot be done now.
 * The transcript shows each speaker's name above their lines.
 */
export function SpeakersSection({
  speakers,
  state,
  unavailable,
  onRun,
  onCancel,
  onRename,
  onMerge,
  onClear,
}: {
  speakers: Speakers | undefined;
  state: SpeakersState;
  unavailable: string | null;
  /** `count`: how many speak, or undefined to guess. */
  onRun: (count: number | undefined) => void;
  onCancel: () => void;
  onRename: (speaker: number, name: string) => void;
  onMerge: (from: number, into: number) => void;
  onClear: () => void;
}) {
  const [count, setCount] = useState<Count>("auto");
  const progress = speakersProgress(state);
  const talk = speakers ? talkTime(speakers) : [];
  return (
    <Section title="Konuşmacılar">
      <Row>
        <RowLabel>Kaç kişi</RowLabel>
        <div className="min-w-0 flex-1">
          <Select<Count>
            label="Kaç kişi konuşuyor"
            value={count}
            options={COUNTS}
            onChange={setCount}
            disabled={!!progress}
            render={(o) => (
              <span className={OPT}>
                <span className={OPT_TITLE}>{o.label}</span>
              </span>
            )}
          />
        </div>
      </Row>
      {progress && <Progress {...progress} />}
      {state.status === "error" && <Hint>Konuşmacılar ayrılamadı: {state.message}</Hint>}
      <SectionActions>
        {progress ? (
          <Button onClick={onCancel}>Durdur</Button>
        ) : (
          <>
            <Button
              variant={speakers ? "default" : "primary"}
              disabled={!!unavailable}
              onClick={() => onRun(count === "auto" ? undefined : Number(count))}
            >
              {speakers ? "Yeniden ayır" : "Konuşmacıları ayır"}
            </Button>
            {speakers && <Button onClick={onClear}>Kaldır</Button>}
          </>
        )}
      </SectionActions>
      {speakers && !progress && (
        <div className="grid gap-1.5">
          {speakers.names.map((n, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: speakerColor(i) }} />
              <NameField key={n} name={n} onRename={(name) => onRename(i, name)} />
              <span className="w-[46px] text-right text-[11.5px] text-fg-3 tabular-nums [font-feature-settings:'tnum'_1]">
                {fmtDuration(talk[i])}
              </span>
              {speakers.names.length > 1 && <MergeMenu names={speakers.names} from={i} onMerge={(into) => onMerge(i, into)} />}
            </div>
          ))}
        </div>
      )}
      {unavailable ? (
        <Hint>{unavailable}</Hint>
      ) : speakers ? (
        <Hint>
          Transkriptte her konuşmanın başında konuşanın adı yazar; adına tıklayıp o konuşmayı, satırın üstündeki kişi
          düğmesiyle tek satırı başkasına verebilirsin. Aynı kişi iki kez çıktıysa ⋯ ile birleştir. ⌘Z ile geri alınır.
          Videoda konuşanın adı için Altyazı sekmesindeki <b>Konuşanın adını göster</b>'i aç.
        </Hint>
      ) : (
        <Hint>
          Kimin ne zaman konuştuğunu sesinden ayırır; altyazı ve metin dışa aktarımlarında konuşanın adı yazar. Kaç kişi
          konuştuğunu biliyorsan seçmen sonucu iyileştirir. İlk kullanımda yaklaşık 30 MB model indirilir.
        </Hint>
      )}
    </Section>
  );
}
