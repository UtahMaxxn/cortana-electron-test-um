const {
  app,
  BrowserWindow,
  screen,
  ipcMain,
  shell,
  Notification,
  Tray,
  Menu,
  dialog,
} = require("electron");
const path = require("path");
const https = require("https");
const { exec } = require("child_process");
const fs = require("fs/promises");
const cityTimezones = require("city-timezones");

let updateAvailable = false;
const GITHUB_RAW_URL =
  "https://raw.githubusercontent.com/SoftBluey/Cortana-Electron/refs/heads/main/package.json";

const APP_ID = "com.blueysoft.cortana-electron";
app.setAppUserModelId(APP_ID);

let mainWindow;
const winWidth = 360;
const winHeight = 640;
let isSettingsVisible = false;
let tray = null;
let isClosing = false;

let applicationCache = new Map();

let reminders = [];

let settings = {
  openAtLogin: true,
  preferredVoice: "Microsoft Zira Desktop",
  searchEngine: "bing",
  instantResponse: false,
  themeColor: "#0078d7",
  customActions: [],
  isMovable: false,
  pitch: 1,
  rate: 1,
  idleGreetingMode: "random",
  specificIdleGreeting: "What's on your mind?",
  customIdleGreeting: "",
  webSearchEnabled: false,
  apiKey: "",
  providerAddress: "",
};
const SETTINGS_FILE = path.join(app.getPath("userData"), "settings.json");
const REMINDERS_FILE = path.join(app.getPath("userData"), "reminders.json");
let iconPath;

const isSilentStart = process.argv.includes("--hidden");

const gotTheLock = app.requestSingleInstanceLock();

const scheduleReminder = (reminderData) => {
  const timeInMs = new Date(reminderData.time).getTime() - Date.now();
  if (timeInMs > 0) {
    const timeout = setTimeout(() => {
      if (Notification.isSupported()) {
        new Notification({
          title: `⏰ Reminder`,
          body: `It's time for: ${reminderData.text}`,
          icon: iconPath,
        }).show();
      }
      // remove the fired reminder
      reminders = reminders.filter((r) => r.id !== reminderData.id);
      saveReminders();
    }, timeInMs);
    return timeout;
  }
  return null;
};

async function saveReminders() {
  try {
    const remindersToSave = reminders.map(({ id, text, time }) => ({
      id,
      text,
      time,
    }));
    await fs.writeFile(
      REMINDERS_FILE,
      JSON.stringify(remindersToSave, null, 2)
    );
  } catch (error) {
    console.error("Failed to save reminders:", error);
  }
}

async function loadReminders() {
  try {
    const data = await fs.readFile(REMINDERS_FILE, "utf-8");
    const loadedReminders = JSON.parse(data);
    reminders = loadedReminders
      .map((r) => {
        const timeout = scheduleReminder(r);
        return { ...r, timeout };
      })
      .filter((r) => r.timeout !== null);
    await saveReminders();
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("Failed to load reminders:", error);
    }
    reminders = [];
  }
}

async function loadSettings() {
  try {
    const data = await fs.readFile(SETTINGS_FILE, "utf-8");
    const parsed = JSON.parse(data);
    settings = { ...settings, ...parsed };
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("Failed to load settings, using defaults:", error);
    }
    await saveSettings();
  }
}

function compareVersions(v1, v2) {
  const v1Parts = v1.split(".").map(Number);
  const v2Parts = v2.split(".").map(Number);

  for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
    const v1Part = v1Parts[i] || 0;
    const v2Part = v2Parts[i] || 0;
    if (v1Part > v2Part) return 1;
    if (v1Part < v2Part) return -1;
  }
  return 0;
}

async function checkForUpdates() {
  try {
    const currentVersion = app.getVersion();

    const response = await new Promise((resolve, reject) => {
      https
        .get(GITHUB_RAW_URL, (res) => {
          if (res.statusCode !== 200) {
            reject(new Error(`Request failed with status ${res.statusCode}`));
            return;
          }

          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => resolve(data));
        })
        .on("error", reject);
    });

    const remotePackage = JSON.parse(response);
    const remoteVersion = remotePackage.version;

    updateAvailable = compareVersions(currentVersion, remoteVersion) < 0;

    if (mainWindow) {
      mainWindow.webContents.send("update-status", {
        available: updateAvailable,
        currentVersion,
        remoteVersion,
      });
    }

    return { available: updateAvailable, currentVersion, remoteVersion };
  } catch (error) {
    console.error("Failed to check for updates:", error);
    return { available: false, error: error.message };
  }
}

async function saveSettings() {
  try {
    await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2));
  } catch (error) {
    console.error("Failed to save settings:", error);
  }
}

if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      showWindow();
    }
  });

  const sendAppVersion = async () => {
    if (mainWindow) {
      const currentVersion = app.getVersion();
      mainWindow.webContents.send("update-status", {
        currentVersion: currentVersion,
      });
    }
  };
  app.whenReady().then(async () => {
    const assetsPath = app.isPackaged
      ? path.join(process.resourcesPath, "assets")
      : path.join(__dirname, "assets");
    iconPath = path.join(assetsPath, "icon.ico");

    await loadSettings();
    await loadReminders();
    await scanApplications(); // Call scanApplications here

    app.setLoginItemSettings({
      openAtLogin: settings.openAtLogin,
      args: ["--hidden"],
    });
    createWindow();

    // Check for updates in the background
    sendAppVersion();
  });
}

function showWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (!mainWindow.isVisible() && !settings.isMovable) {
      const point = screen.getCursorScreenPoint();
      const display = screen.getDisplayNearestPoint(point);
      const { x, height: screenHeight } = display.workArea;
      mainWindow.setPosition(x, screenHeight - winHeight);
    }
    isClosing = false;
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send("trigger-enter-animation");
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
      } else if (
        file.name.toLowerCase().endsWith(".lnk") ||
        file.name.toLowerCase().endsWith(".exe")
      ) {
        results.push({
          name: path.parse(file.name).name,
          path: fullPath,
        });
      }
    }
  } catch (err) {
    console.error(`Failed to read application folder: ${folder}`, err);
  }
  return results;
}

async function scanApplications() {
  applicationCache.clear();
  const startMenuFolders = [
    path.join(
      "C:",
      "ProgramData",
      "Microsoft",
      "Windows",
      "Start Menu",
      "Programs"
    ),
    app.getPath("appData")
      ? path.join(
          app.getPath("appData"),
          "Microsoft",
          "Windows",
          "Start Menu",
          "Programs"
        )
      : null,
  ].filter(Boolean);

  for (const folder of startMenuFolders) {
    const appsInFolder = await findApplicationsIn(folder);
    for (const app of appsInFolder) {
      if (!applicationCache.has(app.name)) {
        applicationCache.set(app.name, app.path);
      }
    }
  }
  console.log(`Scanned and cached ${applicationCache.size} applications.`);
}

function createWindow() {
  const winOptions = {
    width: winWidth,
    height: winHeight,
    frame: settings.isMovable,
    transparent: !settings.isMovable,
    resizable: settings.isMovable,
    alwaysOnTop: !settings.isMovable,
    focusable: true,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  };

  if (!settings.isMovable) {
    const point = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(point);
    const { x, height: screenHeight } = display.workArea;
    winOptions.x = x;
    winOptions.y = screenHeight - winHeight;
  }

  mainWindow = new BrowserWindow(winOptions);
  if (settings.isMovable) {
    mainWindow.setMenu(null);
  }

  tray = new Tray(iconPath);
  const contextMenu = Menu.buildFromTemplate([
    { label: "Show Cortana", click: showWindow },
    {
      label: "Settings",
      click: () => {
        if (mainWindow) {
          showWindow();
          mainWindow.webContents.send("show-settings-ui");
        }
      },
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setToolTip("Cortana");
  tray.setContextMenu(contextMenu);
  tray.on("click", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.isVisible() ? closeApp() : showWindow();
    }
  });

  const closeApp = () => {
    if (
      isClosing ||
      !mainWindow ||
      mainWindow.isDestroyed() ||
      !mainWindow.isVisible()
    ) {
      return;
    }
    isClosing = true;
    mainWindow.webContents.send("go-idle-and-close");
  };

  const handleBlur = () => {
    if (isSettingsVisible || settings.isMovable) {
      return;
    }
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }
    closeApp();
  };

  mainWindow.on("blur", handleBlur);
  mainWindow.on("close", (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      if (settings.isMovable) {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.hide();
        }
      } else {
        closeApp();
      }
    }
  });

  ipcMain.on("hide-window", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.hide();
    }
    isClosing = false;
  });

  ipcMain.on("close-app", closeApp);
  ipcMain.on("open-external-link", (event, url) => {
    shell.openExternal(url);
  });

  ipcMain.handle("get-settings", async () => {
    const loginSettings = app.getLoginItemSettings();
    if (settings.openAtLogin !== loginSettings.openAtLogin) {
      settings.openAtLogin = loginSettings.openAtLogin;
      await saveSettings();
    }
    return settings;
  });

  ipcMain.on("set-setting", async (event, { key, value }) => {
    if (key in settings) {
      settings[key] = value;
      if (key === "openAtLogin") {
        app.setLoginItemSettings({
          openAtLogin: value,
          args: ["--hidden"],
        });
      }
      if (key === "isMovable") {
        app.relaunch();
        app.exit();
      }
      await saveSettings();
    }
  });

  ipcMain.on("set-custom-actions", async (event, actions) => {
    if (Array.isArray(actions)) {
      settings.customActions = actions;
      await saveSettings();
    }
  });

  ipcMain.on("reset-all-settings", async () => {
    try {
      reminders.forEach((reminder) => {
        if (reminder.timeout) clearTimeout(reminder.timeout);
      });
      reminders = [];
      settings.customActions = [];

      await fs.unlink(SETTINGS_FILE).catch((err) => {
        if (err.code !== "ENOENT") throw err;
      });
      await fs.unlink(REMINDERS_FILE).catch((err) => {
        if (err.code !== "ENOENT") throw err;
      });

      app.relaunch();
      app.exit();
    } catch (error) {
      console.error("Failed to reset all settings:", error);
    }
  });

  ipcMain.handle("find-application", async (event, query) => {
    const queryLower = query.toLowerCase();
    const matchingApps = [];

    for (const [name, path] of applicationCache.entries()) {
      if (name.toLowerCase().includes(queryLower)) {
        matchingApps.push({ name, path });
      }
    }
    return matchingApps;
  });

  ipcMain.handle("open-application-fallback", async (event, appName) => {
    const sanitizedAppName = appName.replace(/"/g, "");
    return new Promise((resolve) => {
      exec(`start "" "${sanitizedAppName}"`, (error) => {
        if (error) {
          console.error(`Fallback failed to open app ${appName}:`, error);
          mainWindow.webContents.send("command-failed", {
            command: "open-application",
          });
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
  });

  ipcMain.on("open-path", (event, fsPath) => {
    shell.openPath(fsPath).catch((err) => {
      console.error(`Failed to open path ${fsPath}:`, err);
    });
  });

  ipcMain.on("run-command", (event, command) => {
    exec(command, (error) => {
      if (error) {
        console.error(`Failed to execute command "${command}":`, error);
        mainWindow.webContents.send("command-failed", {
          command: "run-command",
        });
      }
    });
  });

  ipcMain.handle("show-open-dialog", async (event, options) => {
    if (!mainWindow) return;
    const result = await dialog.showOpenDialog(mainWindow, options);
    return result;
  });

  ipcMain.on("set-reminder", async (event, { reminder, reminderTime }) => {
    const newReminder = {
      id: Date.now().toString(),
      text: reminder,
      time: reminderTime,
      timeout: null,
    };
    newReminder.timeout = scheduleReminder(newReminder);
    if (newReminder.timeout) {
      reminders.push(newReminder);
      await saveReminders();
    }
  });

  ipcMain.on(
    "update-reminder",
    async (event, { id, reminder, reminderTime }) => {
      const reminderIndex = reminders.findIndex((r) => r.id === id);
      if (reminderIndex !== -1) {
        const existingReminder = reminders[reminderIndex];
        if (existingReminder.timeout) clearTimeout(existingReminder.timeout);

        const updatedReminder = {
          ...existingReminder,
          text: reminder,
          time: reminderTime,
        };

        updatedReminder.timeout = scheduleReminder(updatedReminder);
        if (updatedReminder.timeout) {
          reminders[reminderIndex] = updatedReminder;
        } else {
          // If scheduling failed (time is in the past), remove it
          reminders.splice(reminderIndex, 1);
        }

        await saveReminders();
      }
    }
  );

  ipcMain.on("remove-reminder", async (event, id) => {
    const reminderIndex = reminders.findIndex((r) => r.id === id);
    if (reminderIndex !== -1) {
      clearTimeout(reminders[reminderIndex].timeout);
      reminders.splice(reminderIndex, 1);
      await saveReminders();
    }
  });

  ipcMain.handle("get-reminders", () => {
    return reminders.map(({ id, text, time }) => ({ id, text, time }));
  });

  ipcMain.handle("get-app-version", () => {
    return app.getVersion();
  });

  ipcMain.handle("check-for-updates", async () => {
    return await checkForUpdates();
  });

  ipcMain.on("open-github-releases", () => {
    shell.openExternal(
      "https://github.com/SoftBluey/Cortana-Electron/releases"
    );
  });

  ipcMain.on("set-settings-visibility", (event, visible) => {
    isSettingsVisible = visible;
  });

    ipcMain.handle('get-ai-response', async (event, { query, apiKey, providerAddress }) => {
        if (!apiKey || !providerAddress) {
            return { error: 'API key or provider address is not set.' };
        }

        const postData = JSON.stringify({
            model: 'gpt-3.5-turbo', // Or any other model you want to use
            messages: [{ role: 'user', content: query }],
        });

        const options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
        };

        try {
            const url = new URL(providerAddress);
            options.hostname = url.hostname;
            options.port = url.port;
            options.path = url.pathname;
        } catch (error) {
            return { error: 'Invalid provider address.' };
        }


        return new Promise((resolve) => {
            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', () => {
                    try {
                        const response = JSON.parse(data);
                        if (response.choices && response.choices.length > 0) {
                            resolve({ reply: response.choices[0].message.content });
                        } else {
                            resolve({ error: 'Failed to get a response from the AI provider.' });
                        }
                    } catch (error) {
                        resolve({ error: 'Failed to parse the response from the AI provider.' });
                    }
                });
            });

            req.on('error', (error) => {
                resolve({ error: `Request to AI provider failed: ${error.message}` });
            });

            req.write(postData);
            req.end();
        });
    });

  ipcMain.handle("get-time-for-location", async (event, cityInput) => {
    return new Promise((resolve, reject) => {
      try {
        const matches = cityTimezones.lookupViaCity(cityInput.trim());
        if (!matches || matches.length === 0) {
          return reject(
            new Error(`Could not find timezone for city: ${cityInput}`)
          );
        }

        const timezone = matches[0].timezone;
        const url = `https://timeapi.io/api/Time/current/zone?timeZone=${encodeURIComponent(
          timezone
        )}`;

        https
          .get(url, (res) => {
            if (res.statusCode !== 200) {
              res.resume();
              return reject(
                new Error(`Time API returned status ${res.statusCode}`)
              );
            }

            let data = "";
            res.on("data", (chunk) => {
              data += chunk;
            });
            res.on("end", () => {
              try {
                const jsonData = JSON.parse(data);
                if (!jsonData.dateTime) {
                  return reject(new Error("Missing dateTime in API response"));
                }
                const dateTime = new Date(jsonData.dateTime);
                const formattedTime = dateTime.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                });

                resolve({
                  city: matches[0].city,
                  country: matches[0].country,
                  timeZone: timezone,
                  time: formattedTime,
                });
              } catch (parseError) {
                console.error(
                  `Time lookup failed for "${cityInput}" (parsing):`,
                  parseError
                );
                reject(new Error(`Failed to parse time data for ${cityInput}`));
              }
            });
          })
          .on("error", (err) => {
            console.error(
              `Time lookup failed for "${cityInput}" (network):`,
              err
            );
            reject(new Error(`Failed to get time for ${cityInput}`));
          });
      } catch (error) {
        console.error(`Time lookup failed for "${cityInput}" (setup):`, error);
        reject(new Error(`Failed to get time for ${cityInput}`));
      }
    });
  });

  mainWindow.loadFile("index.html");
  mainWindow.on("ready-to-show", () => {
    if (!isSilentStart) {
      showWindow();
    }
  });
}
