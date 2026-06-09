import readline from "readline";

// ==========================================
// 日志工具
// ==========================================
function log(msg) {
  console.log(`[主控] ${msg}`);
}

function errorLog(msg) {
  console.error(`\n❌ [错误] ${msg}\n`);
}

// ==========================================
// 终端交互
// ==========================================
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

// ==========================================
// 菜单
// ==========================================
function showMenu() {
  console.log(`
=================================
   🎓  万能网课助手  v1.0.0
=================================
  1. 智慧树 — 自动视频 + 跳过弹窗
  2. WeLearn / U校园 — AI 全自动做题
  0. 退出
=================================`);
}

// ==========================================
// 模块启动包装（统一异常处理）
// ==========================================
async function runModule(name, startFn) {
  log(`正在启动「${name}」模块...`);
  try {
    await startFn();
  } catch (err) {
    errorLog(`${name} 模块运行异常: ${err.message}`);
    console.error(err);
    log(`「${name}」模块已安全退出，返回主菜单...\n`);
  }
}

// ==========================================
// 主入口
// ==========================================
async function main() {
  console.clear();
  console.log("🚀 网课助手初始化成功\n");

  while (true) {
    showMenu();
    const choice = await ask("请输入数字选择功能: ");

    switch (choice.trim()) {
      case "1": {
        // 动态导入，避免未安装 playwright 时启动就报错
        try {
          const { startZhihuishu } = await import("./src/zhihuishu.js");
          await runModule("智慧树", startZhihuishu);
        } catch (err) {
          errorLog(`智慧树模块加载失败: ${err.message}`);
          if (err.message.includes("Cannot find module")) {
            log("请确认已执行 npm install");
          }
        }
        break;
      }

      case "2": {
        try {
          const { start } = await import("./src/english_platforms.js");
          await runModule("WeLearn / U校园", start);
        } catch (err) {
          errorLog(`英语平台模块加载失败: ${err.message}`);
          if (err.message.includes("Cannot find module")) {
            log("请确认已执行 npm install");
          }
        }
        break;
      }

      case "0": {
        log("再见！👋");
        rl.close();
        process.exit(0);
      }

      default: {
        log("无效输入，请输入 1、2 或 0");
        break;
      }
    }
  }
}

// ==========================================
// 全局未捕获异常兜底
// ==========================================
process.on("uncaughtException", (err) => {
  errorLog(`未捕获异常: ${err.message}`);
  console.error(err);
  log("程序将继续运行，如异常请重启...");
});

process.on("unhandledRejection", (reason) => {
  errorLog(`未处理的 Promise 拒绝: ${reason}`);
  console.error(reason);
});

// ==========================================
// 启动
// ==========================================
main();
