---
name: generate-media-script
description: Generate a self-contained HTML animation file with CSS+JS, scene-by-scene visual elements, timed narration subtitles. Use when the student asks for 动画 / 视频 / 动画脚本 / 可视化讲解.
allowed-tools: read_file write_file get_entity_graph search_knowledge_base
---

# HTML 动画生成技能

> 指令文件，非 tool。主 agent 读取后按规范生成 HTML 动画。

## 执行步骤

1. 优先从 task description 中获取画像信息（mastery、易错点、认知风格等）。如果 description 中缺少关键信息，才用 `read_file` 读 `workspace/USER.md` 补全。
2. 优先从 task description 中获取实体信息。如果 description 中没有，才用 `get_entity_graph` 查询。
3. 按下方规范写 HTML 动画。
4. 用 `write_file` 落盘到 `workspace/generated/media-scripts/<中文主题名>.html`（系统自动注入日期前缀）。
5. write_file 成功后，简短确认即可。**不要再调用任何工具。**

## 规模限制（超出会导致文件截断！）

| 项目 | 限制 |
|---|---|
| 场景数 | **5-6 个** |
| 字幕数 | **12-18 条** |
| 每条字幕 | **15-35 个字** |
| 总代码行数 [SKILL.md](SKILL.md)| **800-1000 行** |

复杂度分布：

| mastery | 场景数 | 字幕数 |
|---|---|---|
| < 0.3 | 4 | 10-12 |
| 0.3-0.6 | 5 | 12-15 |
| 0.6-0.8 | 5-6 | 14-16 |
| > 0.8 | 6 | 16-18 |

## HTML 结构要求

文件必须包含以下结构（缺一不可）：

### CSS 变量
```css
:root {
    --bg-color: #0f172a;  /* 深色主题 */
    --primary: #3b82f6;
    --secondary: #8b5cf6;
    --text-main: #f1f5f9;
    --glow-blue: rgba(59, 130, 246, 0.4);
}
```

### 场景容器 CSS（必须有）
```css
[id^="scene-"] {
    position: absolute; inset: 0;
    opacity: 0; pointer-events: none;
    transition: opacity 0.6s ease;
}
[id^="scene-"].active {
    opacity: 1; pointer-events: auto;
}
```

### HTML 结构
```html
<div id="viewport">
    <div id="progress"></div>
    <div id="header"><h1>标题</h1><p>副标题</p></div>
    <div id="scene-indicator"><!-- scene-dot 元素 --></div>
    <div id="stage">
        <div id="scene-0"></div>
        <div id="scene-1"></div>
        <!-- ... -->
    </div>
    <div id="subtitle-container">
        <div id="subtitle-box"><div id="subtitle-cn"></div></div>
    </div>
</div>
```

### 必须包含的 JS 函数（缺一不可）

```javascript
const TOTAL_DURATION = 180000; // 与实际时长匹配
const TOTAL_SCENES = 5;       // 必须等于 sceneN() 函数数量
let startTime;

function updateProgress() { /* 更新进度条 */ }
function updateSubtitle(elapsed) { /* 根据时间更新字幕 */ }
function el(tag, attrs, children) { /* 创建 DOM 元素 */ }
function makeSVG(w, h) { /* 创建 SVG 画布 */ }
function showScene(idx) { /* 添加 active 类 */ }
function clearScene(idx) { /* 清空 innerHTML */ }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function waitForSubtitle(keyword) {
    return new Promise(resolve => {
        const check = setInterval(() => {
            const cn = document.getElementById('subtitle-cn').textContent;
            if (cn.includes(keyword)) { clearInterval(check); resolve(); }
        }, 200);
        setTimeout(() => { clearInterval(check); resolve(); }, 15000);
    });
}
```

**重要**: `waitForSubtitle(keyword)` 的 keyword 必须是某条字幕 cn 的精确子串。请从 subtitles 数组中复制片段，不要自己编造关键词。超时 15 秒后自动跳过。

### runAnimation 模板（必须用 showScene/clearScene）

```javascript
async function runAnimation() {
    startTime = Date.now();
    const timer = setInterval(() => {
        updateProgress();
        updateSubtitle(Date.now() - startTime);
    }, 100);

    showScene(0);
    await scene0();
    await waitForSubtitle('关键词1');
    clearScene(0);

    showScene(1);
    await scene1();
    await waitForSubtitle('关键词2');
    clearScene(1);

    // 最后一个场景不需要 clearScene
    showScene(2);
    await scene2();

    clearInterval(timer);
    document.getElementById('progress').style.width = '100%';
}
window.onload = runAnimation;
```

## 字幕与音频

系统会自动处理，**无需在 HTML 中实现**：
1. 字幕文本会自动生成 TTS 语音
2. `time` 字段会按 4.5 字/秒 语速自动重算
3. 前端监听字幕变化自动播放音频

字幕格式：
```javascript
const subtitles = [
    { time: 0, cn: "第一段旁白" },
    { time: 3500, cn: "第二段旁白" },
];
```

## 视觉风格

- **深色主题**：`--bg-color: #0f172a`
- **渐变标题**：`background: linear-gradient` + `-webkit-background-clip: text`
- **毛玻璃字幕**：`backdrop-filter: blur(12px)`
- **网格背景**：`#viewport::before` 用 `linear-gradient`
- **发光效果**：`box-shadow: 0 0 20px var(--glow-blue)`
- **入场动画**：`translateY(20px)` → `translateY(0)`

## 禁止

- 禁止引用外部 CDN / 字体 / 库
- 禁止用 innerHTML 拼接文本（用 `el()` 函数）
- 禁止超过 6 个场景或 18 条字幕
- 禁止遗漏 `showScene()` / `clearScene()` 调用
- 禁止 `TOTAL_SCENES` 与实际场景数不一致

## 生成检查清单

- [ ] 文件有 `</script></body></html>` 关闭标签
- [ ] `TOTAL_SCENES` 等于实际 `sceneN()` 函数数量
- [ ] 每个场景前有 `showScene(N)`，切换时有 `clearScene(N)`
- [ ] 包含所有必须的函数
- [ ] 字幕数不超过 18 条
