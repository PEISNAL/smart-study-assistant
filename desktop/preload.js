import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("app", {
  // 配置
  config: {
    get: () => ipcRenderer.invoke("config:get"),
    save: (cfg) => ipcRenderer.invoke("config:save", cfg),
  },

  // 模块
  module: {
    start: (name) => ipcRenderer.invoke("module:start", name),
    stop: () => ipcRenderer.invoke("module:stop"),
    status: () => ipcRenderer.invoke("module:status"),
  },

  // 日志监听
  onLog: (callback) => {
    ipcRenderer.on("log", (_, data) => callback(data));
  },

  // 状态监听
  onStatus: (callback) => {
    ipcRenderer.on("status", (_, status) => callback(status));
  },

  // 用户输入提示
  onPrompt: (callback) => {
    ipcRenderer.on("prompt", (_, data) => callback(data));
  },
  respondPrompt: (id, answer) => {
    ipcRenderer.emit("prompt:respond", null, { id, answer });
  },
});
