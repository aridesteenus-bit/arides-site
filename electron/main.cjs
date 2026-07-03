const { app, BrowserWindow, Menu, shell } = require("electron");
const fs = require("fs");
const path = require("path");

const rootDir = path.join(__dirname, "..");
const defaultOperatorBase = "https://arides.ee";

function readOperatorConfig() {
  const configPath = path.join(app.getPath("userData"), "operator-config.json");
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, "utf8"));
    return {
      apiBase: String(parsed.apiBase || defaultOperatorBase).replace(/\/$/, ""),
      adminToken: String(parsed.adminToken || "")
    };
  } catch {
    return { apiBase: defaultOperatorBase, adminToken: "" };
  }
}

function operatorUrl() {
  const config = readOperatorConfig();
  const url = new URL("/operator-desktop.html", config.apiBase || defaultOperatorBase);
  url.searchParams.set("apiBase", config.apiBase || defaultOperatorBase);
  url.searchParams.set("tab", "orders");
  if (config.adminToken) url.searchParams.set("adminToken", config.adminToken);
  return url.toString();
}

function openExternal(url) {
  if (/^(https?:|mailto:|tel:)/i.test(url)) {
    shell.openExternal(url);
    return true;
  }
  return false;
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 720,
    title: "ARIDES Cargo Desktop",
    icon: path.join(rootDir, "build", "arides.png"),
    backgroundColor: "#eef3f8",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  const appUrl = operatorUrl();
  window.loadURL(appUrl);

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (openExternal(url)) return { action: "deny" };
    return { action: "allow" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith("https://arides.ee/")) return;
    if (openExternal(url)) event.preventDefault();
  });
}

function createMenu() {
  const template = [
    {
      label: "ARIDES Cargo",
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" }
      ]
    },
    {
      label: "Fail",
      submenu: [
        { label: "Tellimused", accelerator: "CmdOrCtrl+N", click: (_, focusedWindow) => focusedWindow?.webContents.executeJavaScript("document.querySelector('#newOrderBtn')?.click()") },
        { type: "separator" },
        { role: "close" }
      ]
    },
    {
      label: "Vaade",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" }
      ]
    },
    {
      label: "Aken",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        { role: "front" }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.setName("ARIDES Cargo Desktop");

app.whenReady().then(() => {
  createMenu();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
