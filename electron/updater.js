// Auto-update for the installed desktop app (GitHub Releases, via electron-updater).
//
// Where releases live is the `publish` block in electron-builder.yml; that file is
// baked into the build as app-update.yml, so there is a single place to change it.
// Updates are checked only in installed (packaged, non-store) builds: `--dev` and
// `electron .` have nothing to update, and MSIX / Mac App Store builds are updated
// by their stores, which would reject a self-replacing app anyway.

import { BrowserWindow, app, dialog } from "electron";
import updater from "electron-updater";

const { autoUpdater } = updater;
const EVERY = 6 * 60 * 60 * 1000;

export function setupUpdater() {
  if (!app.isPackaged || process.windowsStore || process.mas || process.env.HARFIYEN_NO_UPDATE) return;

  autoUpdater.autoDownload = true;
  // A "Sonra" answer still installs on the next normal quit.
  autoUpdater.autoInstallOnAppQuit = true;
  // Offline, rate-limited, no release yet: nothing to tell the user.
  autoUpdater.on("error", () => {});

  autoUpdater.on("update-downloaded", async (info) => {
    const parent = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    const options = {
      type: "info",
      title: "Harfiyen",
      message: `Harfiyen ${info.version} hazır`,
      detail: "Yeni sürüm indirildi. Şimdi yeniden başlatırsan kurulur; yoksa uygulamayı kapattığında kurulur.",
      buttons: ["Yeniden başlat", "Sonra"],
      defaultId: 0,
      cancelId: 1,
    };
    const { response } = parent ? await dialog.showMessageBox(parent, options) : await dialog.showMessageBox(options);
    if (response === 0) autoUpdater.quitAndInstall();
  });

  const check = () => void autoUpdater.checkForUpdates().catch(() => {});
  check();
  setInterval(check, EVERY).unref();
}
