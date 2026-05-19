---
name: generate-media-script
description: Generate a self-contained HTML animation file with CSS+JS, scene-by-scene visual elements, timed narration subtitles. Use when the student asks for 动画 / 视频 / 动画脚本 / 可视化讲解.
allowed-tools: read_file write_file get_entity_graph search_knowledge_base
---

# HTML 动画生成技能

> 指令文件，非 tool。主 agent 读取后按规范生成 HTML 动画。

## 🚨 硬性路径约束（最高优先级）

写盘路径**必须**为（注意：不要加 `/` 前缀，直接以 `workspace` 开头）：
```
workspace/generated/media-scripts/<中文主题名>.html
```

**禁止写到任何其他路径**，包括 `/workspace/generated/media-scripts/` 或 `/generated/media-scripts/`。

**注意**：write_file 工具会提示需要"绝对路径"，但这里必须用 `workspace/...` 格式（不加前导 `/`），系统会自动处理路径。

系统会自动在文件名前注入日期，无需手动添加。

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

### CSS 变量（浅色现代主题）
```css
:root {
    --bg-color: #f8faff;
    --primary-color: #4a90e2;
    --secondary-color: #50e3c2;
    --accent-color: #f5a623;
    --text-main: #2c3e50;
    --text-sub: #7f8c8d;
    --node-bg: #ffffff;
    --line-color: #d1d8e0;
}
```

### 画布容器
```css
#canvas-container {
    width: 1920px; height: 1080px;
    background: white;
    position: relative;
    box-shadow: 0 20px 50px rgba(0,0,0,0.1);
    overflow: hidden;
    display: flex; flex-direction: column;
    transform-origin: center;
}
```
页面加载时需响应式缩放：`Math.min(window.innerWidth / 1920, window.innerHeight / 1080)`

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
<div id="canvas-container">
    <div id="header"><h1>标题</h1></div>
    <div id="stage">
        <svg id="main-svg" viewBox="0 0 1600 800">
            <g id="scene-content"></g>
        </svg>
    </div>
    <div id="subtitle-container">
        <div class="subtitle-zh" id="sub-zh"></div>
        <div class="subtitle-en" id="sub-en"></div>
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

## 视觉风格（浅色现代风格，参考 RNN 动画）

### 色彩
- **浅色背景**：`--bg-color: #f8faff`，画布纯白 `background: white`
- **主色**：`--primary-color: #4a90e2`（蓝色，用于节点描边、标题、连线）
- **辅色**：`--secondary-color: #50e3c2`（青绿，用于隐藏层）
- **强调色**：`--accent-color: #f5a623`（橙色，用于数据粒子、循环箭头、重点高亮）
- **文字**：主文字 `#2c3e50`，副文字 `#7f8c8d`

### 节点样式
- **圆形节点**：`fill: white; stroke: var(--primary-color); stroke-width: 4`
- **矩形节点**：`rx: 10` 圆角，同样白底蓝边
- **标签**：`font-size: 24px; font-weight: bold; text-anchor: middle`

### 连线与动画
- **连线**：`stroke: var(--line-color); stroke-width: 3`，用 `stroke-dasharray/dashoffset` 做描边动画
- **数据粒子**：`fill: var(--accent-color); filter: blur(2px)`，沿路径流动
- **循环箭头**：用 SVG `marker-end` 定义箭头，颜色 `#f5a623`
- **入场动画**：`fadeIn` — `opacity: 0; translateY(20px)` → `opacity: 1; translateY(0)`
- **出场动画**：`fadeOut` — `opacity: 1` → `opacity: 0`
- **高亮发光**：`filter: drop-shadow(0 0 15px var(--primary-color))`

### 字幕区域
- 固定在底部 `bottom: 80px`，居中
- 中文字幕：`font-size: 32px; font-weight: 600; color: var(--text-main)`
- 英文字幕：`font-size: 20px; color: var(--text-sub); text-transform: uppercase`

### 整体质感
- **干净、明亮、扁平**，避免过多渐变和阴影
- 节点用纯白填充 + 彩色描边，不用渐变填充
- 背景纯白或极浅蓝 `#f8faff`
- 动画流畅但不花哨，重点是**清晰传达概念**

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
