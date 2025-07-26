const { app, BrowserWindow, screen, ipcMain, shell, Notification, Tray, Menu } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs/promises');

const APP_ID = 'com.blueysoft.cortana-electron';
app.setAppUserModelId(APP_ID);

let mainWindow;
const winWidth = 360;
const winHeight = 640;
let isWebViewVisible = false;
let tray = null;
let isClosing = false;

let reminders = [];

const isSilentStart = process.argv.includes('--hidden');

app.setLoginItemSettings({
  openAtLogin: true,
  args: ['--hidden']
});

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      showWindow();
    }
  });
  app.whenReady().then(createWindow);
}

function showWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (!mainWindow.isVisible()) {
      const point = screen.getCursorScreenPoint();
      const display = screen.getDisplayNearestPoint(point);
      const { x, height: screenHeight } = display.workArea;
      mainWindow.setPosition(x, screenHeight - winHeight);
    }
    isClosing = false;
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send('trigger-enter-animation');
  }
}

async function findApplicationsIn(folder) {
  let results = [];
  try {
    const files = await fs.readdir(folder, { withFileTypes: true });
    for (const file of files) {
      const fullPath = path.join(folder, file.name);
      if (file.isDirectory()) {
        results = results.concat(await findApplicationsIn(fullPath));
      } else if (file.name.toLowerCase().endsWith('.lnk') || file.name.toLowerCase().endsWith('.exe')) {
        results.push({
          name: path.parse(file.name).name,
          path: fullPath
        });
      }
    }
  } catch (err) {
  }
  return results;
}

function createWindow() {
  const point = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(point);
  const { x, height: screenHeight } = display.workArea;

  mainWindow = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    x: x,
    y: screenHeight - winHeight,
    transparent: true,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    focusable: true,
    show: !isSilentStart,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webviewTag: true,
    },
  });

  const assetsPath = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, 'assets');
  const iconPath = path.join(assetsPath, 'icon.ico');

  tray = new Tray(iconPath);
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show Cortana', click: showWindow },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } }
  ]);
  tray.setToolTip('Cortana');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.isVisible() ? closeApp() : showWindow();
    }
  });

  const closeApp = () => {
    if (isClosing || !mainWindow || mainWindow.isDestroyed() || !mainWindow.isVisible()) {
      return;
    }
    isClosing = true;
    mainWindow.webContents.send('go-idle-and-close');
  };

  const handleBlur = () => {
    if (isWebViewVisible) {
      return;
    }
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }
    closeApp();
  };

  mainWindow.on('blur', handleBlur);
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      closeApp();
    }
  });

  ipcMain.on('hide-window', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.hide();
    }
    isClosing = false;
  });

  ipcMain.on('close-app', closeApp);
  ipcMain.on('open-external-link', (event, url) => {
    shell.openExternal(url);
    closeApp();
  });

  ipcMain.handle('find-application', async (event, query) => {
    const queryLower = query.toLowerCase();
    const allApps = new Map();

    const startMenuFolders = [
      path.join('C:', 'ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
      app.getPath('appData') ? path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs') : null
    ].filter(Boolean);

    for (const folder of startMenuFolders) {
      const appsInFolder = await findApplicationsIn(folder);
      for (const app of appsInFolder) {
        if (!allApps.has(app.name)) {
          allApps.set(app.name, app.path);
        }
      }
    }

    const matchingApps = [];
    for (const [name, path] of allApps.entries()) {
      if (name.toLowerCase().includes(queryLower)) {
        matchingApps.push({ name, path });
      }
    }
    return matchingApps;
  });

  ipcMain.on('open-application-fallback', (event, appName) => {
    const sanitizedAppName = appName.replace(/"/g, '');
    exec(`start "" "${sanitizedAppName}"`, (error) => {
      if (error) {
        console.error(`Fallback failed to open app ${appName}:`, error);
        mainWindow.webContents.send('command-failed', { command: 'open-application' });
      }
    });
  });

  ipcMain.on('open-path', (event, fsPath) => {
    shell.openPath(fsPath).catch(err => {
      console.error(`Failed to open path ${fsPath}:`, err);
    });
  });

  const scheduleReminder = (reminderData) => {
    const timeInMs = new Date(reminderData.time).getTime() - Date.now();
    if (timeInMs > 0) {
      const timeout = setTimeout(() => {
        if (Notification.isSupported()) {
          new Notification({
            title: 'Reminder',
            body: reminderData.text,
            icon: iconPath
          }).show();
        }
        reminders = reminders.filter(r => r.id !== reminderData.id);
      }, timeInMs);
      return timeout;
    }
    return null;
  };

  ipcMain.on('set-reminder', (event, { reminder, reminderTime }) => {
    const newReminder = {
      id: Date.now().toString(),
      text: reminder,
      time: reminderTime,
      timeout: null
    };
    newReminder.timeout = scheduleReminder(newReminder);
    if (newReminder.timeout) {
      reminders.push(newReminder);
    }
  });

  ipcMain.on('update-reminder', (event, { id, reminder, reminderTime }) => {
    const reminderIndex = reminders.findIndex(r => r.id === id);
    if (reminderIndex !== -1) {
      const existingReminder = reminders[reminderIndex];
      clearTimeout(existingReminder.timeout);

      const updatedReminder = {
        ...existingReminder,
        text: reminder,
        time: reminderTime
      };

      updatedReminder.timeout = scheduleReminder(updatedReminder);
      if (updatedReminder.timeout) {
        reminders[reminderIndex] = updatedReminder;
      } else {
        reminders.splice(reminderIndex, 1);
      }
    }
  });

  ipcMain.on('remove-reminder', (event, id) => {
    const reminderIndex = reminders.findIndex(r => r.id === id);
    if (reminderIndex !== -1) {
      clearTimeout(reminders[reminderIndex].timeout);
      reminders.splice(reminderIndex, 1);
    }
  });

  ipcMain.handle('get-reminders', () => {
    return reminders.map(({ id, text, time }) => ({ id, text, time }));
  });

  ipcMain.handle('get-app-version', () => {
    return app.getVersion();
  });

  ipcMain.on('set-webview-visibility', (event, visible) => {
    isWebViewVisible = visible;
  });

  mainWindow.loadFile('index.html');
  mainWindow.on('ready-to-show', () => {
    if (!isSilentStart) {
      showWindow();
    }
  });
}

app.on('window-all-closed', () => {
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});