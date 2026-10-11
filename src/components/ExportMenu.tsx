import { useEffect, useState } from "react";
import type { Word } from "../engine";
import { buildCues } from "../lib/cues";
import { download, toJson, toSrt, toText, toVtt } from "../lib/exporters";
import { duration as fmtDuration, megabytes } from "../lib/format";
import type { BurnState } from "../lib/useBurner";
import { IconChevron, IconExport } from "./icons";
import { Meter } from "./Indicators";
import { LinkButton, toolbarButton } from "./ui";
import { Menu, MenuError, MenuFoot, MenuGroup, MenuItem, MenuLink, MenuNote, MenuTitle } from "./Menu";

export function ExportMenu({
  words,
  baseName,
  meta,
  complete,
  isVideo,
  canBurn,
  burn,
  onBurn,
  onCancelBurn,
}: {
  words: Word[];
  baseName: string;
  meta: Record<string, unknown>;
  /** The transcript is final (subtitle files and video need it). */
  complete: boolean;
  isVideo: boolean;
  /** A file exists (recordings get one once stopped). */
  canBurn: boolean;
  burn: BurnState;
  onBurn: () => void;
  onCancelBurn: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  // Open the menu by itself when a video render finishes.
  useEffect(() => {
    if (burn.status === "done") setOpen(true);
  }, [burn.status]);

  const has = words.length > 0;
  const cues = () => buildCues(words);
  const item = (label: string, note: string, onClick: () => void, enabled = has && complete) => (
    <MenuItem disabled={!enabled} onClick={onClick}>
      <span>{label}</span>
      <MenuNote>{note}</MenuNote>
    </MenuItem>
  );

  return (
    <Menu
      open={open}
      onOpenChange={setOpen}
      trigger={
        <button
          className={toolbarButton({ primary: true, busy: burn.status === "running" })}
          aria-haspopup="menu"
          aria-expanded={open}
          disabled={!has}
          onClick={() => setOpen((o) => !o)}
        >
          <IconExport /> Dışa aktar <IconChevron size={12} />
        </button>
      }
    >
      <MenuGroup>
        <MenuTitle>Video</MenuTitle>
        {burn.status === "running" ? (
          <div className="grid justify-items-start gap-1.5 px-2 py-1.5">
            <Meter value={burn.progress} className="w-full" />
            <MenuNote>
              Oluşturuluyor, %{Math.floor(burn.progress * 100)}
              {burn.fps > 0 && `, ${burn.fps.toFixed(0)} kare/sn`}
            </MenuNote>
            <LinkButton onClick={onCancelBurn}>Durdur</LinkButton>
          </div>
        ) : burn.status === "done" ? (
          <MenuLink href={burn.url} download={`${baseName}.altyazili.mp4`}>
            <span>Altyazılı MP4'ü indir</span>
            <MenuNote>
              {megabytes(burn.size)} MB, {fmtDuration(burn.elapsed)} sürdü
            </MenuNote>
          </MenuLink>
        ) : (
          item(
            "Altyazılı video oluştur",
            isVideo ? "Altyazı görüntüye yazılır, MP4" : "Ses + hareketli aura + altyazı, MP4",
            onBurn,
            has && complete && canBurn,
          )
        )}
        {burn.status === "error" && <MenuError>{burn.message}</MenuError>}
      </MenuGroup>
      <MenuGroup>
        <MenuTitle>Altyazı dosyası</MenuTitle>
        {item("SRT", "Çoğu oynatıcı ve kurgu programı", () => download(`${baseName}.srt`, toSrt(cues()), "application/x-subrip"))}
        {item("WebVTT", "Web ve YouTube", () => download(`${baseName}.vtt`, toVtt(cues()), "text/vtt"))}
      </MenuGroup>
      <MenuGroup>
        <MenuTitle>Metin</MenuTitle>
        {item("Düz metin", "TXT, paragraflar", () => download(`${baseName}.txt`, toText(words), "text/plain"), has)}
        {item("Kelime zamanları", "JSON", () => download(`${baseName}.json`, toJson(words, meta), "application/json"), has)}
        {item(
          copied ? "Kopyalandı" : "Metni kopyala",
          "Panoya",
          async () => {
            await navigator.clipboard.writeText(toText(words));
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          },
          has,
        )}
      </MenuGroup>
      {!complete && <MenuFoot>Altyazı ve video, yazıya döküm bitince hazır olur.</MenuFoot>}
    </Menu>
  );
}
