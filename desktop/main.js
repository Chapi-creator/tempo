const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs/promises');
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
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
autoUpdater.on('error', (err) => {
  console.error('[update] error:', err && err.message ? err.message : err);
});
app.whenReady().then(() => {
  try {
    autoUpdater.checkForUpdates();
  } catch (err) {
    console.error('[update] check falló:', err && err.message ? err.message : err);
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