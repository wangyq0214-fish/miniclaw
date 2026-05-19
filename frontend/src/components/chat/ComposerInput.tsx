'use client';

import { useEffect, useRef, useState, useCallback, useMemo, type KeyboardEvent, type ReactNode } from 'react';
import {
  Send,
  Square,
  Sparkles,
  BookOpen,
  Brain,
  List,
  Code,
  FileText,
  Wrench,
  Paperclip,
  AtSign,
  ChevronDown,
  Database,
  Loader2,
  Terminal,
  FolderOpen,
  FileCode,
  Layers,
  Zap,
} from 'lucide-react';
import { listSkills, listFiles, type SkillInfo, type FileInfo } from '@/lib/api';
import { useApp } from '@/lib/store';

// ── Types ──────────────────────────────────────────────

interface AgentOption {
  id: string;
  name: string;
  icon: typeof Sparkles;
  desc: string;
  triggers: string;
}

interface ComposerInputProps {
  onSend: (message: string) => void;
  onStop: () => void;
  isLoading: boolean;
  disabled?: boolean;
  chatMode?: 'chat' | 'coder';
  onChatModeChange?: (mode: 'chat' | 'coder') => void;
}

// ── Real Backend Subagents ─────────────────────────────
// Mapped from backend/agents/resource_agents.py RESOURCE_ROLES

const AGENT_LIST: AgentOption[] = [
  {
    id: 'auto',
    name: '自动路由',
    icon: Sparkles,
    desc: '自动分析意图并分配任务',
    triggers: '',
  },
  {
    id: 'lecture_writer',
    name: '讲义生成',
    icon: BookOpen,
    desc: '生成深度讲解文档，含动机/定义/直觉/机制/示例/陷阱',
    triggers: '讲解 / 文档 / 教程 / 介绍某概念',
  },
  {
    id: 'mindmap_designer',
    name: '思维导图',
    icon: Brain,
    desc: '生成交互式知识树 JSON，用于 MindmapCard 可视化',
    triggers: '思维导图 / 概念图 / 知识梳理 / 一张图看懂',
  },
  {
    id: 'exercise_composer',
    name: '练习题生成',
    icon: List,
    desc: '生成 5-8 道混合题型（选择/判断/简答/编程）',
    triggers: '题 / 练习 / 测验 / 自测',
  },
  {
    id: 'flashcard_composer',
    name: '抽认卡制作',
    icon: Layers,
    desc: '生成 10-20 张间隔重复记忆卡片',
    triggers: '抽认卡 / 闪卡 / 记忆卡 / 复习卡',
  },
  {
    id: 'reading_curator',
    name: '阅读推荐',
    icon: FileText,
    desc: '检索并推荐 5-8 篇外部阅读材料',
    triggers: '拓展阅读 / 资料 / 参考 / 推荐书单',
  },
  {
    id: 'code_case_builder',
    name: '代码案例',
    icon: Code,
    desc: '生成 2-4 个可运行的分层代码案例（Python）',
    triggers: '代码 / 实现 / 示例 / demo / 动手',
  },
];

// ── Helpers ────────────────────────────────────────────

const MAX_ROWS = 8;
const MIN_HEIGHT = 60;

// Map skill name to a display-friendly label
function skillDisplayName(skill: SkillInfo): string {
  const nameMap: Record<string, string> = {
    'evaluate-learning': '学习评估',
    'generate-code-case': '代码案例',
    'generate-exercises': '练习题',
    'generate-flashcards': '抽认卡',
    'generate-lecture': '讲义',
    'generate-mindmap': '思维导图',
    'generate-reading-list': '阅读清单',
    'generate-media-script': '媒体脚本',
    'get-weather': '天气查询',
    'tavily-search': '网络搜索',
    'update-student-profile': '学生档案',
  };
  return nameMap[skill.name] || skill.name;
}

// ── Popover Hook ───────────────────────────────────────

function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return { open, setOpen, ref };
}

// ── Sub-components ─────────────────────────────────────

function ToolbarButton({
  icon: Icon,
  label,
  onClick,
  active,
  className = '',
}: {
  icon: typeof Sparkles;
  label: ReactNode;
  onClick?: () => void;
  active?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors
        hover:bg-black/[0.06] dark:hover:bg-white/[0.08]
        ${active ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'text-muted-foreground'}
        ${className}`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span>{label}</span>
    </button>
  );
}

function SkillsDropdown({ skills }: { skills: SkillInfo[] }) {
  const { open, setOpen, ref } = usePopover();

  return (
    <div className="relative" ref={ref}>
      <ToolbarButton
        icon={Wrench}
        label={
          <span className="flex items-center gap-0.5">
            工具 <ChevronDown className={`w-2.5 h-2.5 transition-transform ${open ? 'rotate-180' : ''}`} />
          </span>
        }
        onClick={() => setOpen(!open)}
      />

      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-64 bg-popover border border-border rounded-xl shadow-lg overflow-hidden z-50">
          <div className="px-3 py-2 border-b border-border">
            <span className="text-xs font-medium text-muted-foreground">可用技能</span>
          </div>
          <div className="p-1 max-h-60 overflow-y-auto">
            {skills.length === 0 ? (
              <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                暂无可用技能
              </div>
            ) : (
              skills.map((skill) => (
                <div
                  key={skill.name}
                  className="flex items-start gap-2.5 px-3 py-2 rounded-lg hover:bg-black/[0.04] dark:hover:bg-white/[0.06] cursor-default"
                >
                  <div className="w-6 h-6 rounded-md bg-muted flex items-center justify-center shrink-0 mt-0.5">
                    <Wrench className="w-3 h-3 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-foreground">{skillDisplayName(skill)}</div>
                    <div className="text-[11px] text-muted-foreground leading-tight mt-0.5 line-clamp-2">
                      {skill.description}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AgentSelector({
  currentAgent,
  onSelect,
}: {
  currentAgent: string;
  onSelect: (id: string) => void;
}) {
  const { open, setOpen, ref } = usePopover();
  const current = AGENT_LIST.find((a) => a.id === currentAgent) || AGENT_LIST[0];
  const isActive = currentAgent !== 'auto';

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors
          hover:bg-black/[0.06] dark:hover:bg-white/[0.08]
          ${isActive ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'text-muted-foreground'}`}
      >
        <AtSign className="w-3.5 h-3.5 shrink-0" />
        <span>{current.name}</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-80 bg-popover border border-border rounded-xl shadow-lg overflow-hidden z-50">
          <div className="px-3 py-2 border-b border-border">
            <span className="text-xs font-medium text-muted-foreground">选择智能体</span>
          </div>
          <div className="p-1">
            {AGENT_LIST.map((agent) => {
              const AgentIcon = agent.icon;
              const selected = agent.id === currentAgent;
              return (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => {
                    onSelect(agent.id);
                    setOpen(false);
                  }}
                  className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left transition-colors
                    ${selected
                      ? 'bg-primary/10'
                      : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'
                    }`}
                >
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5
                      ${selected ? 'bg-primary/20' : 'bg-muted'}`}
                  >
                    <AgentIcon className={`w-4 h-4 ${selected ? 'text-primary' : 'text-muted-foreground'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-medium ${selected ? 'text-primary' : 'text-foreground'}`}>
                      {agent.name}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 leading-tight">
                      {agent.desc}
                    </div>
                    {agent.triggers && (
                      <div className="text-[10px] text-muted-foreground/50 mt-1">
                        触发词: {agent.triggers}
                      </div>
                    )}
                  </div>
                  {selected && (
                    <div className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────

export function ComposerInput({
  onSend,
  onStop,
  isLoading,
  disabled,
  chatMode = 'chat',
  onChatModeChange,
}: ComposerInputProps) {
  const { state, actions } = useApp();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState('');
  const [currentAgent, setCurrentAgent] = useState('auto');
  const [isFocused, setIsFocused] = useState(false);
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(true);
  const composingRef = useRef(false);

  // @-mention state (coder mode only)
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [allProjectFiles, setAllProjectFiles] = useState<FileInfo[]>([]);
  const [mentionIndex, setMentionIndex] = useState(0);
  const mentionRef = useRef<HTMLDivElement>(null);

  // Fetch real skills from backend
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setSkillsLoading(true);
      try {
        const data = await listSkills();
        if (!cancelled) setSkills(data);
      } catch {
        // skills endpoint may fail, show empty
      } finally {
        if (!cancelled) setSkillsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const lineHeight = parseFloat(getComputedStyle(ta).lineHeight || '20');
    const maxHeight = lineHeight * MAX_ROWS;
    ta.style.height = Math.min(Math.max(ta.scrollHeight, MIN_HEIGHT), maxHeight) + 'px';
    ta.style.overflowY = ta.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [value]);

  // Focus listener
  useEffect(() => {
    const handler = () => textareaRef.current?.focus();
    window.addEventListener('miniclaw:focus-composer', handler);
    return () => window.removeEventListener('miniclaw:focus-composer', handler);
  }, []);

  // Selection-action listener: prefill from text selection toolbar
  useEffect(() => {
    const handler = (e: Event) => {
      const { text, action } = (e as CustomEvent).detail;
      const prefix = action === 'quiz'
        ? '请根据以下内容生成测验：\n\n> '
        : '请解释以下概念：\n\n> ';
      const quoted = text.split('\n').join('\n> ');
      setValue(prefix + quoted);
      // Focus and move cursor to end
      requestAnimationFrame(() => {
        const ta = textareaRef.current;
        if (ta) {
          ta.focus();
          ta.setSelectionRange(ta.value.length, ta.value.length);
        }
      });
    };
    window.addEventListener('miniclaw:selection-action', handler);
    return () => window.removeEventListener('miniclaw:selection-action', handler);
  }, []);

  // Load all project files recursively
  const loadProjectFiles = useCallback(async (basePath: string) => {
    const allFiles: FileInfo[] = [];
    const queue = [basePath];
    while (queue.length > 0) {
      const dir = queue.shift()!;
      try {
        const res = await listFiles(dir);
        for (const f of res.files) {
          if (f.name === '.gitkeep') continue;
          const relPath = f.path.replace(basePath + '/', '');
          allFiles.push({ ...f, name: relPath });
          if (f.type === 'directory') queue.push(f.path);
        }
      } catch { /* skip */ }
    }
    return allFiles;
  }, []);

  // Open @-mention via button click
  const openMention = useCallback(async () => {
    if (!state.coderProjectPath) return;
    if (allProjectFiles.length === 0) {
      const files = await loadProjectFiles(state.coderProjectPath);
      setAllProjectFiles(files);
    }
    setMentionQuery('');
    setMentionIndex(0);
    setMentionOpen(true);
  }, [state.coderProjectPath, allProjectFiles.length, loadProjectFiles]);

  // Filtered mention list
  const filteredMentions = useMemo(() => {
    if (!mentionOpen) return [];
    const q = mentionQuery.toLowerCase();
    const items = allProjectFiles.filter(f => f.name.toLowerCase().includes(q));
    return items.slice(0, 10);
  }, [mentionOpen, mentionQuery, allProjectFiles]);

  // Close mention dropdown on outside click
  useEffect(() => {
    if (!mentionOpen) return;
    const handler = (e: MouseEvent) => {
      if (mentionRef.current && !mentionRef.current.contains(e.target as Node)) {
        setMentionOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [mentionOpen]);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || isLoading || disabled) return;
    onSend(trimmed);
    setValue('');
    setMentionOpen(false);
    setAllProjectFiles([]);
  };

  // Insert @file reference at cursor position
  const selectMention = useCallback((file: FileInfo) => {
    const ta = textareaRef.current;
    const ref = '@' + file.name + ' ';
    if (!ta) {
      setValue(v => v + ref);
    } else {
      const pos = ta.selectionStart;
      const before = value.slice(0, pos);
      const after = value.slice(pos);
      setValue(before + ref + after);
      setTimeout(() => {
        const newPos = pos + ref.length;
        ta.focus();
        ta.setSelectionRange(newPos, newPos);
      }, 0);
    }
    setMentionOpen(false);
  }, [value]);

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !composingRef.current) {
      e.preventDefault();
      submit();
    }
  };

  const currentAgentData = AGENT_LIST.find((a) => a.id === currentAgent) || AGENT_LIST[0];
  const placeholder =
    chatMode === 'coder'
      ? '描述你的需求，点击 @ 引用项目文件...'
      : currentAgent === 'auto'
        ? '今天我能帮您什么？'
        : `让 ${currentAgentData.name} 帮您做点什么？`;

  const canSend = value.trim().length > 0 && !isLoading && !disabled;

  // Show top 3 skill names as tags
  const skillTags = skills.slice(0, 3).map(skillDisplayName);

  return (
    <div
      className={`rounded-2xl border transition-all duration-200 ${
        isFocused
          ? 'border-gray-300 shadow-[0_0_0_3px_rgba(0,0,0,0.04)] dark:border-gray-600 dark:shadow-[0_0_0_3px_rgba(255,255,255,0.06)]'
          : 'border-gray-200 dark:border-gray-700'
      } bg-background`}
    >
      {/* @-mention dropdown */}
      {mentionOpen && (
        <div
          ref={mentionRef}
          className="mx-2 mb-1 max-h-64 overflow-hidden bg-popover border border-border rounded-xl shadow-lg flex flex-col"
        >
          <div className="px-3 py-2 border-b border-border">
            <input
              autoFocus
              type="text"
              value={mentionQuery}
              onChange={e => { setMentionQuery(e.target.value); setMentionIndex(0); }}
              placeholder="搜索文件..."
              className="w-full bg-transparent outline-none text-sm placeholder:text-muted-foreground/50"
            />
          </div>
          <div className="overflow-y-auto max-h-52">
            {filteredMentions.length === 0 ? (
              <div className="px-3 py-4 text-xs text-muted-foreground text-center">无匹配文件</div>
            ) : (
              filteredMentions.map((file, i) => (
                <button
                  key={file.path}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); selectMention(file); }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${
                    i === mentionIndex ? 'bg-accent' : 'hover:bg-accent/50'
                  }`}
                >
                  {file.type === 'directory' ? (
                    <FolderOpen className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  ) : (
                    <FileCode className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  )}
                  <span className="text-sm text-foreground truncate">{file.name}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Textarea */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKey}
        onCompositionStart={() => { composingRef.current = true; }}
        onCompositionEnd={() => { composingRef.current = false; }}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        className="w-full resize-none px-4 pt-4 pb-2 bg-transparent outline-none border-none text-sm leading-relaxed placeholder:text-muted-foreground/50 disabled:opacity-60"
        style={{ minHeight: MIN_HEIGHT }}
      />

      {/* Divider */}
      <div className="mx-3 border-t border-gray-100 dark:border-gray-800" />

      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-border bg-muted rounded-b-2xl">
        {/* Left: smart routing label */}
        <div className="flex items-center gap-1.5 text-muted-foreground pl-1">
          <Zap className="w-3 h-3" />
          <span className="text-xs">智能路由开启</span>
        </div>

        {/* Right: @ mention + send / stop */}
        <div className="flex items-center gap-1">
          {chatMode === 'coder' && state.coderProjectPath && (
            <button
              type="button"
              onClick={openMention}
              className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors
                hover:bg-black/[0.06] dark:hover:bg-white/[0.08]
                ${mentionOpen ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'text-muted-foreground'}`}
              title="引用项目文件"
            >
              <AtSign className="w-3.5 h-3.5" />
            </button>
          )}
          {/* Send / Stop button */}
          {isLoading ? (
            <button
              type="button"
              onClick={onStop}
              className="w-8 h-8 rounded-md bg-foreground text-background flex items-center justify-center hover:opacity-80 transition-opacity"
              aria-label="停止生成"
            >
              <Square className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={!canSend}
              aria-label="发送"
              className={`w-8 h-8 rounded-md flex items-center justify-center transition-all ${
                canSend
                  ? 'bg-primary text-primary-foreground hover:opacity-90 cursor-pointer'
                  : 'bg-muted text-muted-foreground opacity-50 cursor-not-allowed'
              }`}
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
