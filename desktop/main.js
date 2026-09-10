const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const fsSync = require('fs');
const { autoUpdater } = require('electron-updater');

const MAX_WRITE_BYTES = 5 * 1024 * 1024;
const MAX_READ_BYTES = 1024 * 1024;
const SAFE_NAME_RE = /^[A-Za-z0-9._\-\s]+$/;
const APP_FILE = 'index.html';

function isTrustedSender(event) {
  const frame = event.senderFrame;
  if (!frame) return false;
  const url = String(frame.url || '');
  return url.startsWith('file://') && path.basename(url) === APP_FILE;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 640,
    minHeight: 480,
    title: 'Tempo',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  });
  win.removeMenu();

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => {
    const appUrl = path.join(__dirname, 'app', APP_FILE);
    if (url !== 'file://' + appUrl.replace(/\\/g, '/') && !url.includes('/app/' + APP_FILE)) {
      event.preventDefault();
    }
  });
  win.webContents.on('will-attach-webview', (event) => event.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));

  win.loadFile(path.join(__dirname, 'app', APP_FILE));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---- Auto-update: parchea a los usuarios ante futuros CVEs ----
autoUpdater.autoDownload = true;

// Logger mínimo a disco: %APPDATA%/Tempo/logs/update.log (visible en producción,
// que la consola del proceso main no se ve).
const updateLog = (level, msg) => {
  try {
    const dir = path.join(app.getPath('userData'), 'logs');
    fsSync.mkdirSync(dir, { recursive: true });
    fsSync.appendFileSync(path.join(dir, 'update.log'),
      `${new Date().toISOString()} [${level}] ${msg}\n`);
  } catch (_e) { /* si el log falla, no romper la app */ }
};
autoUpdater.logger = {
  info: (m) => updateLog('info', String(m)),
  warn: (m) => updateLog('warn', String(m)),
  error: (m) => updateLog('error', String(m)),
  debug: (m) => updateLog('debug', String(m))
};
['update-available', 'update-not-available', 'download-progress', 'update-downloaded'].forEach((ev) => {
  autoUpdater.on(ev, (d) => updateLog('info', `${ev}: ${d && d.version ? d.version : ''} ${d && d.percent != null ? d.percent + '%' : ''}`));
});
autoUpdater.on('error', (err) => {
  updateLog('error', 'error: ' + (err && err.message ? err.message : err));
});
app.whenReady().then(() => {
  try {
    autoUpdater.checkForUpdates();
  } catch (err) {
    updateLog('error', 'check falló: ' + (err && err.message ? err.message : err));
  }
});

ipcMain.handle('save-file', async (event, payload) => {
  if (!isTrustedSender(event)) return null;
  const { defaultName, content } = payload || {};
  if (typeof defaultName !== 'string' || typeof content !== 'string') return null;
  if (!SAFE_NAME_RE.test(defaultName) || defaultName.length > 128) return null;
  if (Buffer.byteLength(content, 'utf8') > MAX_WRITE_BYTES) return null;
  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath: defaultName,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (canceled || !filePath) return null;
  await fs.writeFile(filePath, content, 'utf8');
  return filePath;
});

ipcMain.handle('open-file', async (event) => {
  if (!isTrustedSender(event)) return null;
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (canceled || !filePaths[0]) return null;
  const st = await fs.stat(filePaths[0]);
  if (st.size > MAX_READ_BYTES) return null;
  const content = await fs.readFile(filePaths[0], 'utf8');
  return { name: path.basename(filePaths[0]), content };
});