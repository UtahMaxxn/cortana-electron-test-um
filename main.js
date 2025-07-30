const { app, BrowserWindow, screen, ipcMain, shell, Notification, Tray, Menu } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs/promises');
const cityTimezones = require('city-timezones');


const APP_ID = 'com.blueysoft.cortana-electron';
app.setAppUserModelId(APP_ID);

let mainWindow;
const winWidth = 360;
const winHeight = 640;
let isWebViewVisible = false;
let isSettingsVisible = false;
let tray = null;
let isClosing = false;

let reminders = [];

let settings = {
  openAtLogin: true,
  preferredVoice: "Microsoft Zira Desktop",
  searchEngine: "bing",
  instantResponse: false,
  themeColor: "#0078d7",
  customResponses: [],
  isMovable: false
};
const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');
const REMINDERS_FILE = path.join(app.getPath('userData'), 'reminders.json');
let iconPath;

const isSilentStart = process.argv.includes('--hidden');

const gotTheLock = app.requestSingleInstanceLock();

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
        saveReminders();
      }, timeInMs);
      return timeout;
    }
    return null;
  };

async function saveReminders() {
    try {
        const remindersToSave = reminders.map(({ id, text, time }) => ({ id, text, time }));
        await fs.writeFile(REMINDERS_FILE, JSON.stringify(remindersToSave, null, 2));
    } catch (error) {
        console.error('Failed to save reminders:', error);
    }
}

async function loadReminders() {
    try {
        const data = await fs.readFile(REMINDERS_FILE, 'utf-8');
        const loadedReminders = JSON.parse(data);
        reminders = loadedReminders.map(r => {
            const timeout = scheduleReminder(r);
            return { ...r, timeout };
        }).filter(r => r.timeout !== null);
        await saveReminders();
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.error('Failed to load reminders:', error);
        }
        reminders = [];
    }
}

async function loadSettings() {
    try {
        const data = await fs.readFile(SETTINGS_FILE, 'utf-8');
        settings = { ...settings, ...JSON.parse(data) };
    } catch (error) {
        if (error.code !== 'ENOENT') {
           console.error('Failed to load settings, using defaults:', error);
        }
        await saveSettings();
    }
}

async function saveSettings() {
    try {
        await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2));
    } catch (error) {
        console.error('Failed to save settings:', error);
    }
}

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      showWindow();
    }
  });
  app.whenReady().then(async () => {
      const assetsPath = app.isPackaged
          ? path.join(process.resourcesPath, 'assets')
          : path.join(__dirname, 'assets');
      iconPath = path.join(assetsPath, 'icon.ico');

      await loadSettings();
      await loadReminders();
      
      app.setLoginItemSettings({
          openAtLogin: settings.openAtLogin,
          args: ['--hidden']
      });
      createWindow();
  });
}

function showWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (!mainWindow.isVisible()) {
      const point = screen.getCursorScreenPoint();
      const display = screen.getDisplayNearestPoint(point);
      const { x, height: screenHeight } = display.workArea;
      if (!settings.isMovable) {
          mainWindow.setPosition(x, screenHeight - winHeight);
      }
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
    show: false,
    movable: settings.isMovable,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webviewTag: true,
    },
  });

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
    if (isWebViewVisible || isSettingsVisible) {
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

  ipcMain.handle('get-settings', async () => {
      const loginSettings = app.getLoginItemSettings();
      if (settings.openAtLogin !== loginSettings.openAtLogin) {
          settings.openAtLogin = loginSettings.openAtLogin;
          await saveSettings();
      }
      return settings;
  });

  ipcMain.on('set-setting', async (event, { key, value }) => {
      if (key in settings) {
          settings[key] = value;
          if (key === 'openAtLogin') {
              app.setLoginItemSettings({
                  openAtLogin: value,
                  args: ['--hidden']
              });
          }
          if (key === 'isMovable') {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.setMovable(value);
                if (!value) {
                    const display = screen.getDisplayMatching(mainWindow.getBounds());
                    const { x, height: screenHeight } = display.workArea;
                    mainWindow.setPosition(x, screenHeight - winHeight);
                }
            }
          }
          await saveSettings();
      }
  });

  ipcMain.on('set-custom-responses', async (event, responses) => {
    if (Array.isArray(responses)) {
        settings.customResponses = responses;
        await saveSettings();
    }
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

  ipcMain.on('set-reminder', async (event, { reminder, reminderTime }) => {
    const newReminder = {
      id: Date.now().toString(),
      text: reminder,
      time: reminderTime,
      timeout: null
    };
    newReminder.timeout = scheduleReminder(newReminder);
    if (newReminder.timeout) {
      reminders.push(newReminder);
      await saveReminders();
    }
  });

  ipcMain.on('update-reminder', async (event, { id, reminder, reminderTime }) => {
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
      await saveReminders();
    }
  });

  ipcMain.on('remove-reminder', async (event, id) => {
    const reminderIndex = reminders.findIndex(r => r.id === id);
    if (reminderIndex !== -1) {
      clearTimeout(reminders[reminderIndex].timeout);
      reminders.splice(reminderIndex, 1);
      await saveReminders();
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

  ipcMain.on('set-settings-visibility', (event, visible) => {
    isSettingsVisible = visible;
  });

  
  ipcMain.handle('get-time-for-location', async (event, cityInput) => {
      try {
          const matches = cityTimezones.lookupViaCity(cityInput.trim());
          if (!matches || matches.length === 0) {
              throw new Error(`Could not find timezone for city: ${cityInput}`);
          }

          const timezone = matches[0].timezone;
          const url = `https://timeapi.io/api/Time/current/zone?timeZone=${encodeURIComponent(timezone)}`;
          const response = await fetch(url);
          if (!response.ok) {
              throw new Error(`Time API returned status ${response.status}`);
          }

          const data = await response.json();
          if (!data.dateTime) {
              throw new Error("Missing dateTime in API response");
          }

          const dateTime = new Date(data.dateTime);
          const formattedTime = dateTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

          return {
              city: matches[0].city,
              country: matches[0].country,
              timeZone: timezone,
              time: formattedTime,
          };

      } catch (error) {
          throw error;
      }
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