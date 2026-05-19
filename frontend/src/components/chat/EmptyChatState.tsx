'use client';

import { BookOpen, Brain, GraduationCap, Sparkles } from 'lucide-react';

interface EmptyChatStateProps {
  onSelectPrompt: (prompt: string) => void;
}

const PROMPTS: Array<{ icon: typeof Sparkles; title: string; hint: string; prompt: string }> = [
  {
    icon: BookOpen,
    title: '给我学习材料',
    hint: '按画像派发讲义 + 故事板 + 代码案例',
    prompt: '请根据 workspace/learning_plan.md 当前主题给我定制学习材料',
  },
  {
    icon: Brain,
    title: '讲解反向传播',
    hint: '即时答疑 + 结合你的画像调整深度',
    prompt: '请帮我讲解反向传播算法，要结合我的画像',
  },
  {
    icon: GraduationCap,
    title: '评估我的学习',
    hint: '生成多维度学情报告并更新 learning_plan',
    prompt: '请评估我的学习效果，生成报告',
  },
  {
    icon: Sparkles,
    title: '出 3 道练习题',
    hint: '按薄弱点定制习题 + 参考答案',
    prompt: '请按我当前薄弱点出 3 道练习题',
  },
];

export function EmptyChatState({ onSelectPrompt }: EmptyChatStateProps) {
  return (
    <div className="h-full flex flex-col items-center justify-center p-6">
      <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
        <Sparkles className="w-6 h-6 text-primary" />
      </div>
      <h2 className="text-xl font-semibold text-foreground mb-1">开始一段新对话</h2>
      <p className="text-sm text-muted-foreground mb-6 text-center max-w-sm">
        Mini OpenClaw 会结合你的学生画像与学习计划定制回答
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl">
        {PROMPTS.map(({ icon: Icon, title, hint, prompt }) => (
          <button
            key={title}
            onClick={() => onSelectPrompt(prompt)}
            className="group text-left p-4 rounded-xl border border-border bg-card hover:bg-accent hover:border-ring transition-all"
          >
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                <Icon className="w-4 h-4 text-primary" />
              </div>
              <span className="text-sm font-medium text-foreground">{title}</span>
            </div>
            <p className="text-xs text-muted-foreground">{hint}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
