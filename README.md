# 🎓 万能网课助手

自动挂机刷网课 + AI 智能答题，支持 **智慧树**、**WeLearn 随行课堂**、**U校园 AI 版**。

> 基于 Playwright 浏览器自动化 + DeepSeek / GPT-4o 大模型驱动

---

## 🧠 技术架构

```
┌─────────────┐     ┌──────────────────────────────┐
│   index.js   │────▶│  交互式 CLI 菜单 (readline)    │
│   (主入口)    │     └──────────┬───────────────────┘
└─────────────┘                │
       ┌───────────────────────┼───────────────────────┐
       ▼                       ▼                       ▼
┌──────────────┐    ┌──────────────────┐    ┌──────────────────┐
│ zhihuishu.js │    │english_platforms │    │   ai_solver.js   │
│ 智慧树自动视频 │    │  WeLearn/U校园    │    │   AI 答题大脑     │
│              │    │  AI 全自动做题    │    │                  │
│ · 自动登录    │    │                  │    │ · Prompt 工程     │
│ · 播放监控    │    │ · 题目扫描        │    │ · 5层解析容错     │
│ · 弹窗处理    │    │ · 逐题作答        │    │ · 自动重试        │
│ · 进度检测    │    │ · 翻页继续        │    │ · 多API兼容       │
│ · 切集导航    │    │ · 防封延迟        │    │                  │
└──────┬───────┘    └────────┬─────────┘    └────────┬─────────┘
       │                     │                       │
       └─────────────────────┼───────────────────────┘
                             │
                    ┌────────▼────────┐
                    │   DeepSeek API  │
                    │   或 OpenAI API  │
                    └─────────────────┘
```

---

## 📁 项目结构

```
smart-study-assistant/
├── index.js                   # 主入口 — 交互式命令行菜单
├── package.json
├── .env.example               # 环境变量模板（可安全提交）
├── .gitignore                 # 隐私保护配置
├── README.md
└── src/
    ├── zhihuishu.js           # 智慧树 — 自动视频播放 + AI弹窗答题
    ├── english_platforms.js   # WeLearn/U校园 — AI 全自动做题
    └── ai_solver.js           # AI 答题大脑 — 通用题目推理与解析
```

---

## 🚀 快速开始

### 1. 环境要求

- **Node.js** >= 18
- **npm** >= 9
- 系统已安装 Chrome 浏览器（或由 Playwright 自动下载 Chromium）

### 2. 安装依赖

```bash
npm install
npx playwright install chromium   # 安装 Playwright 浏览器内核
```

### 3. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env` 填入真实值：

```env
# ========== 智慧树账号 ==========
COURSE_USERNAME=你的手机号
COURSE_PASSWORD=你的密码

# ========== AI 大模型 ==========
AI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx
AI_API_URL=https://api.deepseek.com/v1/chat/completions
AI_MODEL=deepseek-chat

# ========== 智慧树课程URL（可选） ==========
COURSE_URL=https://studyh5.zhihuishu.com/xxx
```

### 4. 运行

```bash
npm start
```

---

## 🖥️ 交互菜单

```
=================================
   🎓  万能网课助手  v1.0.0
=================================
  1. 智慧树 — 自动视频 + 跳过弹窗
  2. WeLearn / U校园 — AI 全自动做题
  0. 退出
=================================
请输入数字选择功能:
```

---

## 🔧 模块详解

### 📺 智慧树（选项 1）— `src/zhihuishu.js`

| 步骤 | 说明 |
|------|------|
| 自动登录 | 打开智慧树登录页 → 填入 `.env` 中的账号密码 → 检测验证码并提示手动过 |
| 课程跳转 | 从 `.env` 的 `COURSE_URL` 或终端输入获取播放页 URL 并跳转 |
| 播放监控 | 每 **5 秒** 检查一次：视频暂停→恢复播放 / 弹窗→AI答题 / 播完→切下一集 |
| 弹窗处理 | 提取题目→调用 `askAI()`→点击正确选项→提交，3 层兜底策略 |
| 进度检测 | 三重检测：`video.currentTime` / DOM 时间文本 / 进度条宽度百分比 |
| 切集导航 | 优先点击「下一节」按钮，否则在课程目录列表中定位右侧下一个视频 |

**完整流程图：**

```
登录 → 跳转课程 → 点击播放 → 进入监控循环
                              ├─ 暂停? → 恢复播放
                              ├─ 弹窗? → AI答题 → 提交
                              └─ 播完? → 切下一集 → 循环
```

### 📝 WeLearn / U校园（选项 2）— `src/english_platforms.js`

| 步骤 | 说明 |
|------|------|
| 手动登录 | 打开空白浏览器 → 用户自行登录并导航到做题页面 → 按 Enter 开始 |
| 题目扫描 | 自动定位所有题目块，提取题干文本 + 选项列表 + 题型判断 |
| AI 作答 | 逐题调用 `askAI()` → 1~3s 随机延迟 → 根据答案字母点击对应选项 |
| 填空处理 | 自动寻找输入框 → `.fill()` 填入 AI 返回的文本 |
| 翻页继续 | 查找「下一页」/「提交」按钮 → 点击 → 处理确认弹窗 → 继续扫描 |

**双平台适配：**

```js
PLATFORM_SELECTORS = {
  welearn: { /* 7 组选择器 */ },
  ucampus: { /* 7 组选择器 */ },
}
```

每组 5~10 个候选选择器，`findOne()` 自动匹配当前平台实际 DOM。

### 🧠 AI 答题大脑 — `src/ai_solver.js`

**API 设计：**

```js
import { askAI } from "./src/ai_solver.js";

const result = await askAI("题目", ["选项A", "选项B"], "single");
// → { answer: "B" }

const result = await askAI("多选题目", ["A", "B", "C", "D"], "multiple");
// → { answer: ["A", "C"] }

const result = await askAI("填空题目", [], "fill");
// → { answer: "正确答案文本" }
```

**Prompt 工程：**
- System：定位"顶尖网课助教"，要求纯 JSON 输出，严禁 Markdown 包裹
- User：动态拼接题型标签 + 题目 + 选项（自动编号 A/B/C/D）
- 参数：`temperature: 0.1` 追求确定性

**5 层 JSON 解析容错：**

| 层 | 策略 | 能处理的输入 |
|----|------|-------------|
| 1 | 直接 `JSON.parse` | `{"answer": "A"}` |
| 2 | 剥离 ` ```json ``` ` | ` ```json\n{"answer":"C"}\n``` ` |
| 3 | 提取 `{...}` 范围 | `答案是：{"answer": "D"}` |
| 4 | 修复单引号/尾逗号 | `{'answer':['A','B'],}` |
| 5 | 正则兜底 | 以上全失败的最后手段 |

**多 API 格式兼容：**
- OpenAI 格式：`choices[0].message.content`
- Anthropic 格式：`content[{type:"text", text:"..."}]`
- 自动根据 `AI_API_URL` 是否包含 `anthropic` 判断

---

## 🤖 AI 服务商配置

默认使用 OpenAI 兼容接口，支持以下服务：

| 服务商 | `AI_API_URL` | `AI_MODEL` | 约花费 |
|--------|-------------|-----------|--------|
| DeepSeek | `https://api.deepseek.com/v1/chat/completions` | `deepseek-chat` | ~¥1/千题 |
| 硅基流动 | `https://api.siliconflow.cn/v1/chat/completions` | `deepseek-ai/DeepSeek-V3` | ~¥1/千题 |
| OpenAI | `https://api.openai.com/v1/chat/completions` | `gpt-4o` | ~$3/千题 |
| 自定义 | 任意 OpenAI 兼容地址 | 自定义 | — |

---

## 🔒 安全注意事项

> ⚠️ 本项目涉及 API Key 和账号密码，务必遵守以下规则。

### ✅ 项目已配置的保护

- `.gitignore` 已排除：`.env`、`.env.local`、`node_modules`、`.DS_Store`、`*.log`、`playwright-browsers/`
- `.env.example` 仅含占位符，可安全提交到 Git

### ⚠️ 你必须遵守的规则

1. **永远不要提交 `.env`** — 每次 commit 前执行 `git status` 确认 `.env` 不在暂存区
2. **推送前双重检查**：
   ```bash
   git status                    # 确认无 .env
   git log --oneline -5          # 确认历史无敏感信息
   ```
3. **密钥泄露应急流程**：
   - 立即到 API 服务商后台 **Revoke** 旧 Key
   - 生成新 Key 并更新 `.env`
   - 用 `git filter-branch` 或 `BFG Repo-Cleaner` 清理 Git 历史
4. **保持私有** — 本项目设计为私有仓库使用。GitHub 私有仓库的内容在设为公开后，历史记录中的密钥可被永久检索
5. **不要分享 `.env`** — 不要通过微信/QQ/钉钉/网盘等任何方式传输 `.env` 文件

---

## 📋 依赖

| 包 | 版本 | 用途 |
|----|------|------|
| `playwright` | ^1.60 | 浏览器自动化 — 控制 Chrome/Chromium |
| `dotenv` | ^17.4 | 从 `.env` 加载环境变量到 `process.env` |
| `axios` | ^1.17 | HTTP 客户端 — 调用 AI API |

---

## ❓ 常见问题

<details>
<summary><b>Q: 智慧树提示"未找到用户名输入框"？</b></summary>

页面 DOM 结构可能已更新。脚本会自动截图 `debug-login.png`，请根据截图调整 `src/zhihuishu.js` 中 `SELECTORS.usernameInput` 的选择器列表。
</details>

<details>
<summary><b>Q: AI 答题准确率如何？</b></summary>

- 单选题（`deepseek-chat` / `gpt-4o`）：> 95%
- 多选题：约 85%~90%
- 填空题：约 80%~85%

可通过编辑 `ai_solver.js` 中的 `buildSystemPrompt()` 函数自定义 prompt 以提高特定学科的准确率。
</details>

<details>
<summary><b>Q: 会被平台检测为机器人吗？</b></summary>

已内置 **1~3 秒随机延迟** 和 **Playwright 反检测参数**（`--disable-blink-features=AutomationControlled`）。
建议：
- 避免 7×24 小时连续运行
- 遇到验证码时手动处理
- 不要在单个课程上以非人类速度完成
</details>

<details>
<summary><b>Q: npm start 报错找不到 playwright？</b></summary>

```bash
npx playwright install chromium
```

这会下载 Playwright 所需的 Chromium 浏览器内核（约 150MB）。
</details>

<details>
<summary><b>Q: 能否只做视频挂机、不用 AI 答题？</b></summary>

可以。弹窗出现时脚本会自动走兜底策略——随机选一个选项并提交。AI 失败不影响视频继续播放。
</details>

<details>
<summary><b>Q: 如何切换 AI 模型？</b></summary>

编辑 `.env`：
```env
AI_API_URL=https://你的API地址/v1/chat/completions
AI_API_KEY=你的Key
AI_MODEL=模型名
```
</details>

---

## 🛠️ 开发

```bash
# 单独测试 AI 答题模块（含解析器自测）
node src/ai_solver.js

# 语法检查
node --check index.js
node --check src/zhihuishu.js
node --check src/english_platforms.js
node --check src/ai_solver.js
```

---

## 📜 License

ISC — 仅供学习研究使用，请勿用于违反平台服务条款的场景。
