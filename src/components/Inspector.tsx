import { useState } from "react";
import type { CaptionSettings } from "../captions/style";
import type { DecodingMethod } from "../engine";
import type { DubState, PreviewState, Voice } from "../lib/useDubber";
import type { EngineState, Job } from "../lib/useTranscriber";
import { modelInfo, type ModelId } from "../models";
import { CaptionStudio, STUDIO } from "./CaptionStudio";
import { DubPanel } from "./DubPanel";
import { MethodPicker, methodTitle } from "./MethodPicker";
import { Button, Hint, Pane, PaneBody, Row, RowLabel, Section, SectionActions, Switch } from "./ui";

const TAB =
  "h-[26px] flex-1 rounded-[5px] border-0 bg-transparent text-[12px] font-medium tracking-[-0.01em] text-fg-2 transition-all duration-150 ease-[ease] hover:not-aria-selected:text-fg aria-selected:bg-raised aria-selected:font-[550] aria-selected:text-white aria-selected:shadow-[0_1px_3px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.06)]";

type Tab = "captions" | "transcribe" | "dub";

export function Inspector({
  settings,
  onSettings,
  burning,
  model,
  method,
  onMethod,
  job,
  engine,
  onRestart,
  onCancel,
  autoPunct,
  onAutoPunct,
  onPunctuate,
  punctBusy,
  dub,
  dubStale,
  canDub,
  onDub,
  onCancelDub,
  dubOn,
  onDubOn,
  dubName,
  voice,
  onVoice,
  preview,
  onListen,
}: {
  settings: CaptionSettings;
  onSettings: (s: CaptionSettings) => void;
  burning: boolean;
  model: ModelId;
  method: DecodingMethod;
  onMethod: (m: DecodingMethod) => void;
  job: Job | null;
  engine: EngineState;
  onRestart: () => void;
  onCancel: () => void;
  autoPunct: boolean;
  onAutoPunct: (on: boolean) => void;
  onPunctuate: () => void;
  punctBusy: boolean;
  dub: DubState;
  dubStale: boolean;
  canDub: boolean;
  onDub: () => void;
  onCancelDub: () => void;
  dubOn: boolean;
  onDubOn: (on: boolean) => void;
  dubName: string;
  voice: Voice;
  onVoice: (v: Voice) => void;
  preview: PreviewState;
  onListen: () => void;
}) {
  const [tab, setTab] = useState<Tab>("captions");
  const running = job?.status === "running";
  const info = modelInfo(model);
  // What a new run would change: the model, or (seda only) the method.
  const differs = job && (model !== job.model || (model === "seda" && method !== job.options.method));
  const restartLabel = !differs
    ? "Yeniden yazıya dök"
    : model !== job.model
      ? `${info.name} ile yeniden dök`
      : `${methodTitle(method)} ile yeniden dök`;

  return (
    <Pane side="right">
      <div
        className="mx-3 mt-2.5 mb-1.5 flex gap-0.5 rounded-lg border border-line-soft bg-[#101316] p-[3px]"
        role="tablist"
      >
        <button className={TAB} role="tab" aria-selected={tab === "captions"} onClick={() => setTab("captions")}>
          Altyazı
        </button>
        <button className={TAB} role="tab" aria-selected={tab === "transcribe"} onClick={() => setTab("transcribe")}>
          Yazıya döküm
        </button>
        <button className={TAB} role="tab" aria-selected={tab === "dub"} onClick={() => setTab("dub")}>
          Seslendirme
        </button>
      </div>
      <PaneBody>
        {tab === "captions" ? (
          <CaptionStudio settings={settings} onChange={onSettings} disabled={burning} />
        ) : tab === "dub" ? (
          <DubPanel
            state={dub}
            stale={dubStale}
            canDub={canDub}
            busy={burning}
            onDub={onDub}
            onCancel={onCancelDub}
            on={dubOn}
            onOn={onDubOn}
            fileName={dubName}
            voice={voice}
            onVoice={onVoice}
            preview={preview}
            onListen={onListen}
          />
        ) : (
          <div className={STUDIO}>
            <Section title="Doğruluk">
              {info.id === "seda" ? (
                <MethodPicker value={method} onChange={onMethod} disabled={running} />
              ) : (
                <Hint>
                  {info.name} sesi 30 saniyelik parçalar hâlinde işler; kelimeler her parça bitince gelir. Model
                  seçimi üst çubukta.
                </Hint>
              )}
              {job && (
                <SectionActions>
                  {running ? (
                    <Button onClick={onCancel}>Durdur</Button>
                  ) : (
                    <Button variant="primary" onClick={onRestart}>
                      {restartLabel}
                    </Button>
                  )}
                </SectionActions>
              )}
            </Section>
            <Section title="Noktalama ve büyük harf">
              <Row>
                <RowLabel wide>Otomatik ekle</RowLabel>
                <Switch checked={autoPunct} onChange={(e) => onAutoPunct(e.target.checked)} />
              </Row>
              <Hint>
                {info.punctuates
                  ? `${info.name} noktalamayı ve büyük harfleri kendisi yazar; bu ayar Seda dökümleri için. `
                  : ""}
                Yazıya döküm bitince nokta, virgül ve soru işareti eklenir; cümle başları ve özel adlar büyük harfle
                yazılır ("İstanbul'da"). ⌘Z ile geri alınır. İlk kullanımda yaklaşık 60 MB model indirilir.
              </Hint>
              {job && (
                <SectionActions>
                  <Button disabled={running || punctBusy || !job.words.length} onClick={onPunctuate}>
                    {punctBusy ? "Ekleniyor…" : "Şimdi uygula"}
                  </Button>
                </SectionActions>
              )}
            </Section>
            <Section title="Model">
              <dl className="m-0 grid grid-cols-[88px_1fr] gap-x-2.5 gap-y-1.5 text-[12.5px] [&_dd]:m-0 [&_dt]:text-fg-3">
                <dt>Model</dt>
                <dd>
                  <a href={info.link}>{info.spec}</a>
                  {info.engine === "seda" ? ", Türkçe" : ", çok dilli (Türkçe seçili)"}
                </dd>
                <dt>Çalıştığı yer</dt>
                <dd>
                  {engine.phase === "ready"
                    ? engine.provider === "webgpu"
                      ? `WebGPU${engine.gpu ? `, ${engine.gpu}` : ""}`
                      : "İşlemci (WASM)"
                    : "Henüz yüklenmedi"}
                </dd>
                <dt>Gizlilik</dt>
                <dd>Ses ve video bu bilgisayardan çıkmaz.</dd>
              </dl>
              <Hint>
                {info.id === "seda" && 'Sayılar yazıyla gelir ("bin dokuz yüz yirmi üç"). '}
                Bir kelimeye tıklayınca kayıt o ana atlar.
              </Hint>
            </Section>
          </div>
        )}
      </PaneBody>
    </Pane>
  );
}
