const { app, BrowserWindow, ipcMain, powerSaveBlocker } = require('electron');
const path = require('path');
const isDev = process.env.NODE_ENV === 'development';

let mainWindow;
let powerSaveId = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'S3 Upload Tool v2',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Dev: load CRA dev server; Prod: load built React app
  mainWindow.loadURL(
    isDev ? 'http://localhost:3000' : `file://${path.join(__dirname, '../build/index.html')}`
  );

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(createWindow);

// Keep app running when all windows closed (upload in background)
app.on('window-all-closed', () => {
  // Don't quit — let uploads finish. Tray icon would go here in v2.
  // For now, quit normally. TODO: add system tray for background uploads.
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (!mainWindow) createWindow();
});

// --- IPC: prevent sleep during active uploads ---
ipcMain.handle('upload:start', () => {
  if (powerSaveId === null) {
    powerSaveId = powerSaveBlocker.start('prevent-app-suspension');
  }
});

ipcMain.handle('upload:complete', () => {
  if (powerSaveId !== null) {
    powerSaveBlocker.stop(powerSaveId);
    powerSaveId = null;
  }
});

// --- IPC: get app version ---
ipcMain.handle('app:version', () => app.getVersion());
