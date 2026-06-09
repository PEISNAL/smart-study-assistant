import dotenv from "dotenv";
import { chromium } from "playwright";
import readline from "readline";
import { askAI } from "./ai_solver.js";

dotenv.config();

// ==========================================
// 终端交互工具（支持 Web UI 回退）
// ==========================================
const isWebMode = typeof global.uiAsk === "function";

const rl = isWebMode
  ? null
  : readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question) {
  if (isWebMode) {
    return global.uiAsk(question);
  }
  return new Promise((resolve) => rl.question(question, resolve));
}

function closeIO() {
  if (!isWebMode && rl) rl.close();
}

// ==========================================
// 日志工具
// ==========================================
function log(msg) {
  console.log(`[智慧树] ${new Date().toLocaleTimeString()}  ${msg}`);
}

// ==========================================
// 配置
// ==========================================
const CHECK_INTERVAL_MS = 5000; // 每 5 秒检查一次

const SELECTORS = {
  // 登录页
  loginPage: "https://passport.zhihuishu.com/login",
  usernameInput: [
    'input[name="username"]',
    "#lUsername",
    'input[placeholder*="手机"]',
    'input[placeholder*="账号"]',
    'input[type="text"]',
  ],
  passwordInput: [
    'input[name="password"]',
    "#lPassword",
    'input[placeholder*="密码"]',
    'input[type="password"]',
  ],
  loginButton: [
    ".wall-sub-btn",
    'button:has-text("登录")',
    'input[value="登录"]',
    ".login-btn",
    '[class*="login"] button',
  ],

  // 视频播放页
  playButton: [
    ".vjs-big-play-button",
    ".video-play-btn",
    '[class*="play"]',
    'button:has-text("播放")',
    ".playBtn",
  ],
  videoPlayer: ["video", ".vjs-tech", "#videoPlayer", '[class*="player"] video'],

  // 测验弹窗
  quizPopup: [
    ".topicDialog",
    ".popbox",
    '[class*="pop"]',
    ".dialog-modal",
    '[class*="dialog"]:visible',
    ".modal:visible",
    ".el-dialog__wrapper",
  ],
  quizCloseBtn: [
    ".topicDialog .close",
    ".popbox_close",
    '[class*="close"]',
    'button:has-text("关闭")',
    'a:has-text("关闭")',
    ".el-icon-close",
    '.btn:has-text("关")',
  ],
  quizSubmitBtn: [
    'button:has-text("提交")',
    'button:has-text("确定")',
    'a:has-text("提交")',
    ".submit-btn",
    ".confirm-btn",
  ],

  // 视频进度
  progressBar: [".vjs-play-progress", ".progress-bar__played", '[class*="progress"]'],
  currentTime: [".vjs-current-time", ".current-time", ".playTime"],
  duration: [".vjs-duration", ".duration", ".totalTime"],

  // 课程目录 - 右侧视频列表
  courseList: [
    ".chapter-list .video-item",
    ".catalog-list li",
    '[class*="catalog"] li',
    ".video-list .list-item",
    '[class*="lesson"]',
  ],
  activeVideo: [
    ".video-item.active",
    ".video-item.playing",
    "li.active",
    '[class*="active"]',
    ".current",
  ],
  nextVideoButton: [
    ".next-btn",
    'button:has-text("下一节")',
    'a:has-text("下一节")',
    ".nextChapter",
  ],
};

// ==========================================
// 工具函数：从候选选择器中找到第一个存在的
// ==========================================
async function findSelector(page, selectorList) {
  for (const sel of selectorList) {
    try {
      const el = await page.$(sel);
      if (el) return sel;
    } catch (_) {
      // 选择器无效，继续试下一个
    }
  }
  return null;
}

// ==========================================
// 工具函数：等待候选选择器中任意一个出现
// ==========================================
async function waitForAny(page, selectorList, timeout = 15000) {
  const promises = selectorList.map((sel) =>
    page
      .waitForSelector(sel, { timeout, state: "attached" })
      .then(() => sel)
      .catch(() => null)
  );
  const results = await Promise.race([
    Promise.all(promises).then((arr) => arr.find((r) => r !== null)),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("所有选择器均未匹配")), timeout)
    ),
  ]);
  return results;
}

// ==========================================
// 1. 登录模块
// ==========================================
async function login(browser) {
  const context = browser.contexts()[0] || (await browser.newContext());
  const page = await context.newPage();

  log("正在打开智慧树登录页...");
  await page.goto(SELECTORS.loginPage, { waitUntil: "domcontentloaded", timeout: 30000 });
  log("登录页加载完成");

  // 查找用户名输入框
  const userSel = await findSelector(page, SELECTORS.usernameInput);
  if (!userSel) {
    log("❌ 未找到用户名输入框，页面结构可能已变更");
    await page.screenshot({ path: "debug-login.png" });
    log("已保存截图 debug-login.png，请检查");
    return null;
  }

  const username = process.env.COURSE_USERNAME;
  const password = process.env.COURSE_PASSWORD;

  if (!username || !password) {
    log("❌ 请在 .env 文件中配置 COURSE_USERNAME 和 COURSE_PASSWORD");
    return null;
  }

  log(`正在填入账号: ${username}`);
  await page.fill(userSel, username);
  await page.waitForTimeout(500);

  const passSel = await findSelector(page, SELECTORS.passwordInput);
  if (!passSel) {
    log("❌ 未找到密码输入框");
    return null;
  }
  log("正在填入密码...");
  await page.fill(passSel, password);
  await page.waitForTimeout(500);

  // 点击登录
  const loginBtnSel = await findSelector(page, SELECTORS.loginButton);
  if (!loginBtnSel) {
    log("❌ 未找到登录按钮");
    return null;
  }
  log("正在点击登录...");
  await page.click(loginBtnSel);

  // 等待并检测验证码
  await page.waitForTimeout(2000);
  const hasCaptcha = await page.evaluate(() => {
    const imgs = document.querySelectorAll("img");
    for (const img of imgs) {
      if (img.src.includes("captcha") || img.src.includes("verify") || img.alt.includes("验证码")) {
        return true;
      }
    }
    const text = document.body.innerText;
    return text.includes("验证码") || text.includes("滑块") || text.includes("拖动");
  });

  if (hasCaptcha) {
    log("⚠️  检测到验证码！请在浏览器中手动完成验证...");
    log("   （请不要关闭浏览器窗口）");
    await ask("   完成验证后按 Enter 继续...");
  }

  // 等待登录成功跳转
  try {
    await page.waitForURL((url) => !url.includes("login"), { timeout: 60000 });
    log("✅ 登录成功！");
    return page;
  } catch {
    // 可能是验证码未通过
    log("⚠️  登录可能未完成，请检查浏览器状态...");
    await ask("   如果已登录成功请按 Enter 继续，否则按 Ctrl+C 退出重试...");
    return page;
  }
}

// ==========================================
// 2. 跳转到课程播放页
// ==========================================
async function navigateToCourse(page) {
  let courseUrl = process.env.COURSE_URL;

  if (!courseUrl) {
    log("请输入课程播放页的完整 URL:");
    courseUrl = await ask("> ");
  }

  if (!courseUrl || !courseUrl.trim()) {
    log("❌ 未提供课程 URL");
    return false;
  }

  log(`正在跳转到课程页面: ${courseUrl}`);
  try {
    await page.goto(courseUrl.trim(), { waitUntil: "domcontentloaded", timeout: 30000 });
    log("✅ 课程页面加载完成");
    return true;
  } catch (e) {
    log(`❌ 页面加载失败: ${e.message}`);
    return false;
  }
}

// ==========================================
// 3. 播放视频
// ==========================================
async function playVideo(page) {
  log("正在查找播放按钮...");
  try {
    // 先尝试直接点击视频区域
    const videoSel = await findSelector(page, SELECTORS.videoPlayer);
    if (videoSel) {
      await page.click(videoSel);
      await page.waitForTimeout(1000);
    }

    // 再尝试点击播放按钮
    const playSel = await findSelector(page, SELECTORS.playButton);
    if (playSel) {
      await page.click(playSel);
      log("✅ 视频开始播放");
      return true;
    }

    // 都没找到，尝试点视频区域中央
    log("未找到明显播放按钮，尝试点击视频区域...");
    await page.click("video", { timeout: 3000 }).catch(() => {});
    return true;
  } catch (e) {
    log(`⚠️  播放点击异常: ${e.message}`);
    return false;
  }
}

// ==========================================
// 4. 从弹窗中提取题目信息
// ==========================================
async function extractQuizFromPopup(page, popupSel) {
  return await page.evaluate((popupSel) => {
    const popup = document.querySelector(popupSel);
    if (!popup) return null;

    // 提取题目文本：常见类名
    const questionEl =
      popup.querySelector(".topic-content") ||
      popup.querySelector(".topic-desc") ||
      popup.querySelector(".question-text") ||
      popup.querySelector(".title") ||
      popup.querySelector('[class*="question"]') ||
      popup.querySelector('[class*="topic"]') ||
      popup.querySelector("p");

    const question = questionEl ? questionEl.textContent.trim() : popup.textContent.trim().substring(0, 300);

    // 提取选项
    const optionEls =
      popup.querySelectorAll(".topic-option") ||
      popup.querySelectorAll(".option-item") ||
      popup.querySelectorAll('[class*="option"]') ||
      popup.querySelectorAll("label") ||
      [];

    const options = [];
    const optionMap = {}; // letter -> element index

    optionEls.forEach((el, idx) => {
      const text = el.textContent.trim().replace(/^\s*[A-H][\.\、\s]+/, ""); // 去掉前导字母
      if (text && text.length > 0 && text.length < 500) {
        options.push(text);
      }
    });

    // 如果没找到明确选项，尝试从整个弹窗文本解析
    if (options.length === 0) {
      const allText = popup.textContent;
      const lines = allText.split("\n").filter((l) => /^[A-H][\.\、\s]/.test(l.trim()));
      lines.forEach((l) => {
        options.push(l.trim().replace(/^[A-H][\.\、\s]+/, ""));
      });
    }

    // 判断题型：有 checkbox 则为多选，否则单选
    const checkboxes = popup.querySelectorAll('input[type="checkbox"]');
    const radios = popup.querySelectorAll('input[type="radio"]');
    let type = "single";
    if (checkboxes.length > 0) type = "multiple";
    else if (radios.length === 0 && options.length === 0) type = "fill";

    return { question: question.substring(0, 500), options, type };
  }, popupSel);
}

// ==========================================
// 4b. 点击弹窗中的对应选项
// ==========================================
async function clickAnswerInPopup(page, popupSel, answer) {
  // answer 可能是 "A" / ["A", "C"] / "填空题文本"
  const letters = Array.isArray(answer) ? answer : [answer];

  return await page.evaluate(({ popupSel, letters }) => {
    const popup = document.querySelector(popupSel);
    if (!popup) return false;

    const optionEls = Array.from(
      popup.querySelectorAll(
        ".topic-option, .option-item, [class*='option'], label, li"
      )
    );

    // 过滤掉纯文本 label（没有交互元素的那种）
    const clickable = optionEls.filter((el) => {
      return (
        el.querySelector("input") ||
        el.querySelector('input[type="radio"]') ||
        el.querySelector('input[type="checkbox"]') ||
        el.onclick ||
        el.style.cursor === "pointer" ||
        getComputedStyle(el).cursor === "pointer" ||
        el.tagName === "LABEL"
      );
    });

    // 最终候选：有可交互的优先，否则回退到全部
    const candidates = clickable.length > 0 ? clickable : optionEls;

    for (const letter of letters) {
      const idx = letter.charCodeAt(0) - 65; // A=0, B=1, ...
      if (idx >= 0 && idx < candidates.length) {
        const el = candidates[idx];
        // 先尝试点内部的 input
        const input = el.querySelector("input");
        if (input) {
          input.checked = true;
          input.dispatchEvent(new Event("change", { bubbles: true }));
          input.dispatchEvent(new Event("click", { bubbles: true }));
        }
        el.click();
      }
    }
    return true;
  }, { popupSel, letters });
}

// ==========================================
// 4c. AI 智能处理测验弹窗（替代原来的 dismissQuizPopup）
// ==========================================
async function handleQuizPopup(page) {
  try {
    const popupSel = await findSelector(page, SELECTORS.quizPopup);
    if (!popupSel) return false;

    const popup = await page.$(popupSel);
    if (!popup) return false;

    const isVisible = await popup.isVisible().catch(() => false);
    if (!isVisible) return false;

    log("🔔 检测到测验弹窗！");

    // Step 1: 提取题目
    const quiz = await extractQuizFromPopup(page, popupSel);
    if (!quiz || !quiz.question) {
      log("  ⚠️  无法提取题目内容，尝试直接关闭...");
      return await simpleClose(page, popupSel);
    }

    log(`  📝 题目: ${quiz.question.substring(0, 60)}...`);
    if (quiz.options.length > 0) {
      log(`  📋 选项 (${quiz.type}): ${quiz.options.map((o, i) => String.fromCharCode(65 + i) + "." + o.substring(0, 20)).join("  ")}`);
    }

    // Step 2: 调用 AI
    log("  🤖 正在调用 AI 答题...");
    const result = await askAI(quiz.question, quiz.options, quiz.type);

    if (!result || !result.answer) {
      log("  ⚠️  AI 返回为空，使用兜底策略...");
      return await fallbackClose(page, popupSel);
    }

    log(`  ✅ AI 答案: ${JSON.stringify(result.answer)}`);

    // Step 3: 点击对应选项
    if (quiz.type === "fill") {
      // 填空：尝试填入文本
      log(`  📝 填入答案: ${result.answer}`);
      await page.evaluate(({ popupSel, text }) => {
        const popup = document.querySelector(popupSel);
        if (!popup) return;
        const input = popup.querySelector("input[type='text'], textarea, input:not([type])");
        if (input) {
          input.value = text;
          input.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }, { popupSel, text: String(result.answer) });
    } else {
      // 选择/多选：点击选项
      await clickAnswerInPopup(page, popupSel, result.answer);
      log("  🖱️  已点击对应选项");
    }

    // Step 4: 点击提交按钮
    await page.waitForTimeout(500);
    const submitSel = await findSelector(page, SELECTORS.quizSubmitBtn);
    if (submitSel) {
      await page.click(submitSel).catch(() => {});
      log("  📤 已提交答案");
      await page.waitForTimeout(2000);
      return true;
    }

    // 没有提交按钮就尝试关闭
    return await simpleClose(page, popupSel);

  } catch (e) {
    log(`  ⚠️  AI弹窗处理异常: ${e.message}`);
    return false;
  }
}

// ==========================================
// 4d. 简单关闭弹窗（无需答题的弹窗）
// ==========================================
async function simpleClose(page, popupSel) {
  const closeSel = await findSelector(page, SELECTORS.quizCloseBtn);
  if (closeSel) {
    await page.click(closeSel).catch(() => {});
    log("  已关闭弹窗");
    await page.waitForTimeout(1500);
    return true;
  }
  await page.mouse.click(10, 10);
  await page.waitForTimeout(1000);
  return true;
}

// ==========================================
// 4e. 兜底策略：AI 失败时随机选一个
// ==========================================
async function fallbackClose(page, popupSel) {
  log("  🎲 使用兜底策略：随机选择...");
  const options = await page.$$(
    popupSel + ' input[type="radio"], ' + popupSel + ' .option-item, ' + popupSel + ' label'
  );
  if (options.length > 0) {
    await options[0].click().catch(() => {});
    log("  已随机选择一个选项");
  }
  const submitSel = await findSelector(page, SELECTORS.quizSubmitBtn);
  if (submitSel) {
    await page.click(submitSel).catch(() => {});
    log("  已提交");
  } else {
    await simpleClose(page, popupSel);
  }
  await page.waitForTimeout(2000);
  return true;
}

// ==========================================
// 5. 检测视频是否播放完毕
// ==========================================
async function isVideoFinished(page) {
  try {
    // 方法1: 通过 JS 检查 video 元素的进度
    const finished = await page.evaluate(() => {
      const video = document.querySelector("video");
      if (!video || !video.duration) return false;
      // 视频进度 >= 99% 视为播放完成
      return video.currentTime / video.duration >= 0.99;
    });

    if (finished) return true;

    // 方法2: 检查页面上的进度文字
    const progressText = await page
      .evaluate(() => {
        // 常见的进度显示格式: "00:00 / 00:00" "当前/总时长"
        const elements = document.querySelectorAll(
          ".vjs-current-time, .current-time, .playTime, [class*='time']"
        );
        for (const el of elements) {
          const text = el.textContent.trim();
          if (/\d+:\d+/.test(text)) {
            return text;
          }
        }
        return null;
      })
      .catch(() => null);

    if (progressText) {
      const parts = progressText.split("/").map((s) => s.trim());
      if (parts.length === 2 && parts[0] === parts[1]) {
        return true;
      }
    }

    // 方法3: 检查进度条宽度
    const progressPct = await page
      .evaluate(() => {
        const bar = document.querySelector(
          ".vjs-play-progress, .progress-bar__played, [style*='width']"
        );
        if (bar) {
          const style = bar.getAttribute("style") || "";
          const match = style.match(/width:\s*(\d+(\.\d+)?)%/);
          if (match) return parseFloat(match[1]);
        }
        return 0;
      })
      .catch(() => 0);

    if (progressPct >= 99) return true;

    return false;
  } catch (e) {
    log(`  ⚠️  进度检测异常: ${e.message}`);
    return false;
  }
}

// ==========================================
// 6. 跳转到下一个视频
// ==========================================
async function goToNextVideo(page) {
  log("📌 当前视频已播完，正在查找下一个视频...");

  try {
    // 策略1: 点击"下一节"按钮
    const nextBtnSel = await findSelector(page, SELECTORS.nextVideoButton);
    if (nextBtnSel) {
      log("  找到「下一节」按钮，点击跳转...");
      await page.click(nextBtnSel);
      await page.waitForTimeout(3000);
      log("✅ 已跳转到下一节");
      return true;
    }

    // 策略2: 在课程列表中找当前活动视频的下一个
    const courseItems = await page.$$(SELECTORS.courseList.join(", "));
    if (courseItems.length > 0) {
      log(`  找到 ${courseItems.length} 个课程视频`);

      let foundCurrent = false;
      for (let i = 0; i < courseItems.length; i++) {
        const item = courseItems[i];
        const className = (await item.getAttribute("class")) || "";
        const isActive =
          className.includes("active") ||
          className.includes("playing") ||
          className.includes("current");

        if (isActive && !foundCurrent) {
          foundCurrent = true;
          log(`  当前位置: 第 ${i + 1} 个视频`);
          // 下一个
          if (i + 1 < courseItems.length) {
            log(`  正在点击第 ${i + 2} 个视频...`);
            await courseItems[i + 1].click();
            await page.waitForTimeout(3000);
            log("✅ 已切换到下一个视频");
            return true;
          } else {
            log("✅ 这是最后一个视频，课程全部完成！");
            return false;
          }
        }
      }

      // 没找到 active 状态的，直接点击第一个
      if (!foundCurrent) {
        log("  未找到当前播放的视频，点击第一个...");
        await courseItems[0].click();
        await page.waitForTimeout(3000);
        return true;
      }
    }

    log("⚠️  未找到下一个视频的入口");
    return false;
  } catch (e) {
    log(`❌ 切换视频失败: ${e.message}`);
    return false;
  }
}

// ==========================================
// 7. 主循环：挂机监控
// ==========================================
async function mainLoop(page) {
  log("🎬 开始挂机监控...");

  let checkCount = 0;
  let consecutiveErrors = 0;
  const MAX_CONSECUTIVE_ERRORS = 10;

  // 使用 setInterval 的 Promise 封装以支持 async/await
  return new Promise((resolve) => {
    const interval = setInterval(async () => {
      try {
        checkCount++;
        log(`🔄 第 ${checkCount} 次检查...`);

        // 检查页面是否还在
        try {
          await page.title();
        } catch {
          log("❌ 页面已关闭或崩溃");
          clearInterval(interval);
          resolve();
          return;
        }

        // a) 确保视频正在播放
        const isPaused = await page
          .evaluate(() => {
            const v = document.querySelector("video");
            return v ? v.paused : null;
          })
          .catch(() => null);

        if (isPaused === true) {
          log("⏯  视频暂停中，尝试恢复播放...");
          await playVideo(page);
        }

        // b) AI 智能处理测验弹窗
        await handleQuizPopup(page);

        // c) 检测是否播放完毕
        const finished = await isVideoFinished(page);
        if (finished) {
          log("🏁 检测到视频播放完毕");
          const hasNext = await goToNextVideo(page);
          if (!hasNext) {
            log("🎉 所有视频已完成！");
            clearInterval(interval);
            resolve();
            return;
          }
          // 跳转后等待新页面加载，重新播放
          await page.waitForTimeout(3000);
          await playVideo(page);
        }

        consecutiveErrors = 0;
      } catch (e) {
        consecutiveErrors++;
        log(`⚠️  检查出错 (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}): ${e.message}`);

        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          log("❌ 连续错误过多，停止监控");
          clearInterval(interval);
          resolve();
        }
      }
    }, CHECK_INTERVAL_MS);
  });
}

// ==========================================
// 8. 主入口
// ==========================================
export async function startZhihuishu() {
  log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  log("  智慧树网课自动助手 启动");
  log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  // 检查环境变量
  const username = process.env.COURSE_USERNAME;
  const password = process.env.COURSE_PASSWORD;
  if (!username || !password) {
    log("⚠️  .env 中未配置智慧树账号密码");
    log("  请在 .env 中设置 COURSE_USERNAME 和 COURSE_PASSWORD");
    log("  或输入课程URL直接进入挂机模式（需已登录）");
  }

  log("正在启动浏览器（使用系统已安装的 Chrome）...");

  let browser;
  try {
    // 尝试使用系统 Chrome
    browser = await chromium.launch({
      headless: false, // 必须有界面，方便手动处理验证码
      channel: "chrome",
      args: [
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
        "--disable-setuid-sandbox",
      ],
    });
  } catch {
    // 回退到 Playwright 自带的 Chromium
    log("未找到系统 Chrome，使用自带 Chromium...");
    browser = await chromium.launch({
      headless: false,
      args: [
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
      ],
    });
  }

  log("✅ 浏览器已启动");

  try {
    // Step 1: 登录
    const page = await login(browser);
    if (!page) {
      log("❌ 登录失败，退出");
      await browser.close();
      closeIO();
      return;
    }

    // Step 2: 跳转课程页
    const ok = await navigateToCourse(page);
    if (!ok) {
      log("❌ 课程页面加载失败，退出");
      await browser.close();
      closeIO();
      return;
    }

    // Step 3: 自动播放
    await page.waitForTimeout(3000);
    await playVideo(page);

    // Step 4: 进入主监控循环
    await mainLoop(page);

    log("程序运行结束");
    await ask("按 Enter 关闭浏览器...");
  } catch (e) {
    log(`❌ 运行出错: ${e.message}`);
    console.error(e);
  } finally {
    await browser.close().catch(() => {});
    closeIO();
    log("浏览器已关闭，再见！");
  }
}
