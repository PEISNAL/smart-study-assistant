import { app, BrowserWindow, ipcMain } from "electron";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const envPath = path.join(rootDir, ".env");

let mainWindow = null;
let runningModule = null;
let stopRequested = false;

// ==========================================
// 创建窗口
// ==========================================
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 860,
    height: 700,
    minWidth: 680,
    minHeight: 520,
    title: "🎓 万能网课助手",
    backgroundColor: "#0b0f15",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "renderer.html"));
  mainWindow.setMenuBarVisibility(false);
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());

// ==========================================
// IPC：配置读写
// ==========================================
ipcMain.handle("config:get", () => {
  const examplePath = path.join(rootDir, ".env.example");
  const target = fs.existsSync(envPath) ? envPath : examplePath;
  const content = fs.readFileSync(target, "utf-8");
  const config = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      config[trimmed.substring(0, eqIdx).trim()] = trimmed.substring(eqIdx + 1).trim();
    }
  }
  return config;
});

ipcMain.handle("config:save", (_, config) => {
  let content = "";
  for (const [key, value] of Object.entries(config)) {
    content += `${key}=${value}\n`;
  }
  fs.writeFileSync(envPath, content, "utf-8");
  for (const [key, value] of Object.entries(config)) {
    process.env[key] = value;
  }
  return { ok: true };
});

// ==========================================
// IPC：日志 & 状态
// ==========================================
function sendToRenderer(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

// 劫持 console 输出到渲染进程
const origLog = console.log;
const origError = console.error;
console.log = (...args) => {
  origLog(...args);
  sendToRenderer("log", { type: "log", message: args.map(String).join(" "), time: new Date().toLocaleTimeString() });
};
console.error = (...args) => {
  origError(...args);
  sendToRenderer("log", { type: "error", message: args.map(String).join(" "), time: new Date().toLocaleTimeString() });
};

// 用户交互桥接
global.uiAsk = (question) => {
  return new Promise((resolve) => {
    const id = Date.now();
    sendToRenderer("prompt", { id, question });
    // 监听渲染进程回答
    const handler = (_, data) => {
      if (data.id === id) {
        ipcMain.removeListener("prompt:respond", handler);
        resolve(data.answer);
      }
    };
    ipcMain.on("prompt:respond", handler);
  });
};

global.uiStatus = (status) => {
  sendToRenderer("status", status);
};

// ==========================================
// IPC：模块控制
// ==========================================
ipcMain.handle("module:start", async (_, moduleName) => {
  if (runningModule) {
    return { ok: false, error: "已有模块在运行中" };
  }

  stopRequested = false;
  runningModule = moduleName;

  try {
    sendToRenderer("log", { type: "system", message: "━━━━━━━━━━━━━━━━━━━━━━━━", time: new Date().toLocaleTimeString() });
    sendToRenderer("log", { type: "system", message: `🚀 启动模块: ${moduleName}`, time: new Date().toLocaleTimeString() });
    sendToRenderer("status", "running");

    if (moduleName === "zhihuishu") {
      const { startZhihuishu } = await import("../src/zhihuishu.js");
      await startZhihuishu();
    } else if (moduleName === "welearn" || moduleName === "ucampus") {
      const { start } = await import("../src/english_platforms.js");
      await start(moduleName);
    }

    if (stopRequested) {
      sendToRenderer("log", { type: "system", message: "⏹ 模块已被用户停止", time: new Date().toLocaleTimeString() });
    } else {
      sendToRenderer("log", { type: "system", message: "✅ 模块运行完成", time: new Date().toLocaleTimeString() });
    }
  } catch (err) {
    sendToRenderer("log", { type: "error", message: `模块异常: ${err.message}`, time: new Date().toLocaleTimeString() });
  } finally {
    runningModule = null;
    stopRequested = false;
    sendToRenderer("status", "idle");
  }

  return { ok: true };
});

ipcMain.handle("module:stop", () => {
  if (runningModule) {
    stopRequested = true;
    sendToRenderer("log", { type: "system", message: "⏹ 用户请求停止，请等待当前操作完成...", time: new Date().toLocaleTimeString() });
    return { ok: true };
  }
  return { ok: false, error: "没有运行中的模块" };
});

ipcMain.handle("module:status", () => {
  return { running: !!runningModule, module: runningModule || null };
});
