import {
  DEFAULT_VOICE,
  MAX_ORIGINAL,
  type DubLang,
  type DubState,
  type PreviewState,
  type Voice,
  type VoiceModel,
} from "../lib/useDubber";
import { STUDIO } from "./CaptionStudio";
import { Meter } from "./Indicators";
import { OPT_NOTE, OPT_TEXT, OPT_TITLE, Select } from "./Select";
import {
  Button,
  Hint,
  Range,
  Row,
  RowGroup,
  RowLabel,
  RowValue,
  Section,
  SectionActions,
  Switch,
} from "./ui";

const MODELS: Record<
  VoiceModel,
  {
    name: string;
    size: string;
    link: string;
    note: string;
    /** One line in the model list. */
    short: string;
  }
> = {
  ema: {
    name: "EMA Lightning",
    size: "36 MB",
    link: "https://huggingface.co/canberkkkkkk/ema-lightning",
    note: "Türkçe metin okuma modeli (Apache-2.0).",
    short: "Varsayılan ses, hızlı.",
  },
  mini: {
    name: "Antalia Mini",
    size: "23 MB",
    link: "https://huggingface.co/cloud0day3/antalia-mini",
    note: "Patientdesk.ai'nin Türkçe metin okuma modeli Antalia-2 Mini (Apache-2.0); 7,6 milyon parametreli, tek ses.",
    short: "Tek ses; EMA'dan biraz yavaş, Ahenk'ten hızlı.",
  },
  ahenk: {
    name: "Ahenk Cep",
    size: "18 MB",
    link: "https://huggingface.co/ozgurguler/ahenk-cep-tr",
    note: "Ahenk (github.com/ozguradmin/ahenk-turkish-tts), CC BY 4.0; EMA Lightning (Apache-2.0) mimarisinde, Alania verilerinden (PatientDesk AI, CC BY 4.0) türeyen Ahenk sesinden öğrenmiş küçük model. Rakam, tarih ve kısaltmaları iyi okur; diğerlerinden biraz yavaş.",
    short: "Rakam, tarih ve kısaltmaları en iyi okur; biraz yavaş.",
  },
  supertonic: {
    name: "Supertonic 3",
    size: "203 MB",
    link: "https://huggingface.co/Supertone/supertonic-3",
    note: "Supertone'un 31 dilde okuyan metin okuma modeli (OpenRAIL-M); on ses arasından seçilir.",
    short: "İngilizce ve Türkçe, on ses; büyük indirme.",
  },
};

/** The models that read each language. */
const LANG_MODELS: Record<DubLang, VoiceModel[]> = {
  tr: ["ema", "mini", "ahenk", "supertonic"],
  en: ["supertonic"],
};

const LANGS: { lang: DubLang; label: string }[] = [
  { lang: "tr", label: "Türkçe" },
  { lang: "en", label: "İngilizce" },
];

/** Supertonic's voices, with the names and notes its demo gives them. */
const STYLES: Record<string, { name: string; note: string; group: string }> = {
  M1: { name: "Alex", note: "Canlı, enerjik, net.", group: "Erkek" },
  M2: { name: "James", note: "Kalın, sakin, ciddi.", group: "Erkek" },
  M3: { name: "Robert", note: "Otoriter, sunucu sesi.", group: "Erkek" },
  M4: { name: "Sam", note: "Yumuşak, genç, samimi.", group: "Erkek" },
  M5: { name: "Daniel", note: "Sıcak, anlatıcı.", group: "Erkek" },
  F1: { name: "Sarah", note: "Sakin, hafif pes.", group: "Kadın" },
  F2: { name: "Lily", note: "Neşeli, genç.", group: "Kadın" },
  F3: { name: "Jessica", note: "Net, spiker sesi.", group: "Kadın" },
  F4: { name: "Olivia", note: "Kendinden emin, etkileyici.", group: "Kadın" },
  F5: { name: "Emily", note: "Yumuşak, yatıştırıcı.", group: "Kadın" },
};

const STYLE_OPTIONS = Object.entries(STYLES).map(([value, s]) => ({ value, label: s.name, group: s.group }));

const PITCHES = [
  { pitch: -2.5, label: "Kalın" },
  { pitch: 0, label: "Normal" },
  { pitch: 3, label: "İnce" },
];

const PRESET =
  "h-[26px] flex-1 rounded-ui border border-line bg-raised text-[12px] text-fg-2 hover:not-disabled:text-fg aria-pressed:border-cini aria-pressed:text-white disabled:opacity-45";

function previewLabel(p: PreviewState) {
  if (p.status === "download")
    return `Model %${Math.floor((p.loaded / (p.total || 1)) * 100)}`;
  if (p.status === "running") return "Hazırlanıyor";
  if (p.status === "playing") return "Durdur";
  return "Dinle";
}

/** The inspector's dubbing tab: read the transcript aloud with a synthetic voice. */
export function DubPanel({
  state,
  stale,
  canDub,
  busy,
  onDub,
  onCancel,
  on,
  onOn,
  original,
  onOriginal,
  onOverflow,
  onExtendTrim,
  fileName,
  voice,
  onVoice,
  preview,
  onListen,
  translation,
  translationStale,
  translating,
  canTranslate,
  onTranslate,
}: {
  state: DubState;
  /** The transcript changed after the dub was made. */
  stale: boolean;
  canDub: boolean;
  /** A video export is running. */
  busy: boolean;
  onDub: () => void;
  onCancel: () => void;
  on: boolean;
  onOn: (on: boolean) => void;
  /** How loud the file's own sound stays under the dub, 0 to MAX_ORIGINAL. */
  original: number;
  onOriginal: (v: number) => void;
  /** Shows the line that runs past the end. */
  onOverflow: () => void;
  /** Lengthens the trim so the dub fits; null when there is no more video after it. */
  onExtendTrim: (() => void) | null;
  fileName: string;
  voice: Voice;
  onVoice: (v: Voice) => void;
  preview: PreviewState;
  onListen: () => void;
  /** The job has an English translation. */
  translation: boolean;
  /** The transcript changed after it was translated. */
  translationStale: boolean;
  translating: boolean;
  canTranslate: boolean;
  onTranslate: () => void;
}) {
  const working = state.status === "download" || state.status === "running";
  const setVoice = (v: Partial<Voice>) => onVoice({ ...voice, ...v });
  const model = MODELS[voice.model];
  const english = voice.lang === "en";
  const setLang = (lang: DubLang) =>
    setVoice({ lang, model: LANG_MODELS[lang].includes(voice.model) ? voice.model : LANG_MODELS[lang][0] });
  const modelOptions = LANG_MODELS[voice.lang].map((id) => ({ value: id, label: MODELS[id].name }));
  return (
    <div className={STUDIO}>
      <Section title="Yapay sesle seslendirme">
        <Hint>
          {english
            ? "İngilizce çeviri yapay bir sesle okunur. Her cümle Türkçesinin başladığı anda başlar; yerine sığmayan cümleler biraz hızlı okunur."
            : "Transkript yapay bir sesle yeniden okunur. Her altyazı satırı kendi zamanında başlar; yerine sığmayan satırlar biraz hızlı okunur."}{" "}
          Seçili ses ilk kullanımda yaklaşık {model.size} indirir.
        </Hint>
        <RowGroup role="group" aria-label="Seslendirme dili">
          <RowLabel>Dil</RowLabel>
          {LANGS.map((l) => (
            <button
              key={l.lang}
              type="button"
              className={PRESET}
              aria-pressed={voice.lang === l.lang}
              disabled={working}
              onClick={() => setLang(l.lang)}
            >
              {l.label}
            </button>
          ))}
        </RowGroup>
        {english && !translation && (
          <>
            <Hint>
              İngilizce seslendirme için önce transkript İngilizceye çevrilir.
            </Hint>
            <SectionActions>
              <Button
                variant="primary"
                disabled={!canTranslate || translating}
                onClick={onTranslate}
              >
                {translating ? "Çevriliyor" : "İngilizceye çevir"}
              </Button>
            </SectionActions>
          </>
        )}
        {english && translation && translationStale && (
          <Hint>
            Transkript çeviriden sonra değişti; seslendirme eski çeviriyi okur.
            Yazıya dök sekmesinden yeniden çevrilebilir.
          </Hint>
        )}
        {state.status === "download" && (
          <div className="flex items-center gap-2.5 text-[12px] text-fg-2">
            <span className="flex-1">
              Model indiriliyor %
              {Math.floor((state.loaded / (state.total || 1)) * 100)}
            </span>
            <Meter value={state.loaded / (state.total || 1)} />
          </div>
        )}
        {state.status === "running" && (
          <div className="flex items-center gap-2.5 text-[12px] text-fg-2">
            <span className="flex-1">
              {state.total
                ? `Seslendiriliyor ${state.done} / ${state.total}`
                : "Model hazırlanıyor"}
            </span>
            <Meter value={state.total ? state.done / state.total : 0} />
          </div>
        )}
        {state.status === "error" && (
          <Hint>Seslendirilemedi: {state.message}</Hint>
        )}
        {state.status === "done" && state.overflow && !stale && (
          <>
            <Hint>
              Son cümle videonun {onExtendTrim ? "seçili bölümünün " : ""}
              sonuna sığmadı; erken başlatılıp hızlandırıldığı hâlde sonundaki{" "}
              {state.overflow.seconds.toLocaleString("tr", { maximumFractionDigits: 1 })} sn
              duyulmaz. Cümleyi kısaltıp yeniden seslendirebilirsin
              {onExtendTrim ? " ya da bölümü uzatabilirsin." : "."}
            </Hint>
            <SectionActions>
              <Button onClick={onOverflow}>Cümleye git</Button>
              {onExtendTrim && (
                <Button onClick={onExtendTrim}>Bölümü uzat</Button>
              )}
            </SectionActions>
          </>
        )}
        {state.status === "done" && stale && (
          <Hint>
            {english ? "Çeviri" : "Transkript"}, ses ayarları ya da seçili bölüm seslendirmeden sonra değişti.
          </Hint>
        )}
        <SectionActions>
          {working ? (
            <Button onClick={onCancel}>Durdur</Button>
          ) : (
            <Button
              variant={
                state.status === "done" && !stale ? "default" : "primary"
              }
              disabled={!canDub || busy}
              onClick={onDub}
            >
              {state.status === "done" ? "Yeniden seslendir" : "Seslendir"}
            </Button>
          )}
          {state.status === "done" && (
            <a
              className="inline-flex h-7.25 items-center rounded-ui border border-line bg-raised px-3 text-[12.5px] font-medium text-fg no-underline hover:border-[#3f4752] hover:bg-raised-hover hover:text-white"
              href={state.url}
              download={fileName}
            >
              WAV indir
            </a>
          )}
        </SectionActions>
        {!canDub && state.status === "idle" && !(english && !translation) && (
          <Hint>Önce bir dosyayı yazıya dök.</Hint>
        )}
      </Section>
      <Section title="Ses">
        <RowGroup>
          <RowLabel>Model</RowLabel>
          <Select<VoiceModel>
            label="Ses modeli"
            value={voice.model}
            options={modelOptions}
            onChange={(id) => setVoice({ model: id })}
            disabled={working}
            render={(o, inList) => (
              <span className="flex min-w-0 items-baseline justify-between gap-3">
                <span className={OPT_TEXT}>
                  <span className={OPT_TITLE}>{o.label}</span>
                  {inList && (
                    <span className={OPT_NOTE}>{MODELS[o.value].short}</span>
                  )}
                </span>
                <span className={`${OPT_NOTE} flex-none tabular-nums`}>
                  {MODELS[o.value].size}
                </span>
              </span>
            )}
          />
        </RowGroup>
        {voice.model === "supertonic" && (
          <RowGroup>
            <RowLabel>Ses</RowLabel>
            <Select<string>
              label="Supertonic sesi"
              value={voice.style}
              options={STYLE_OPTIONS}
              onChange={(style) => setVoice({ style })}
              disabled={working}
              render={(o, inList) => (
                <span className={OPT_TEXT}>
                  <span className={OPT_TITLE}>{o.label}</span>
                  {inList && (
                    <span className={OPT_NOTE}>{STYLES[o.value].note}</span>
                  )}
                </span>
              )}
            />
          </RowGroup>
        )}
        {/* Supertonic has ten voices instead, and its pitch shift would speed it up past where it stays clear. */}
        {voice.model !== "supertonic" && (
          <>
            <RowGroup role="group" aria-label="Hazır ses tonları">
              <RowLabel>Ton</RowLabel>
              {PITCHES.map((p) => (
                <button
                  key={p.pitch}
                  type="button"
                  className={PRESET}
                  aria-pressed={voice.pitch === p.pitch}
                  disabled={working}
                  onClick={() => setVoice({ pitch: p.pitch })}
                >
                  {p.label}
                </button>
              ))}
            </RowGroup>
            <Row>
              <RowLabel>Yarım ton</RowLabel>
              <Range
                min={-4}
                max={4}
                step={0.5}
                value={voice.pitch}
                disabled={working}
                onChange={(e) => setVoice({ pitch: Number(e.target.value) })}
                onDoubleClick={() => setVoice({ pitch: DEFAULT_VOICE.pitch })}
              />
              <RowValue>
                {voice.pitch > 0 ? `+${voice.pitch}` : voice.pitch}
              </RowValue>
            </Row>
            <Hint>
              Sesin perdesi değişir, hızı ve satırların zamanlaması aynı kalır.
              ±3'ün ötesi yapay duyulur.
            </Hint>
          </>
        )}
        <RowGroup>
          <RowLabel>Seed</RowLabel>
          <input
            type="number"
            min={0}
            className="h-6.5 w-0 min-w-0 flex-1 rounded-ui border border-line bg-bg px-2 text-[12.5px] text-fg tabular-nums"
            value={voice.seed}
            disabled={working}
            aria-label="Seed"
            onChange={(e) =>
              setVoice({
                seed: Math.max(0, Math.floor(Number(e.target.value) || 0)),
              })
            }
          />
          <Button
            disabled={working}
            onClick={() =>
              setVoice({ seed: Math.floor(Math.random() * 100000) })
            }
          >
            Rastgele
          </Button>
        </RowGroup>
        <Hint>
          Aynı seed aynı okumayı verir; değiştirince aynı ses biraz farklı bir
          vurguyla okur.
        </Hint>
        <SectionActions>
          <Button disabled={working || busy} onClick={onListen}>
            {previewLabel(preview)}
          </Button>
        </SectionActions>
      </Section>
      <Section title="Dinleme ve dışa aktarma">
        <Row>
          <RowLabel wide>Yapay sesi kullan</RowLabel>
          <Switch
            checked={on}
            disabled={state.status !== "done" || busy}
            onChange={(e) => onOn(e.target.checked)}
          />
        </Row>
        <Row>
          <RowLabel>Orijinal ses</RowLabel>
          <Range
            min={0}
            max={MAX_ORIGINAL}
            step={0.05}
            value={original}
            disabled={busy}
            onChange={(e) => onOriginal(Number(e.target.value))}
            onDoubleClick={() => onOriginal(0)}
          />
          <RowValue>%{Math.round(original * 100)}</RowValue>
        </Row>
        <Hint>
          Açıkken oynatıcı ve altyazılı video yapay sesi kullanır. Orijinal ses
          {original > 0
            ? ` altta %${Math.round(original * 100)} seviyesinde duyulur; konuşma, müzik ve ortam sesi hafifçe kalır.`
            : " hiç duyulmaz; müzik ve ortam sesi de kalkar."}
        </Hint>
      </Section>
      <Section title="Model">
        <Hint>
          <a href={model.link}>{model.name}</a>, {model.note} Ses bu
          bilgisayarda üretilir. Paylaşırken sesin yapay zekâyla üretildiğini
          belirtmeyi unutma.
        </Hint>
      </Section>
    </div>
  );
}
