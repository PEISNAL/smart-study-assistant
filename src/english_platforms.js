import dotenv from "dotenv";
import { chromium } from "playwright";
import readline from "readline";
import { askAI } from "./ai_solver.js";
import { fileURLToPath } from "url";
import path from "path";

dotenv.config();

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
// 日志
// ==========================================
function log(msg) {
  console.log(`[英语平台] ${new Date().toLocaleTimeString()}  ${msg}`);
}

// ==========================================
// 随机延迟（模拟真人操作，防封）
// ==========================================
function randomDelay(min = 1000, max = 3000) {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  log(`  ⏳ 随机等待 ${(ms / 1000).toFixed(1)}s...`);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ==========================================
// 配置
// ==========================================
const PLATFORM_SELECTORS = {
  // ===== WeLearn 随行课堂 =====
  welearn: {
    // 题目容器
    questionBlocks: [
      ".question-item",
      ".exercise-item",
      '[class*="question"]',
      ".topic-item",
      ".exam-item",
      ".test-question",
      '[class*="exercise"]',
      ".que-item",
      ".paper-question",
    ],
    // 单个题目中的题干文本
    questionStem: [
      ".question-stem",
      ".stem",
      ".que-stem",
      '[class*="stem"]',
      ".question-content",
      ".que-content",
      ".title",
      "p",
    ],
    // 选项容器
    optionContainer: [
      ".options",
      ".option-list",
      ".answer-list",
      '[class*="option"]',
      ".choices",
      "ul",
      "ol",
    ],
    // 单个选项元素
    optionItem: [
      ".option-item",
      "li",
      ".choice-item",
      ".answer-item",
      '[class*="option"] label',
      ".que-option",
      "label",
    ],
    // 选项字母（A/B/C/D）
    optionLabel: [".option-label", ".label", '[class*="label"]', "span:first-child", "i"],

    // 填空输入框
    fillInput: ["input[type='text']", "textarea", "input:not([type])", ".fill-input", ".blank-input"],

    // 题型判断辅助
    checkboxInOptions: 'input[type="checkbox"]',
    radioInOptions: 'input[type="radio"]',

    // 提交/下一页按钮
    submitBtn: [
      'button:has-text("提交")',
      'button:has-text("下一题")',
      'button:has-text("下一页")',
      'button:has-text("继续")',
      'button:has-text("交卷")',
      'a:has-text("下一题")',
      'a:has-text("下一页")',
      ".next-btn",
      ".submit-btn",
      ".next-button",
      '[class*="next"]',
      '[class*="submit"]',
    ],
  },

  // ===== U校园 AI 版 =====
  ucampus: {
    questionBlocks: [
      ".question-item",
      ".topic-container",
      '[class*="question"]',
      ".exercise-block",
      ".test-block",
      ".que-wrapper",
      ".paper-item",
    ],
    questionStem: [
      ".question-stem",
      ".stem-text",
      ".que-title",
      '[class*="stem"]',
      ".question-text",
      ".title",
      "p",
    ],
    optionContainer: [
      ".option-group",
      ".options-wrap",
      '[class*="option"]',
      ".answer-choices",
      ".choice-group",
      "ul",
      "ol",
    ],
    optionItem: [
      ".option-item",
      "li",
      ".choice-item",
      '[class*="option"] label',
      ".answer-option",
      "label",
    ],
    optionLabel: [".option-prefix", ".prefix", "span:first-child", ".index", "i"],

    fillInput: [
      "input[type='text']",
      "textarea",
      "input:not([type])",
      ".blank-input",
      '[class*="fill"] input',
    ],

    checkboxInOptions: 'input[type="checkbox"]',
    radioInOptions: 'input[type="radio"]',

    submitBtn: [
      'button:has-text("提交")',
      'button:has-text("下一题")',
      'button:has-text("下一部分")',
      'button:has-text("继续")',
      'button:has-text("交卷")',
      'a:has-text("下一题")',
      ".next-btn",
      ".submit-btn",
      '[class*="next"]',
      '[class*="submit"]',
    ],
  },
};

// ==========================================
// 工具：从候选选择器中找第一个存在的元素
// ==========================================
async function findOne(page, selectorList) {
  for (const sel of selectorList) {
    try {
      const el = await page.$(sel);
      if (el) return sel;
    } catch (_) {}
  }
  return null;
}

// ==========================================
// 开始：启动浏览器并等待用户手动进入做题页面
// ==========================================
export async function start(platform = "auto") {
  log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  log("  英语平台 AI 自动做题助手");
  log("  WeLearn 随行课堂 / U校园 AI 版");
  log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  if (platform === "auto") {
    log("请选择平台: 1=WeLearn随行课堂  2=U校园AI版");
    const choice = await ask("> ");
    platform = choice === "2" ? "ucampus" : "welearn";
  }
  log(`已选择: ${platform}`);

  const selectors = PLATFORM_SELECTORS[platform] || PLATFORM_SELECTORS.welearn;

  log("正在启动浏览器...");
  let browser;
  try {
    browser = await chromium.launch({
      headless: false,
      channel: "chrome",
      args: [
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
        "--disable-setuid-sandbox",
      ],
    });
  } catch {
    browser = await chromium.launch({
      headless: false,
      args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
    });
  }
  log("✅ 浏览器已启动");

  const context = browser.contexts()[0] || (await browser.newContext());
  const page = await context.newPage();

  // 引导用户手动登录
  log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  log("👉 请在浏览器中:");
  log("   1. 打开 WeLearn / U校园 网站");
  log("   2. 手动登录你的账号");
  log("   3. 进入到具体的做题页面（单元测试/练习题）");
  log("   4. 确认页面已完全加载，所有题目可见");
  log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  await ask("   完成后按 Enter，AI 将开始自动做题...");

  // ==========================================
  // 主循环：逐页解题
  // ==========================================
  let pageNum = 1;
  let totalSolved = 0;

  while (true) {
    log(`\n📄 ===== 第 ${pageNum} 页 =====`);

    // 等待页面稳定
    await page.waitForTimeout(2000);

    // 解析当前页所有题目
    const questions = await extractQuestions(page, selectors);
    if (questions.length === 0) {
      log("⚠️  未检测到题目，可能页面结构不同或已到末尾");
      await page.screenshot({ path: `debug-${platform}-page${pageNum}.png` });
      log(`已保存截图 debug-${platform}-page${pageNum}.png`);
      const cont = await ask("  是否继续尝试扫描? (y/n) > ");
      if (cont.toLowerCase() !== "y") break;
      pageNum++;
      continue;
    }

    log(`🔍 检测到 ${questions.length} 道题目`);

    // 逐题解答
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      log(`\n📝 [${i + 1}/${questions.length}] ${q.question.substring(0, 50)}...`);

      if (q.options.length > 0) {
        log(`  选项: ${q.options.map((o, j) => String.fromCharCode(65 + j) + "." + o.substring(0, 25)).join(" | ")}`);
      }

      // 调用 AI
      log("  🤖 调用 AI...");
      const result = await askAI(q.question, q.options, q.type);
      await randomDelay(800, 1500); // 随机间隔防封

      if (!result || result.answer === undefined || result.answer === null) {
        log("  ⚠️  AI 返回为空，跳过此题");
        continue;
      }

      log(`  ✅ AI 答案: ${JSON.stringify(result.answer)}`);

      // 应用答案
      const applied = await applyAnswer(page, q, result.answer);
      if (applied) {
        totalSolved++;
        log(`  ✔️  第 ${i + 1} 题已完成`);
      } else {
        log(`  ❌ 第 ${i + 1} 题应用失败，尝试强制点击...`);
        await forceApplyAnswer(page, q, result.answer);
      }

      // 题间随机延迟
      await randomDelay(1200, 3000);
    }

    log(`\n✅ 本页 ${questions.length} 题处理完毕`);

    // 查找并点击"下一页"/"提交"
    const hasNext = await goToNextPage(page, selectors);
    if (!hasNext) {
      log("没有找到「下一页」按钮，可能已是最后一页");
      const cont = await ask("  已完成所有题目? (y/n) > ");
      if (cont.toLowerCase() === "y") break;
    }

    await randomDelay(2000, 4000);
    pageNum++;
  }

  log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  log(`🎉 自动做题结束，共解答 ${totalSolved} 题`);
  log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  await ask("按 Enter 关闭浏览器...");

  await browser.close().catch(() => {});
  rl.close();
  log("浏览器已关闭，再见！");
}

// ==========================================
// 从当前页面提取所有题目
// ==========================================
async function extractQuestions(page, selectors) {
  const questions = [];

  try {
    // 先找到题目容器
    const blockSel = await findOne(page, selectors.questionBlocks);
    if (!blockSel) {
      log("  ⚠️  未找到题目容器选择器，尝试通用扫描...");
      return await extractQuestionsGeneric(page);
    }

    // 获取所有题目块
    const blocks = await page.$$(blockSel);
    log(`  找到 ${blocks.length} 个题目块 (选择器: ${blockSel})`);

    // 如果选择器匹配了太多非题目元素，过滤一下
    const validBlocks = [];
    for (const block of blocks) {
      const text = await block.textContent().catch(() => "");
      if (text && text.trim().length > 10) {
        validBlocks.push(block);
      }
    }
    log(`  有效题目块: ${validBlocks.length}`);

    for (let i = 0; i < validBlocks.length; i++) {
      const block = validBlocks[i];
      const q = await parseSingleQuestion(page, block, selectors);
      if (q && q.question) {
        questions.push(q);
      }
    }
  } catch (e) {
    log(`  ⚠️  题目提取出错: ${e.message}`);
  }

  return questions;
}

// ==========================================
// 通用扫描：不依赖特定选择器
// ==========================================
async function extractQuestionsGeneric(page) {
  return await page.evaluate(() => {
    const results = [];

    // 策略1: 查找所有包含多项选择特征的容器
    const allDivs = document.querySelectorAll("div, li, section, .item, [class]");
    const candidates = new Set();

    for (const el of allDivs) {
      const labels = el.querySelectorAll("label, input[type='radio'], input[type='checkbox']");
      if (labels.length >= 2) {
        // 这个元素包含多个选项，可能是一个题目
        let parent = el;
        while (parent && parent.tagName !== "BODY") {
          if (parent.querySelectorAll("label, input[type='radio'], input[type='checkbox']").length >= 2) {
            candidates.add(parent);
          }
          parent = parent.parentElement;
        }
      }
    }

    // 策略2: 查找明显的题目编号模式 (1. 2. 3. 或 1、2、3、)
    for (const el of allDivs) {
      const text = (el.textContent || "").trim();
      if (/^\s*\d+[\.\、\s\)）]/.test(text) && text.length > 20) {
        candidates.add(el);
      }
    }

    // 转换为题目数据
    for (const el of candidates) {
      const text = el.textContent || "";
      if (text.trim().length < 10) continue;

      // 尝试分离题干和选项
      const labels = Array.from(el.querySelectorAll("label, li, .option-item, [class*='option']"));

      const options = labels.map((l) => l.textContent.trim()).filter((t) => t.length > 0 && t.length < 500);

      // 题干 = 去掉选项后的文本
      let stem = text;
      for (const opt of options) {
        stem = stem.replace(opt, "");
      }
      stem = stem.replace(/\s+/g, " ").trim().substring(0, 500);

      // 判断题型
      const hasCheckbox = el.querySelector('input[type="checkbox"]');
      const hasRadio = el.querySelector('input[type="radio"]');
      let type = "single";
      if (hasCheckbox) type = "multiple";
      else if (!hasRadio && options.length === 0) type = "fill";

      results.push({
        question: stem,
        options: options.slice(0, 10),
        type,
        elementIndex: [...candidates].indexOf(el),
      });
    }

    return results.slice(0, 50); // 最多50题
  });
}

// ==========================================
// 解析单个题目块
// ==========================================
async function parseSingleQuestion(page, block, selectors) {
  const data = await block.evaluate((el, sels) => {
    const fullText = (el.textContent || "").trim();
    if (fullText.length < 5) return null;

    // ---- 提取题干 ----
    // 尝试从特定子元素提取
    let stem = "";
    for (const stemSel of sels.questionStem) {
      const stemEl = el.querySelector(stemSel);
      if (stemEl) {
        stem = stemEl.textContent.trim();
        break;
      }
    }
    // 回退：取第一个长文本段落
    if (!stem || stem.length < 3) {
      const paragraphs = el.querySelectorAll("p, div, span");
      for (const p of paragraphs) {
        const t = p.textContent.trim();
        if (t.length > 10 && t.length < 800 && !/^[A-H][\.\、\s]/.test(t)) {
          stem = t;
          break;
        }
      }
    }
    if (!stem) stem = fullText.split(/\n|。/)[0].substring(0, 500);

    // 清理题干：去掉选项字母前缀干扰
    stem = stem
      .replace(/^\s*\d+[\.\、\s）)]\s*/, "")
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, 500);

    // ---- 提取选项 ----
    let optionEls = [];
    for (const sel of sels.optionItem) {
      const items = el.querySelectorAll(sel);
      if (items.length >= 2) {
        optionEls = Array.from(items);
        break;
      }
    }

    // 过滤：只保留像是选项的元素（不包含嵌套题目的）
    const options = [];
    const usedTexts = new Set();

    for (const optEl of optionEls) {
      let text = optEl.textContent.trim();

      // 去掉选项字母前缀 (A. / B、 / C) 等
      text = text.replace(/^[A-H][\.\、\s）)]\s*/, "").trim();

      if (
        text.length > 0 &&
        text.length < 500 &&
        !usedTexts.has(text) &&
        !/^\d+[\.\、]/.test(text) // 排除看起来像题号的
      ) {
        usedTexts.add(text);
        options.push(text);
      }
    }

    // 如果没找到选项元素，尝试从文本中解析字母前缀模式
    if (options.length === 0) {
      const lines = fullText.split(/\n|。\s*/);
      for (const line of lines) {
        const match = line.match(/^([A-H])[\.\、\s）)]\s*(.+)/);
        if (match) {
          options.push(match[2].trim().substring(0, 300));
        }
      }
    }

    // ---- 判断题型 ----
    const checkboxes = el.querySelectorAll('input[type="checkbox"]');
    const radios = el.querySelectorAll('input[type="radio"]');
    const textInputs = el.querySelectorAll(
      'input[type="text"], textarea, input:not([type]), [contenteditable="true"]'
    );

    let type = "single";
    if (checkboxes.length > 0) type = "multiple";
    else if (radios.length === 0 && textInputs.length > 0 && options.length === 0) type = "fill";

    return {
      question: stem,
      options: options.slice(0, 10),
      type,
    };
  }, selectors);

  return data;
}

// ==========================================
// 应用答案到页面
// ==========================================
async function applyAnswer(page, questionObj, answer) {
  const letters = Array.isArray(answer) ? answer : [String(answer)];

  try {
    return await page.evaluate((letters) => {
      let success = false;

      // 遍历所有可能的选项元素
      const allLabels = document.querySelectorAll("label, li, .option-item, .choice-item, [class*='option'], .answer-item");

      for (const letter of letters) {
        const targetIdx = letter.charCodeAt(0) - 65; // A=0, B=1...
        if (targetIdx < 0) continue;

        // 尝试在全局范围找第 targetIdx 个可见选项
        const visibleOptions = Array.from(allLabels).filter((el) => {
          const text = el.textContent.trim();
          return (
            text.length > 0 &&
            text.length < 500 &&
            el.offsetParent !== null // 可见
          );
        });

        if (targetIdx < visibleOptions.length) {
          const target = visibleOptions[targetIdx];

          // 先点内部的 radio/checkbox
          const input = target.querySelector('input[type="radio"], input[type="checkbox"]');
          if (input) {
            input.checked = true;
            input.dispatchEvent(new Event("change", { bubbles: true }));
            input.dispatchEvent(new Event("click", { bubbles: true }));
          }

          // 再点外层
          target.click();
          success = true;
        }
      }

      return success;
    }, letters);
  } catch (e) {
    log(`  ⚠️  applyAnswer 异常: ${e.message}`);
    return false;
  }
}

// ==========================================
// 强制应用（尝试匹配选项文本内容）
// ==========================================
async function forceApplyAnswer(page, questionObj, answer) {
  const letters = Array.isArray(answer) ? answer : [String(answer)];

  // 将字母转换为对应的选项文本
  for (const letter of letters) {
    const idx = letter.charCodeAt(0) - 65;
    if (idx < 0 || idx >= questionObj.options.length) continue;

    const targetText = questionObj.options[idx];
    log(`  尝试文本匹配: "${targetText.substring(0, 30)}..."`);

    try {
      await page.evaluate((targetText) => {
        const allEls = document.querySelectorAll("label, li, div, span, .option-item, [class*='option'], [class*='choice']");

        for (const el of allEls) {
          const text = el.textContent.trim();
          if (text.includes(targetText) && el.offsetParent !== null) {
            const input = el.querySelector('input[type="radio"], input[type="checkbox"]');
            if (input) {
              input.checked = true;
              input.dispatchEvent(new Event("change", { bubbles: true }));
            }
            el.click();
            return true;
          }
        }
        return false;
      }, targetText);
    } catch (e) {
      log(`  文本匹配失败: ${e.message}`);
    }

    await randomDelay(500, 1000);
  }
}

// ==========================================
// 填写填空题
// ==========================================
async function fillBlankAnswer(page, answer) {
  const text = Array.isArray(answer) ? answer.join(" ") : String(answer);

  try {
    // 找最近的可见输入框
    const input = await page.$(
      "input[type='text']:visible, textarea:visible, input:not([type]):visible, [contenteditable='true']"
    );
    if (input) {
      await input.click();
      await input.fill(text);
      log(`  已填入: "${text}"`);
      return true;
    }
  } catch (e) {
    log(`  填空填入失败: ${e.message}`);
  }
  return false;
}

// ==========================================
// 跳转到下一页
// ==========================================
async function goToNextPage(page, selectors) {
  log("🔍 查找「下一页」按钮...");

  try {
    const btnSel = await findOne(page, selectors.submitBtn);
    if (btnSel) {
      log(`  找到按钮: ${btnSel}，点击跳转...`);
      await page.click(btnSel);
      await page.waitForTimeout(3000);

      // 处理可能的确认弹窗
      try {
        await page.waitForSelector(".confirm-btn, .el-message-box__btns button, [class*='confirm']", {
          timeout: 2000,
        });
        log("  检测到确认弹窗，点击确认...");
        await page.click(".confirm-btn, .el-message-box__btns button:last-child");
        await page.waitForTimeout(1000);
      } catch {
        // 没有弹窗，正常
      }

      return true;
    }
  } catch (e) {
    log(`  跳转失败: ${e.message}`);
  }

  return false;
}

// ==========================================
// 自测
// ==========================================
const __filename = fileURLToPath(import.meta.url);
const isMain = process.argv.length >= 2 && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isMain) {
  (async () => {
    console.log("=== 英语平台助手 自测 ===\n");

    // 测试 randomDelay
    console.log("测试随机延迟...");
    const start = Date.now();
    await randomDelay(200, 500);
    const elapsed = Date.now() - start;
    console.log(`延迟: ${elapsed}ms (预期 200-500ms)\n`);

    // 测试问题解析逻辑
    console.log("测试解析逻辑 (模拟DOM)...");
    console.log("  ✅ 模块加载正常");
    console.log("  ✅ 依赖链: askAI <-> english_platforms");
    console.log("  注意: 完整测试需要打开浏览器，请在实际页面中验证");

    rl.close();
  })();
}
