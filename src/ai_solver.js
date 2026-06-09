import dotenv from "dotenv";
import axios from "axios";
import { fileURLToPath } from "url";
import path from "path";

dotenv.config();

// ==========================================
// 日志
// ==========================================
function log(msg) {
  console.log(`  [AI大脑] ${new Date().toLocaleTimeString()}  ${msg}`);
}

// ==========================================
// 配置
// ==========================================
const API_URL = process.env.AI_API_URL || "https://api.openai.com/v1/chat/completions";
const API_KEY = process.env.AI_API_KEY || "";
const AI_MODEL = process.env.AI_MODEL || "gpt-4";

// 自动检测 API 类型：URL 中包含 "anthropic" 则使用 Anthropic 格式
const API_TYPE = API_URL.includes("anthropic") ? "anthropic" : "openai";

// ==========================================
// 构建 System Prompt
// ==========================================
function buildSystemPrompt() {
  return `你是一个顶尖的网课助教AI，你的唯一目标是在所有题目上取得100%的正确率。

请严格遵守以下规则：
1. 仔细阅读题目和选项，分析后给出最准确的答案。
2. 只返回一个合法的 JSON 对象，不要包含任何其他文字、解释、Markdown 代码块标记。
3. JSON 格式必须是：{"answer": "答案内容"}
   - 单选题：{"answer": "A"}（只返回字母）
   - 多选题：{"answer": ["A", "C"]}（返回字母数组）
   - 填空题：{"answer": "填入的文本内容"}
4. 如果选项不足以覆盖所有正确可能（如判断题），请通过已有选项进行推断。
5. 严禁返回 {"answer": ["A", "B", "C", "D"]} 这种全选猜测，除非你100%确定。

你的回复必须且只能是纯 JSON，以字符 { 开头，以字符 } 结尾。`;
}

// ==========================================
// 构建 User Prompt
// ==========================================
function buildUserPrompt(question, options, type) {
  let prompt = "请回答以下题目：\n\n";
  prompt += `【题型】${type === "single" ? "单选题" : type === "multiple" ? "多选题" : "填空题"}\n`;
  prompt += `【题目】${question}\n`;

  if (options && options.length > 0) {
    prompt += "【选项】\n";
    options.forEach((opt, idx) => {
      const letter = String.fromCharCode(65 + idx); // A, B, C, D...
      prompt += `  ${letter}. ${opt}\n`;
    });
  }

  prompt += "\n请给出你的答案（纯JSON格式）：";
  return prompt;
}

// ==========================================
// 解析 AI 返回结果
// ==========================================
function parseAIResponse(rawText) {
  if (!rawText || !rawText.trim()) {
    log("⚠️  AI 返回了空内容");
    return null;
  }

  let cleaned = rawText.trim();

  // 策略1: 尝试直接解析
  try {
    const result = JSON.parse(cleaned);
    if (result.answer !== undefined) return result;
  } catch (_) {
    // 继续尝试其他策略
  }

  // 策略2: 去掉 ```json ... ``` 外壳
  const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    try {
      const result = JSON.parse(fenceMatch[1].trim());
      if (result.answer !== undefined) return result;
    } catch (_) {
      // 继续
    }
  }

  // 策略3: 提取第一个 { 到最后一个 } 的 JSON 块
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const jsonCandidate = cleaned.substring(firstBrace, lastBrace + 1);
    try {
      const result = JSON.parse(jsonCandidate);
      if (result.answer !== undefined) return result;
    } catch (_) {
      // 继续
    }
  }

  // 策略4: 尝试修复常见错误（单引号、尾逗号等）
  try {
    const fixed = cleaned
      .replace(/```(?:json)?\s*/g, "")
      .replace(/```/g, "")
      .replace(/'/g, '"')
      .replace(/,\s*}/g, "}")
      .replace(/,\s*]/g, "]")
      .trim();
    const result = JSON.parse(fixed);
    if (result.answer !== undefined) return result;
  } catch (_) {
    // 继续
  }

  // 策略5: 如果 JSON 解析全部失败，尝试用正则从文本中提取 answer
  const answerMatch = cleaned.match(/"answer"\s*:\s*(\[?[^\]]*\]?)/);
  if (answerMatch) {
    try {
      const answerValue = JSON.parse(answerMatch[1]);
      return { answer: answerValue };
    } catch (_) {
      // 纯文本处理：去掉引号和方括号
      const raw = answerMatch[1].replace(/[\[\]"'\s]/g, "");
      if (raw) {
        // 判断是单选还是多选
        if (raw.length === 1 && /[A-D]/.test(raw)) {
          return { answer: raw };
        }
        if (raw.includes(",")) {
          return { answer: raw.split(",").map((s) => s.trim()).filter(Boolean) };
        }
        return { answer: raw };
      }
    }
  }

  log("⚠️  所有解析策略均失败，原始返回:");
  log(`    ${rawText.substring(0, 200)}`);
  return null;
}

// ==========================================
// 主函数：调用 AI
// ==========================================
export async function askAI(question, options = [], type = "single") {
  log(`收到题目 (${type}): ${question.substring(0, 50)}...`);

  if (!API_KEY) {
    log("❌ 请在 .env 文件中配置 AI_API_KEY");
    return null;
  }

  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(question, options, type);

  // 根据 API 类型构建不同格式的请求体
  let payload;
  if (API_TYPE === "anthropic") {
    payload = {
      model: AI_MODEL,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      max_tokens: 500,
    };
  } else {
    payload = {
      model: AI_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.1,
      max_tokens: 500,
    };
  }
  log(`  使用 ${API_TYPE} 格式请求 ${API_URL}`);

  // 重试逻辑（最多3次）
  const MAX_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      log(`正在请求 AI (第${attempt}次)...`);

      const response = await axios.post(API_URL, payload, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        timeout: 30000,
      });

      // 兼容多种响应格式（OpenAI / Anthropic / 自定义）
      let content =
        response.data?.choices?.[0]?.message?.content ||  // OpenAI 格式
        response.data?.choices?.[0]?.text ||              // 旧版 OpenAI
        response.data?.response ||                         // 自定义格式
        "";

      // Anthropic 格式: content 是数组 [{type:"text", text:"..."}]
      if (!content && Array.isArray(response.data?.content)) {
        content = response.data.content
          .filter((b) => b.type === "text")
          .map((b) => b.text)
          .join("");
      }

      if (!content) {
        log(`⚠️  API 返回格式异常: ${JSON.stringify(response.data).substring(0, 200)}`);
        if (attempt < MAX_RETRIES) {
          log(`   等待 2 秒后重试...`);
          await sleep(2000);
          continue;
        }
        return null;
      }

      log(`AI 原始返回: ${content.substring(0, 150)}`);

      const result = parseAIResponse(content);
      if (result) {
        log(`✅ 解析成功 → answer: ${JSON.stringify(result.answer)}`);
        return result;
      }

      // 解析失败也重试
      if (attempt < MAX_RETRIES) {
        log(`   解析失败，等待 2 秒后重试...`);
        await sleep(2000);
      }
    } catch (error) {
      const errMsg = error.response
        ? `HTTP ${error.response.status}: ${JSON.stringify(error.response.data).substring(0, 200)}`
        : error.message;
      log(`❌ 请求失败 (第${attempt}次): ${errMsg}`);

      if (attempt < MAX_RETRIES) {
        const delay = attempt * 2000;
        log(`   等待 ${delay / 1000} 秒后重试...`);
        await sleep(delay);
      }
    }
  }

  log("❌ 3次尝试均失败");
  return null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ==========================================
// 测试入口（直接运行此文件时触发）
// ==========================================
const __filename = fileURLToPath(import.meta.url);
const isMain = process.argv.length >= 2 && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isMain) {
  (async () => {
    console.log("=== AI答题大脑 自测 ===\n");

    // 测试单选题
    const result1 = await askAI(
      "在HTML中，哪个标签用于定义最重要的标题？",
      ["<h6>", "<head>", "<h1>", "<header>"],
      "single"
    );
    console.log("结果1:", JSON.stringify(result1, null, 2));
    console.log();

    // 测试解析器
    console.log("=== 解析器测试 ===");
    const tests = [
      '{"answer": "A"}',
      '```json\n{"answer": ["B", "D"]}\n```',
      '好的，我的答案是：\n{"answer": "C"}',
      "```json\n{\n  \"answer\": \"填空题的答案内容\"\n}\n```",
      '{"answer": ["A", "B", "C"]} 这是基于...',
    ];
    for (const t of tests) {
      const parsed = parseAIResponse(t);
      console.log(`  输入: ${t.substring(0, 40)}...`);
      console.log(`  输出: ${JSON.stringify(parsed)}`);
      console.log();
    }
  })();
}
