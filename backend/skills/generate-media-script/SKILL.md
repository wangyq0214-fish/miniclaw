---
name: generate-media-script
description: Generate a Markdown storyboard (5-8 scenes with narration, visuals, timing) for teaching a concept. When the task description mentions 视频 / 动画 / MP4 / animation / 跑起来, also produce a manim Python script and attempt to render MP4. Use when the student asks for 视频 / 动画 / 演示 / 讲给我看.
allowed-tools: read_file write_file get_entity_graph terminal python_repl
---

# 多模态教学脚本生成技能(双模)

> 指令文件,非 tool。被 `media_director` 子代理读取执行。

## 模式判定

**默认模式(storyboard only)**:只产出 `storyboard.md`。零依赖、秒级生成。

**升级模式(storyboard + manim)**:task 描述里含以下任一关键词时触发:
- 视频、动画、MP4、animation、跑起来、生成影片、做个动画

升级模式**额外**生成 `animation.py` + 尝试 manim 渲染 MP4。

## 执行步骤(通用,先做)

### Step 1:读画像
**tool**: `read_file` · **input**: `{"path": "workspace/USER.md"}`

关注:
- 维度 4:视觉型偏好(决定镜头复杂度和颜色活跃度)
- 维度 3:mastery(决定讲解深度 — 入门级多做直觉镜头,进阶级可上公式推导)

### Step 2:查实体依赖
**tool**: `get_entity_graph` · **input**: `{"entity_name": "<主题>"}`

拿到前置 → 本主题 → 后续 的概念链,作为故事叙事节奏的骨架。

### Step 3:写 storyboard.md

**tool**: `write_file` · **input**:
```json
{
  "path": "knowledge/generated/<YYYY-MM-DD>/<topic-slug>/storyboard.md",
  "mode": "write",
  "content": "<完整故事板>"
}
```

故事板模板:

```markdown
---
topic: <主题>
topic_slug: <slug>
scene_count: <N>
total_duration_sec: <M>
mode: storyboard | storyboard+manim
generated_at: <ISO>
generated_by: media_director
---

# <主题> · 教学故事板

## 总览
- **叙事脉络**: 动机(引入问题) → 直觉(类比) → 机理(核心步骤) → 示例(走通一次) → 小结
- **视觉风格**: <几何动画 / 代码 walkthrough / 数据可视化 / 思维导图演进>
- **目标时长**: <N 秒>
- **目标观众**: <专业/年级>,当前 mastery=<值>

## 场景 1:开场引入(0-8 秒)
- **画面**: 黑屏 → 浮现大字"<主题>" → 下方一行小字说"为什么要学?"
- **动效**: 文字渐入(fade in 0.5s),缩放到位
- **旁白**:「你有没有想过,一个神经网络是怎么知道自己哪里错了?这就是反向传播要解决的问题。」
- **关键视觉元素**: 主标题用蓝色 #1E88E5,副标题用灰色 #757575

## 场景 2:直觉(类比)(8-20 秒)
- **画面**: 右侧出现一个简单的"前向传播"流水线(3 个节点连线),左侧出现 label "预测错了"
- **动效**: 错误从输出端沿着连线**反向**流回来,每到一个节点就高亮一下
- **旁白**:「就像工厂流水线出了次品,你得顺着工序反推回去,找到哪一步出了问题。」
- **关键视觉元素**: 节点用圆形,错误用红色流动箭头

## 场景 3:机理(20-40 秒)
...

(5-8 个场景)

## 小节 & 制作提示
- **剪辑节奏**: 入门级推荐 8 秒/镜头(不赶);进阶级可 5 秒/镜头
- **推荐工具**: manim(数学动画)/ Adobe After Effects(通用)/ Figma Motion(简洁 UI)
- **音乐**: 轻量环境音,不超过 -20dB
- **字幕**: 旁白重点术语同步打字幕
```

## 升级模式额外步骤(仅在判定为升级时)

### Step 4:生成 manim 脚本

按故事板场景顺序写 manim Python 脚本,模板:

```python
"""
<主题> · Manim 动画

对应 storyboard.md 的场景 1-N
运行方式:
    manim -pql animation.py <SceneClassName>
输出:
    media/videos/animation/480p15/<SceneClassName>.mp4
"""
from manim import *


class <SceneClassName>(Scene):
    def construct(self):
        # Scene 1: 开场引入 (0-8s)
        title = Text("<主题>", font_size=60, color=BLUE)
        subtitle = Text("为什么要学?", font_size=30, color=GREY).next_to(title, DOWN)
        self.play(FadeIn(title, shift=DOWN * 0.5), run_time=1.0)
        self.play(FadeIn(subtitle, shift=DOWN * 0.3), run_time=0.8)
        self.wait(1.5)
        self.play(FadeOut(title), FadeOut(subtitle))

        # Scene 2: 直觉(类比) (8-20s)
        # <代码对应场景 2>
        ...

        # Scene N: ...

        self.wait(1.0)
```

**Class 命名**:CamelCase,紧扣主题,如 `BackpropDemo`、`GradientDescentIntuition`。

写盘:
**tool**: `write_file` · **input**:
```json
{
  "path": "knowledge/generated/<date>/<topic-slug>/animation.py",
  "mode": "write",
  "content": "<完整 python 脚本>"
}
```

### Step 5:尝试渲染 MP4(只试 1 次)

**tool**: `terminal` · **input**:
```json
{
  "command": "cd knowledge/generated/<date>/<topic-slug> && manim -pql animation.py <SceneClassName> --media_dir media 2>&1 | tail -30"
}
```

**时限**:terminal 工具本身 30s 超时。低画质(`-pql`)一般够用。

### Step 6:处理渲染结果

- **成功**:在 storyboard.md 末尾追加一节:
  ```
  ## 动画生成状态
  ✅ 已生成 MP4 → `media/videos/animation/480p15/<SceneClassName>.mp4`
  手动播放命令:`manim -pqh animation.py <SceneClassName>` (改成高画质重渲)
  ```
- **失败**(manim 未安装 / 语法错 / 超时):在 storyboard.md 末尾追加:
  ```
  ## 动画生成状态
  ⚠️ 动画渲染失败。错误摘要:
  \`\`\`
  <terminal 返回的最后 10 行错误>
  \`\`\`
  **解决方案**:
  - 缺 manim:`pip install manim`
  - 装好后手动跑:`cd knowledge/generated/<date>/<topic-slug> && manim -pql animation.py <SceneClassName>`

  storyboard.md 内容已保存,可以先用它手工制作。
  ```
- **禁止**无限重试。失败后直接降级到 storyboard-only。

## 硬性要求

- **storyboard.md 始终输出**(即使升级模式也要)
- 场景数 5-8 个
- 每个场景必须有:画面 / 动效 / 旁白 / 关键视觉元素
- 总时长估算合理(每场景 5-15 秒)
- 升级模式下 animation.py 里的 Scene class 名必须与 terminal 命令中传的一致

## 禁止

- 禁止场景描述空壳("场景 3: 讲解链式法则" 没画面 / 动效 / 旁白 → 不合格)
- 禁止 manim 脚本里用联网、文件 I/O(安全)
- 禁止重试 manim 超过 1 次
- 禁止用奇葩 class 名导致 terminal 命令不对应
