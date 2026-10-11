import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_SETTINGS,
  presetById,
  type CaptionSettings,
} from "./captions/style";
import { ExportMenu } from "./components/ExportMenu";
import { MenuTitle } from "./components/Menu";
import {
  Button,
  EmptyNote,
  IconButton,
  LinkButton,
  Pane,
  PaneBody,
  PaneHead,
  PaneMeta,
  PaneTitle,
  TbLabel,
  toolbarButton,
} from "./components/ui";
import { Dropzone } from "./components/Dropzone";
import {
  ProjectList,
  ProjectName,
  ProjectsMenu,
} from "./components/ProjectsMenu";
import {
  IconGitHub,
  IconMic,
  IconMuted,
  IconOpen,
  IconPause,
  IconPlay,
  IconSound,
  IconUndo,
} from "./components/icons";
import { RecordButton } from "./components/RecordButton";
import { Inspector } from "./components/Inspector";
import { ModelMenu } from "./components/ModelMenu";
import { ProviderMenu } from "./components/ProviderMenu";
import { StatusBar } from "./components/StatusBar";
import { Timeline, TIMELINE } from "./components/Timeline";
import { Transcript } from "./components/Transcript";
import { Viewer } from "./components/Viewer";
import type { DecodeOptions, DecodingMethod, Word } from "./engine";
import { buildCues } from "./lib/cues";
import { replaceRange } from "./lib/edit";
import { plainWord } from "./punct/turkish";
import { download } from "./lib/exporters";
import { clock } from "./lib/format";
import { PROJECT_EXT, projectTitle, sameMedia } from "./lib/projectStore";
import { useBurner } from "./lib/useBurner";
import { usePlayer } from "./lib/usePlayer";
import { useProjects } from "./lib/useProjects";
import { modelIsCached, useTranscriber } from "./lib/useTranscriber";
import { DEFAULT_MODEL, modelInfo } from "./models";

const EMPTY_BANDS = new Float32Array(0);
/** Play and mute in the transport bar. */
const TP_BTN =
  "grid size-8 flex-none place-items-center rounded-ui border-0 bg-transparent text-fg transition-all duration-150 ease-[ease] hover:not-disabled:bg-raised hover:not-disabled:text-white disabled:opacity-35 max-[860px]:size-10";
/** Welcome-screen buttons: long file names are cut; full width on phones. */
const DROP_BTN =
  "min-w-0 max-w-full truncate max-[480px]:h-11 max-[480px]:w-full [&_svg]:mr-1.5";
const ACCEPT = `audio/*,video/*,.mkv,.mov,.m4a,.flac,.ogg,.opus,${PROJECT_EXT}`;

type PickerWindow = Window & {
  showOpenFilePicker?: (o: object) => Promise<FileSystemFileHandle[]>;
};
type HandleItem = DataTransferItem & {
  getAsFileSystemHandle?: () => Promise<FileSystemHandle | null>;
};
// Chromium's picker returns a handle, so a project can reopen the file later.
const PICKER_TYPES = [
  {
    description: "Video, ses veya Harfiyen projesi",
    accept: {
      "video/*": [".mp4", ".mov", ".mkv", ".webm", ".m4v"],
      "audio/*": [".mp3", ".m4a", ".wav", ".flac", ".ogg", ".opus", ".aac"],
      "application/json": [PROJECT_EXT],
    },
  },
];

const optionsFor = (method: DecodingMethod): DecodeOptions => ({
  method,
  maxActivePaths: 4,
  lmScale: 0.6,
  lodrScale: -0.5,
});

function loadSettings(): CaptionSettings {
  try {
    return {
      ...DEFAULT_SETTINGS,
      ...JSON.parse(localStorage.getItem("harfiyen.captions") ?? "{}"),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function baseName(name: string) {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(0, i) : name;
}

export function App() {
  const {
    engine,
    job,
    liveWaiting,
    provider,
    setProvider,
    model,
    setModel,
    prepare,
    start,
    load,
    attach,
    clear,
    startLive,
    stopLive,
    cancel,
    setWords,
    liveLevels,
    liveMeter,
    punctuate,
    punct,
  } = useTranscriber();
  const [autoPunct, setAutoPunct] = useState(
    () => localStorage.getItem("harfiyen.punct") !== "off",
  );
  useEffect(
    () => localStorage.setItem("harfiyen.punct", autoPunct ? "on" : "off"),
    [autoPunct],
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [method, setMethod] = useState<DecodingMethod>("beam-lm");
  const [settings, setSettings] = useState<CaptionSettings>(loadSettings);
  const [dragging, setDragging] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const burner = useBurner();
  const player = usePlayer(job?.file ?? null);
  const {
    projects: saved,
    current,
    saveable,
    noteHandle,
    open: openSaved,
    fromHandle,
    bind,
    remove,
    rename,
    importFile,
    exportText,
  } = useProjects(job, settings);
  /** A saved project opened without its media (not stored, or not found). */
  const needsMedia = !!job && !job.file && !job.live && !!current;
  /** The project's stored file handle, waiting for the user's permission. */
  const [pendingHandle, setPendingHandle] =
    useState<FileSystemFileHandle | null>(null);
  /** The last project file opened: picking its media starts in that folder. */
  const projectHandle = useRef<FileSystemFileHandle | null>(null);
  // Jobs already punctuated (or opened from a project): not punctuated again.
  const punctuated = useRef(new Set<number>());

  useEffect(
    () => localStorage.setItem("harfiyen.captions", JSON.stringify(settings)),
    [settings],
  );
  // Open the model right away when it is already in the cache.
  const initialModel = useRef(model);
  useEffect(() => {
    modelIsCached(initialModel.current).then((yes) => yes && prepare());
  }, [prepare]);

  const resetBurn = burner.reset;
  const openProject = useCallback(
    async (id: string) => {
      try {
        const r = await openSaved(id);
        if (!r) return;
        const { project: p, file, handle } = r;
        resetBurn();
        setPendingHandle(handle);
        setNotice(
          file && !sameMedia(p.media, file)
            ? "Medya dosyası proje kaydedildikten sonra değişmiş görünüyor, zamanlar kayabilir."
            : null,
        );
        setSettings(p.settings);
        setMethod(p.method);
        const jobId = load({
          file,
          model: p.model ?? DEFAULT_MODEL,
          options: optionsFor(p.method),
          duration: p.duration,
          elapsed: p.elapsed,
          words: p.words,
          peaks: p.peaks,
          bands: p.bands,
        });
        punctuated.current.add(jobId);
        bind(jobId, p, file);
      } catch {
        setNotice("Proje açılamadı.");
      }
    },
    [openSaved, resetBurn, load, bind],
  );
  const importProject = useCallback(
    async (f: File) => {
      try {
        const p = await importFile(f);
        await openProject(p.id);
      } catch (e) {
        setNotice(e instanceof Error ? e.message : String(e));
      }
    },
    [importFile, openProject],
  );
  const openFile = useCallback(
    (f: File, handle?: FileSystemFileHandle) => {
      if (f.name.toLowerCase().endsWith(PROJECT_EXT)) {
        projectHandle.current = handle ?? null;
        void importProject(f);
        return;
      }
      if (handle) noteHandle(f, handle);
      // A project waiting for its media takes the file, if it is the one.
      if (
        needsMedia &&
        current &&
        (sameMedia(current.media, f) ||
          confirm(
            `“${f.name}”, bu projenin dosyasıyla (“${current.media?.name}”) aynı görünmüyor. ` +
              "Yine de projeye bağlansın mı? İptal dersen yeni bir döküm başlar.",
          ))
      ) {
        setNotice(null);
        setPendingHandle(null);
        attach(f);
        return;
      }
      setPendingHandle(null);
      resetBurn();
      start(f, optionsFor(method));
    },
    [
      start,
      method,
      resetBurn,
      importProject,
      noteHandle,
      needsMedia,
      current,
      attach,
    ],
  );
  const pickFile = useCallback(async () => {
    const w = window as PickerWindow;
    if (!w.showOpenFilePicker) return picker.current?.click();
    try {
      const startIn = needsMedia
        ? (pendingHandle ?? projectHandle.current)
        : null;
      const [h] = await w.showOpenFilePicker({
        id: "harfiyen-media",
        types: PICKER_TYPES,
        ...(startIn && { startIn }),
      });
      openFile(await h.getFile(), h);
    } catch (e) {
      if ((e as DOMException).name !== "AbortError") picker.current?.click();
    }
  }, [openFile, needsMedia, pendingHandle]);
  const allowHandle = async () => {
    if (!pendingHandle) return;
    const file = await fromHandle(pendingHandle);
    if (file) {
      setPendingHandle(null);
      attach(file);
    } else {
      setPendingHandle(null);
      setNotice(
        "Dosyaya ulaşılamadı, taşınmış ya da silinmiş olabilir. Yeniden seç.",
      );
    }
  };
  const newProject = () => {
    setNotice(null);
    setPendingHandle(null);
    resetBurn();
    clear();
  };

  // Deleting the open project moves on to the next most recent one.
  const deleteProject = async (id: string) => {
    const wasOpen = current?.id === id;
    await remove(id);
    if (!wasOpen) return;
    const next = saved.find((p) => p.id !== id);
    if (next) void openProject(next.id);
    else newProject();
  };

  // The whole window is a drop target.
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes("Files");
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setDragging(true);
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (!depth) setDragging(false);
    };
    const over = (e: DragEvent) => hasFiles(e) && e.preventDefault();
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const f = e.dataTransfer!.files[0];
      if (!f) return;
      // The handle has to be asked for while the drop event is running.
      const item = [...e.dataTransfer!.items].find((i) => i.kind === "file");
      const handle = (
        item as HandleItem | undefined
      )?.getAsFileSystemHandle?.();
      if (!handle) return openFile(f);
      handle.then(
        (h) =>
          openFile(
            f,
            h?.kind === "file" ? (h as FileSystemFileHandle) : undefined,
          ),
        () => openFile(f),
      );
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, [openFile]);

  const words = job?.words ?? [];
  const liveWords = useMemo(
    () =>
      job?.tentative.length
        ? (job.words ?? []).concat(job.tentative)
        : (job?.words ?? []),
    [job?.words, job?.tentative],
  );
  // Timeline blocks follow the grouping of the chosen caption style.
  const groups = useMemo(
    () => buildCues(liveWords, presetById(settings.preset).grouping),
    [liveWords, settings.preset],
  );

  // Transcript edits, with undo (⌘Z / Ctrl+Z outside text fields).
  const history = useRef<{ jobId: number; words: Word[] }[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const editable = !!job && job.status !== "running" && words.length > 0;
  const onEdit = useCallback(
    (first: number, count: number, text: string) => {
      if (!job) return;
      history.current.push({ jobId: job.id, words: job.words });
      setCanUndo(true);
      setWords(replaceRange(job.words, first, count, text));
      if (burner.state.status === "done") resetBurn();
    },
    [job, setWords, burner.state.status, resetBurn],
  );
  const undo = useCallback(() => {
    const h = history.current;
    while (h.length && h[h.length - 1].jobId !== job?.id) h.pop();
    const prev = h.pop();
    if (prev) setWords(prev.words);
    setCanUndo(h.length > 0);
  }, [job?.id, setWords]);
  useEffect(() => {
    history.current = [];
    setCanUndo(false);
  }, [job?.id]);

  const chosen = modelInfo(model);
  // Why GPU-only models cannot run here, if they cannot.
  const gpuReason =
    provider === "wasm"
      ? "İşlemci (WASM) seçili; bu model ekran kartı gerektirir."
      : !("gpu" in navigator)
        ? "Bu tarayıcı WebGPU desteklemiyor."
        : engine.phase === "ready" && engine.provider === "wasm" && !chosen.gpuOnly
          ? (engine.fallbackReason ?? "Ekran kartı kullanılamıyor.")
          : null;

  // Punctuation and capitals, once per finished transcript (undo restores the plain text).
  const applyPunct = useCallback(async () => {
    if (!job || job.status !== "done" || !job.words.length) return;
    punctuated.current.add(job.id);
    const source = job.words;
    try {
      const written = await punctuate(
        source.map((w) => plainWord(w.text) || w.text),
      );
      history.current.push({ jobId: job.id, words: source });
      setCanUndo(true);
      setWords(source.map((w, i) => ({ ...w, text: written[i] })));
    } catch {
      // Shown in the status bar; the transcript stays as it was.
    }
  }, [job, punctuate, setWords]);
  useEffect(() => {
    if (
      autoPunct &&
      job?.status === "done" &&
      job.words.length &&
      !modelInfo(job.model).punctuates &&
      !punctuated.current.has(job.id)
    )
      void applyPunct();
  }, [autoPunct, job?.status, job?.id, job?.model, job?.words.length, applyPunct]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inField = !!(e.target as HTMLElement).closest(
        "input, textarea, select, [contenteditable]",
      );
      if (
        !inField &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        e.key.toLowerCase() === "r"
      ) {
        e.preventDefault();
        if (job?.recording || liveWaiting) void stopLive();
        else void goLiveRef.current();
        return;
      }
      if (
        (e.metaKey || e.ctrlKey) &&
        !e.shiftKey &&
        e.key.toLowerCase() === "z"
      ) {
        if (
          (e.target as HTMLElement).closest(
            "input, textarea, [contenteditable]",
          )
        )
          return;
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, job?.recording, liveWaiting, stopLive]);

  const changeSettings = (s: CaptionSettings) => {
    setSettings(s);
    if (burner.state.status === "done" || burner.state.status === "error")
      burner.reset();
  };

  const title = current
    ? projectTitle(current)
    : (job?.file?.name ?? (job?.live ? "Canlı kayıt" : ""));
  const name = current
    ? projectTitle(current)
    : job?.file
      ? baseName(job.file.name)
      : "canli-kayit";
  const exportProject = () => {
    const text = exportText();
    if (text) download(`${name}${PROJECT_EXT}`, text, "application/json");
  };

  // Only models that stream (seda) can transcribe the microphone.
  const micBlocked = chosen.live
    ? null
    : `Canlı kayıt ${chosen.name} ile yapılamaz; mikrofon için üst çubuktan ${modelInfo(DEFAULT_MODEL).name}'yı seç.`;
  // A finished transcript made with another model than the one chosen now.
  const otherModel =
    job && job.status !== "running" && job.file && job.model !== model
      ? modelInfo(job.model)
      : null;
  const goLiveRef = useRef<() => Promise<void>>(async () => {});
  const goLive = async () => {
    setNotice(null);
    resetBurn();
    if (micBlocked) return;
    try {
      await startLive(optionsFor(method));
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    }
  };
  goLiveRef.current = goLive;

  return (
    <div
      data-dragging={dragging || undefined}
      className="group/shell grid h-full grid-rows-[46px_minmax(0,1fr)_64px_26px] max-[860px]:flex max-[860px]:h-auto max-[860px]:min-h-full max-[860px]:flex-col max-[860px]:*:flex-none"
    >
      {/* On phones only the title may shrink; buttons keep their size. */}
      <header className="flex items-center gap-2 border-b border-line-soft bg-pane pr-3 pl-3.5 select-none max-[860px]:h-11 max-[860px]:gap-1.5 max-[860px]:px-2.5 max-[860px]:*:shrink-0">
        <h1 className="m-0 mr-2.5 flex items-center max-[480px]:mr-1">
          {/* The mobile header has no room for the wordmark; show the H mark. */}
          <picture>
            <source
              media="(max-width: 860px)"
              srcSet={`${import.meta.env.BASE_URL}brand/harfiyen-mark-light.png`}
            />
            <img
              className="block h-5 w-auto drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]"
              src={`${import.meta.env.BASE_URL}brand/harfiyen-logo-light.png`}
              alt="Harfiyen"
            />
          </picture>
        </h1>
        <a
          className="-ml-1.5 mr-2 text-[11px] tabular-nums text-fg-3 no-underline hover:text-fg-2 max-[480px]:hidden"
          href="https://github.com/ozcancelik/harfiyen/blob/main/CHANGELOG.md"
          target="_blank"
          rel="noopener noreferrer"
          title="Bu sürümde neler var"
        >
          v{__APP_VERSION__}
        </a>
        <button
          className={toolbarButton({ compact: true })}
          onClick={pickFile}
          title="Dosya aç"
        >
          <IconOpen /> <TbLabel>Dosya aç</TbLabel>
        </button>
        <ProjectsMenu
          projects={saved}
          currentId={current?.id}
          canExport={saveable}
          onOpen={openProject}
          onDelete={deleteProject}
          onNew={newProject}
          onExport={exportProject}
          onImport={pickFile}
        />
        <input
          ref={picker}
          type="file"
          accept={ACCEPT}
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) openFile(f);
            e.target.value = "";
          }}
        />
        <ProjectName
          key={current?.id}
          title={title}
          onRename={current ? (n) => rename(current.id, n) : undefined}
        />
        {job && (
          <ExportMenu
            words={words}
            baseName={name}
            meta={{
              file: title,
              model: modelInfo(job.model).spec,
              ...(job.model === "seda" && { method: job.options.method }),
            }}
            complete={job.status === "done"}
            isVideo={player.isVideo}
            canBurn={!!job.file}
            burn={burner.state}
            onBurn={() =>
              job.file && burner.burn(job.file, words, settings, job.bands)
            }
            onCancelBurn={burner.cancel}
          />
        )}
        <ModelMenu
          value={model}
          onChange={setModel}
          gpuReason={gpuReason}
          locked={
            job?.status === "running" ||
            punct.phase === "run" ||
            punct.phase === "download"
          }
        />
        <ProviderMenu
          value={provider}
          engine={engine}
          onChange={setProvider}
          cpuUnavailable={
            chosen.gpuOnly
              ? `${chosen.name} işlemcide çalışmaz; önce Seda'ya geç.`
              : null
          }
          locked={
            job?.status === "running" ||
            punct.phase === "run" ||
            punct.phase === "download"
          }
        />
        <a
          className={toolbarButton({ compact: true })}
          href="https://github.com/ozcancelik/harfiyen"
          target="_blank"
          rel="noopener noreferrer"
          title="Kaynak kodu GitHub'da"
        >
          <IconGitHub /> <TbLabel>GitHub</TbLabel>
        </a>
      </header>

      <div className="grid min-h-0 grid-cols-[minmax(260px,340px)_minmax(0,1fr)_312px] max-[1100px]:grid-cols-[minmax(220px,280px)_minmax(0,1fr)_280px] max-[860px]:contents">
        <Pane side="left" label="Transkript">
          <PaneHead>
            <PaneTitle>Transkript</PaneTitle>
            {job && liveWords.length > 0 && (
              <PaneMeta>{liveWords.length} kelime</PaneMeta>
            )}
            {canUndo && (
              <IconButton
                className="-my-1 -mr-1 self-center"
                onClick={undo}
                title="Geri al (⌘Z)"
                aria-label="Son düzenlemeyi geri al"
              >
                <IconUndo />
              </IconButton>
            )}
          </PaneHead>
          {otherModel && (
            <div className="flex flex-none items-center gap-2.5 border-b border-line-soft bg-cini-wash px-3.5 py-2 text-[12px] text-fg-2">
              <span className="min-w-0 flex-1">
                Bu döküm {otherModel.name} ile yapıldı.
              </span>
              <Button
                variant="primary"
                className="flex-none"
                onClick={() => job?.file && openFile(job.file)}
              >
                {chosen.name} ile yeniden dök
              </Button>
            </div>
          )}
          <PaneBody>
            {job ? (
              <Transcript
                words={words}
                tentative={job.tentative}
                running={job.status === "running"}
                waiting={
                  job.status === "running" &&
                  !job.live &&
                  engine.phase !== "ready" &&
                  engine.phase !== "error"
                }
                time={player.time}
                playing={player.playing}
                onSeek={player.seek}
                onEdit={editable ? onEdit : undefined}
              />
            ) : (
              <EmptyNote>
                Bir dosya açtığında konuşmalar burada, zaman kodlarıyla birlikte
                belirir.
              </EmptyNote>
            )}
          </PaneBody>
        </Pane>

        {/* On phones the empty state grows to fit the welcome text instead of clipping it. */}
        <main className="flex min-h-0 min-w-0 bg-bg p-3.5 max-[860px]:order-1 max-[860px]:h-[56vw] max-[860px]:min-h-[220px] max-[860px]:has-data-dropzone:h-auto max-[480px]:p-2.5">
          <Viewer
            player={player}
            words={liveWords}
            settings={settings}
            liveTime={job?.live && !job.file ? job.decoded : null}
            bands={job?.bands ?? EMPTY_BANDS}
            liveLevels={liveLevels}
          >
            {needsMedia ? (
              <Dropzone
                title={
                  dragging
                    ? "Bırak, bağlayalım"
                    : pendingHandle
                      ? "Video hazır, bir tık kaldı"
                      : "Medya dosyasını seç"
                }
                text={
                  pendingHandle
                    ? "Transkript ve stil geri yüklendi. Tarayıcı, kayıtlı dosyayı yeniden açmak için senin onayını istiyor."
                    : "Transkript ve stil geri yüklendi. Oynatmak ve altyazılı video oluşturmak için dosyayı yeniden seç; kelime zamanları korunur."
                }
                actions={
                  pendingHandle ? (
                    <>
                      <Button
                        variant="primary"
                        size="lg"
                        className={DROP_BTN}
                        onClick={allowHandle}
                        title={pendingHandle.name}
                      >
                        “{pendingHandle.name}” dosyasını aç
                      </Button>
                      <Button size="lg" className={DROP_BTN} onClick={pickFile}>
                        Başka dosya seç
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="primary"
                      size="lg"
                      className={DROP_BTN}
                      onClick={pickFile}
                      title={current.media?.name}
                    >
                      {current.media
                        ? `“${current.media.name}” dosyasını seç`
                        : "Dosyayı seç"}
                    </Button>
                  )
                }
                fine="Dosyayı pencereye de sürükleyebilirsin."
              />
            ) : (
              <Dropzone
                title={
                  dragging ? "Bırak, başlayalım" : "Video ya da ses dosyası aç"
                }
                text="Türkçe konuşmayı yazıya döker, altyazıyı videonun içine yazar. Her şey bu bilgisayarda, ekran kartında çalışır; dosyan hiçbir yere gönderilmez."
                actions={
                  <>
                    <Button
                      variant="primary"
                      size="lg"
                      className={DROP_BTN}
                      onClick={pickFile}
                    >
                      Dosya aç
                    </Button>
                    {liveWaiting ? (
                      <Button
                        size="lg"
                        className={DROP_BTN}
                        onClick={stopLive}
                        title="Kayıt beklemesini iptal et"
                      >
                        Model hazırlanıyor, iptal et
                      </Button>
                    ) : (
                      <Button
                        size="lg"
                        className={DROP_BTN}
                        onClick={goLive}
                        disabled={!!micBlocked}
                        title={micBlocked ?? undefined}
                      >
                        <IconMic /> Mikrofonla başla
                      </Button>
                    )}
                  </>
                }
                fine={
                  <>
                    Dosyayı pencereye sürükleyebilirsin: MP4, MOV, MKV, WebM,
                    MP3, M4A, WAV, FLAC, OGG. İlk kullanımda yaklaşık{" "}
                    {chosen.size} model ({chosen.name}) indirilir ve
                    saklanır.
                    {engine.phase === "idle" && (
                      <>
                        {" "}
                        <LinkButton onClick={prepare}>Şimdi indir</LinkButton>
                      </>
                    )}
                  </>
                }
              >
                {!job && saved.length > 0 && (
                  <div className="mt-2.5 grid w-full gap-0.5 border-t border-line pt-3 text-left">
                    <MenuTitle>Son projeler</MenuTitle>
                    <ProjectList
                      projects={saved}
                      onOpen={openProject}
                      onDelete={deleteProject}
                      limit={3}
                    />
                  </div>
                )}
              </Dropzone>
            )}
          </Viewer>
        </main>

        <Inspector
          settings={settings}
          onSettings={changeSettings}
          burning={burner.state.status === "running"}
          model={model}
          method={method}
          onMethod={setMethod}
          job={job}
          engine={engine}
          onRestart={() => job?.file && openFile(job.file)}
          autoPunct={autoPunct}
          onAutoPunct={setAutoPunct}
          onPunctuate={applyPunct}
          punctBusy={punct.phase === "run" || punct.phase === "download"}
          onCancel={cancel}
        />
      </div>

      <div className="flex items-center gap-2 border-t border-line-soft bg-pane px-3.5 max-[860px]:order-2 max-[860px]:flex-wrap max-[860px]:gap-y-1 max-[860px]:px-2.5 max-[860px]:pt-2.5 max-[860px]:pb-1.5">
        <RecordButton
          recording={!!job?.recording}
          waiting={liveWaiting}
          onStart={goLive}
          disabledReason={micBlocked}
          onStop={stopLive}
        />
        <span className="mx-1 h-[22px] w-px flex-none bg-line" aria-hidden />
        <button
          className={TP_BTN}
          onClick={player.toggle}
          disabled={!job || job.recording}
          aria-label={player.playing ? "Duraklat" : "Oynat"}
        >
          {player.playing ? <IconPause /> : <IconPlay />}
        </button>
        <span className="min-w-24 flex-none text-[12px] text-fg-3 tabular-nums [font-feature-settings:'tnum'_1] max-[860px]:min-w-0 max-[860px]:flex-1 max-[860px]:text-[13px]">
          <strong className="font-semibold text-fg">
            {clock(player.time)}
          </strong>{" "}
          / {clock(player.duration || job?.duration || 0)}
        </span>
        <button
          className={TP_BTN}
          onClick={() => player.setMuted(!player.muted)}
          disabled={!job || job.recording}
          aria-label={player.muted ? "Sesi aç" : "Sesi kapat"}
        >
          {player.muted ? <IconMuted /> : <IconSound />}
        </button>
        {job ? (
          <Timeline
            peaks={job.peaks}
            duration={player.duration || job.duration || 0}
            decoded={job.decoded}
            time={player.time}
            media={player.el}
            cues={groups}
            live={job.recording ? liveMeter.current : null}
            onSeek={player.seek}
          />
        ) : (
          <div className={TIMELINE} />
        )}
      </div>

      <StatusBar
        engine={engine}
        job={job}
        burn={burner.state}
        notice={notice}
        punct={punct}
        liveWaiting={liveWaiting}
      />
    </div>
  );
}
