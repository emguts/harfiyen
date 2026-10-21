// Harfiyen's desktop shell: the same app as the web build, in its own window.
//
//   electron .          serves dist/ (run `vite build` first)
//   electron . --dev    starts the Vite dev server in this process and loads it
//
// The built app is served from https://app.harfiyen.localhost, answered here and
// never sent to the network. A real https origin, not a custom scheme, because
// the Cache API that keeps downloaded models (src/worker/modelStore.ts) only
// accepts http(s) URLs. The origin is fixed, so projects and models stored by
// the page survive restarts.

import { existsSync, statSync } from "node:fs";
import { extname, isAbsolute, join, normalize, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { BrowserWindow, app, dialog, net, protocol, shell } from "electron";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = join(root, "dist");
const dev = process.argv.includes("--dev");
const HOST = "app.harfiyen.localhost";

// Same cross-origin isolation the web hosting sends (public/_headers): it lets
// onnxruntime-web use SharedArrayBuffer.
const isolation = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Resource-Policy": "same-origin",
};

// Chromium guesses most types from file:// itself; these it does not know.
const types = {
  ".mjs": "text/javascript",
  ".wasm": "application/wasm",
  ".webmanifest": "application/manifest+json",
  ".onnx": "application/octet-stream",
};

app.setName("Harfiyen");
if (process.platform === "win32") app.setAppUserModelId("dev.harfiyen.app");

// One window: opening the app again brings the running one forward.
if (!app.requestSingleInstanceLock()) app.quit();

/** The file under dist/ a request asks for; paths without an extension get the page itself. */
function fileFor(pathname) {
  const path = normalize(join(dist, decodeURIComponent(pathname)));
  const rel = relative(dist, path);
  if (rel.startsWith("..") || isAbsolute(rel)) return null;
  if (existsSync(path) && statSync(path).isFile()) return path;
  return extname(path) ? null : join(dist, "index.html");
}

async function serve(req) {
  const file = fileFor(new URL(req.url).pathname);
  if (!file) return new Response("Not found", { status: 404, headers: isolation });
  const res = await net.fetch(pathToFileURL(file).href);
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(isolation)) headers.set(k, v);
  const type = types[extname(file)];
  if (type) headers.set("Content-Type", type);
  return new Response(res.body, { status: res.status, headers });
}

/** The address to load: the dev server's, or the built app's. */
async function start() {
  if (dev) {
    const { createServer } = await import("vite");
    const server = await createServer({ root, configFile: join(root, "vite.config.ts") });
    await server.listen();
    app.on("will-quit", () => void server.close());
    return server.resolvedUrls.local[0];
  }
  if (!existsSync(join(dist, "index.html"))) {
    dialog.showErrorBox("Harfiyen", `Derlenmiş uygulama bulunamadı:\n${dist}${sep}index.html\n\nÖnce 'npm run build' çalıştır.`);
    app.exit(1);
    return null;
  }
  protocol.handle("https", (req) =>
    new URL(req.url).host === HOST ? serve(req) : net.fetch(req, { bypassCustomProtocolHandlers: true }),
  );
  return `https://${HOST}/`;
}

function open(url) {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 760,
    minHeight: 560,
    show: false,
    backgroundColor: "#16191d",
    autoHideMenuBar: true,
    icon: join(root, "public", "icon-512.png"),
    // A transcription keeps going at full speed while the window is minimised.
    webPreferences: { backgroundThrottling: false },
  });
  const { origin } = new URL(url);
  // Links leaving the app (GitHub, model pages) open in the default browser.
  const external = (target) => {
    if (/^https?:/.test(target)) void shell.openExternal(target);
  };
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    if (new URL(target).origin !== origin) external(target);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, target) => {
    if (new URL(target).origin === origin) return;
    e.preventDefault();
    external(target);
  });
  win.once("ready-to-show", () => win.show());
  void win.loadURL(url);
  return win;
}

app.whenReady().then(async () => {
  const url = await start();
  if (!url) return;
  let win = open(url);
  app.on("second-instance", () => {
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) win = open(url);
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
