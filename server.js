import express from "express";
import { EventEmitter } from "events";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3456;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ==========================================
// SSE 日志广播
// ==========================================
const sseClients = new Set();

function broadcastLog(type, message) {
  const payload = JSON.stringify({ type, message, time: new Date().toLocaleTimeString() });
  for (const res of sseClients) {
    res.write(`data: ${payload}\n\n`);
  }
}

app.get("/api/logs", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  sseClients.add(res);
  broadcastLog("system", "✅ 日志流已连接");
  req.on("close", () => sseClients.delete(res));
});

// 劫持 console.log 使其同时输出到 SSE
const origLog = console.log;
const origError = console.error;
console.log = (...args) => {
  origLog(...args);
  broadcastLog("log", args.map(String).join(" "));
};
console.error = (...args) => {
  origError(...args);
  broadcastLog("error", args.map(String).join(" "));
};

// ==========================================
// 用户交互桥接（替代 readline）
// ==========================================
const bridge = new EventEmitter();
let pendingPrompt = null; // { resolve, id }

// UI 调用此接口发送用户回答
app.post("/api/respond", (req, res) => {
  const { id, answer } = req.body;
  if (pendingPrompt && pendingPrompt.id === id) {
    pendingPrompt.resolve(answer);
    pendingPrompt = null;
    res.json({ ok: true });
  } else {
    res.json({ ok: false, error: "没有等待中的提示" });
  }
});

// 供模块使用的 ask 函数 — 发送 prompt 到 UI 并等待
global.uiAsk = (question) => {
  return new Promise((resolve) => {
    const id = Date.now();
    pendingPrompt = { resolve, id };
    broadcastLog("prompt", question);
    // 同时发送结构化 prompt 事件
    for (const res of sseClients) {
      res.write(`event: prompt\ndata: ${JSON.stringify({ id, question })}\n\n`);
    }
  });
};

global.uiStatus = (status) => {
  broadcastLog("status", status);
};

// ==========================================
// 配置读写
// ==========================================
app.get("/api/config", (req, res) => {
  const envPath = path.join(__dirname, ".env");
  const examplePath = path.join(__dirname, ".env.example");
  let config = {};

  // 读取 .env 或 .env.example
  const target = fs.existsSync(envPath) ? envPath : examplePath;
  const content = fs.readFileSync(target, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      const key = trimmed.substring(0, eqIdx).trim();
      const value = trimmed.substring(eqIdx + 1).trim();
      config[key] = value;
    }
  }
  res.json(config);
});

app.post("/api/config", (req, res) => {
  const config = req.body;
  const envPath = path.join(__dirname, ".env");
  let content = "";
  for (const [key, value] of Object.entries(config)) {
    content += `${key}=${value}\n`;
  }
  fs.writeFileSync(envPath, content, "utf-8");
  // 重新加载环境变量
  for (const [key, value] of Object.entries(config)) {
    process.env[key] = value;
  }
  broadcastLog("system", "✅ 配置已保存");
  res.json({ ok: true });
});

// ==========================================
// 模块控制
// ==========================================
let runningModule = null;

app.post("/api/start", async (req, res) => {
  const { module: moduleName } = req.body;

  if (runningModule) {
    return res.json({ ok: false, error: "已有模块在运行中，请等待完成" });
  }

  runningModule = moduleName;
  res.json({ ok: true });

  try {
    broadcastLog("system", `━━━━━━━━━━━━━━━━━━━━━━━━`);
    broadcastLog("system", `🚀 启动模块: ${moduleName}`);

    if (moduleName === "zhihuishu") {
      const { startZhihuishu } = await import("./src/zhihuishu.js");
      await startZhihuishu();
    } else if (moduleName === "english") {
      const { start } = await import("./src/english_platforms.js");
      await start();
    }

    broadcastLog("system", "✅ 模块运行完成");
    global.uiStatus("idle");
  } catch (err) {
    broadcastLog("error", `模块异常: ${err.message}`);
    global.uiStatus("error");
  } finally {
    runningModule = null;
  }
});

app.get("/api/status", (req, res) => {
  res.json({ running: !!runningModule, module: runningModule || null });
});

// ==========================================
// 启动服务
// ==========================================
app.listen(PORT, () => {
  origLog(`\n  🎓 万能网课助手服务已启动\n`);
  origLog(`  👉 请在浏览器打开: http://localhost:${PORT}\n`);
  origLog(`  💡 关闭此窗口即可停止服务\n`);
});

// 自动打开浏览器
import("child_process").then(({ exec }) => {
  const cmd = process.platform === "win32" ? "start" : process.platform === "darwin" ? "open" : "xdg-open";
  exec(`${cmd} http://localhost:${PORT}`);
});
