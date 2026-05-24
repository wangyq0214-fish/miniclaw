'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  ArrowLeft,
  Loader2,
  Sparkles,
  Trash2,
  ChevronRight,
  X,
  BookOpen,
  FileCode,
  Network,
  List,
  Code,
  FolderOpen,
  Library,
  FolderPlus,
  Layers,
  CheckCircle2,
  XCircle,
  FileText,
  Presentation,
} from 'lucide-react';
import { listFiles, deleteFile, writeFile, type FileInfo } from '@/lib/api';
import { useApp, type GeneratingTask } from '@/lib/store';
import { getUserItem } from '@/lib/userStorage';

// ── Agent routers (must match backend role filenames in workspace/roles/) ──
const agentRouters: Record<string, string> = {
  '测验': 'exercise_composer',
  '讲义': 'lecture_writer',
  '代码案例': 'code_case_builder',
  '思维导图': 'mindmap_designer',
  '阅读清单': 'reading_curator',
  '动画脚本': 'media_script_writer',
  '抽认卡': 'flashcard_composer',
  'PPT': 'ppt_generator',
};

// ── Resource categories ──
interface ResourceCategory {
  key: string;
  icon: typeof BookOpen;
  label: string;
  color: string;
  bgColor: string;
  description: string;
  generateLabel: string;
}

const RESOURCE_CATEGORIES: ResourceCategory[] = [
  { key: 'exercises', icon: FileCode, label: '练习题', color: 'text-purple-600 dark:text-purple-400', bgColor: 'bg-purple-50 dark:bg-purple-500/10', description: '根据学习进度生成的针对性练习', generateLabel: '测验' },
  { key: 'flashcards', icon: Layers, label: '抽认卡', color: 'text-cyan-600 dark:text-cyan-400', bgColor: 'bg-cyan-50 dark:bg-cyan-500/10', description: '间隔重复记忆卡片，高效巩固知识点', generateLabel: '抽认卡' },
  { key: 'lectures', icon: BookOpen, label: '讲义', color: 'text-blue-600 dark:text-blue-400', bgColor: 'bg-blue-50 dark:bg-blue-500/10', description: '深度讲解文档，涵盖核心概念与原理', generateLabel: '讲义' },
  { key: 'mindmaps', icon: Network, label: '思维导图', color: 'text-emerald-600 dark:text-emerald-400', bgColor: 'bg-emerald-50 dark:bg-emerald-500/10', description: '可视化知识结构，梳理概念关系', generateLabel: '思维导图' },
  { key: 'reading-lists', icon: List, label: '阅读清单', color: 'text-amber-600 dark:text-amber-400', bgColor: 'bg-amber-50 dark:bg-amber-500/10', description: '精选阅读材料与推荐书单', generateLabel: '阅读清单' },
  { key: 'code-cases', icon: Code, label: '代码案例', color: 'text-violet-600 dark:text-violet-400', bgColor: 'bg-violet-50 dark:bg-violet-500/10', description: '可运行的分级代码示例', generateLabel: '代码案例' },
  { key: 'media-scripts', icon: FileCode, label: '动画脚本', color: 'text-pink-600 dark:text-pink-400', bgColor: 'bg-pink-50 dark:bg-pink-500/10', description: '场景分镜动画脚本，含视觉元素与旁白', generateLabel: '动画脚本' },
  { key: 'presentations', icon: Presentation, label: 'PPT', color: 'text-orange-600 dark:text-orange-400', bgColor: 'bg-orange-50 dark:bg-orange-500/10', description: 'AI 生成的专业演示文稿', generateLabel: 'PPT' },
];

// ── Roots ──
const ROOTS = [
  { path: 'knowledge/source', label: '共享资源', icon: Library, color: 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400' },
  { path: 'workspace', label: '我的工作区', icon: FolderOpen, color: 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400' },
] as const;

// ── Types ──
interface ResourceItem {
  id: string;
  category: string;
  title: string;
  status: 'generating' | 'completed';
  metadata: string;
}

interface GenerateModal {
  isOpen: boolean;
  resourceType: string | null;
}

// ── Helpers ──
function getCategoryFromDir(dirName: string): ResourceCategory | null {
  const lower = dirName.toLowerCase();
  return RESOURCE_CATEGORIES.find(c => c.key === lower) || null;
}

function getCategoryKeyFromPath(path: string): string | null {
  const parts = path.split('/');
  const last = parts[parts.length - 1];
  return RESOURCE_CATEGORIES.find(c => c.key === last)?.key || null;
}

function getPlaceholder(categoryLabel: string): string {
  const placeholders: Record<string, string> = {
    '练习题': '例如：反向传播、梯度下降...',
    '抽认卡': '例如：神经网络基础、激活函数...',
    '讲义': '例如：卷积神经网络、循环神经网络...',
    '思维导图': '例如：深度学习、机器学习算法...',
    '阅读清单': '例如：强化学习、自然语言处理...',
    '代码案例': '例如：冒泡排序、二分查找、链表反转...',
    '动画脚本': '例如：神经网络前向传播过程...',
    'PPT': '例如：深度学习基础、机器学习概论...',
  };
  return placeholders[categoryLabel] || '请输入主题...';
}

function getDisplayName(fileName: string): string {
  const nameWithoutExt = fileName.replace(/\.(md|json|txt|pdf|html|docx?|pptx?)$/i, '');
  return nameWithoutExt
    .replace(/^\d{4}-\d{2}-\d{2}-/, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]/g, ' ')
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function extractDateFromName(name: string): Date | null {
  const match = name.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
}

function relativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return '今天';
  if (diffDays === 1) return '昨天';
  if (diffDays < 7) return `${diffDays} 天前`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} 周前`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} 个月前`;
  return `${Math.floor(diffDays / 365)} 年前`;
}

function buildMetaText(file: FileInfo, showAiLabel = true): string {
  const parts: string[] = [];
  if (showAiLabel) parts.push('AI 生成');
  const date = extractDateFromName(file.name);
  if (date) parts.push(relativeTime(date));
  return parts.join(' · ');
}

// ── Category Card ──
function CategoryCard({
  category,
  onNavigate,
  onGenerate,
}: {
  category: ResourceCategory;
  onNavigate: () => void;
  onGenerate: () => void;
}) {
  return (
    <div
      className="group flex items-center justify-between p-4 rounded-2xl bg-white dark:bg-card border border-border hover:border-primary/20 hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer"
      onClick={e => {
        // Only navigate if click target is NOT inside the button
        if (!(e.target as HTMLElement).closest('button')) {
          onNavigate();
        }
      }}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className={`w-10 h-10 rounded-xl ${category.bgColor} flex items-center justify-center shrink-0`}>
          <category.icon className={`w-5 h-5 ${category.color}`} />
        </div>
        <div className="min-w-0">
          <span className="text-sm font-semibold text-foreground block">{category.label}</span>
          <span className="text-xs text-muted-foreground line-clamp-1">{category.description}</span>
        </div>
      </div>
      <button
        onClick={e => { e.stopPropagation(); onGenerate(); }}
        className="w-8 h-8 rounded-full bg-secondary hover:bg-primary/10 flex items-center justify-center text-muted-foreground hover:text-primary transition-colors shrink-0 ml-2"
        title={`自定义生成${category.label}`}
      >
        <Sparkles className="w-4 h-4" />
      </button>
    </div>
  );
}

// ── Capsule Selector ──
function CapsuleSelector({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-foreground mb-2">{label}</label>
      <div className="flex flex-wrap gap-2">
        {options.map(opt => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              value === opt
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-secondary-foreground hover:bg-accent'
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Generate Modal ──
function GenerateModal({
  resourceType,
  onClose,
  onGenerate,
}: {
  resourceType: string;
  onClose: () => void;
  onGenerate: (formData: Record<string, string>) => void;
}) {
  const category = RESOURCE_CATEGORIES.find(c => c.generateLabel === resourceType);
  const [formData, setFormData] = useState<Record<string, string>>({});

  const update = (key: string, val: string) => setFormData(prev => ({ ...prev, [key]: val }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-5 border-b border-border">
          <div className="flex items-center gap-3">
            {category && (
              <div className={`w-9 h-9 rounded-xl ${category.bgColor} flex items-center justify-center`}>
                <category.icon className={`w-5 h-5 ${category.color}`} />
              </div>
            )}
            <div>
              <h2 className="text-lg font-semibold text-foreground">自定义生成</h2>
              <p className="text-xs text-muted-foreground">{resourceType}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-8 py-6 space-y-6">
          {resourceType === '测验' && (
            <>
              <CapsuleSelector
                label="题目数量"
                options={['5 道', '8 道', '10 道', '15 道']}
                value={formData.count || '5 道'}
                onChange={v => update('count', v)}
              />
              <CapsuleSelector
                label="难度"
                options={['基础', '中等', '进阶', '混合']}
                value={formData.difficulty || '混合'}
                onChange={v => update('difficulty', v)}
              />
            </>
          )}

          {resourceType === '思维导图' && (
            <CapsuleSelector
              label="展开层级"
              options={['2 层', '3 层', '4 层']}
              value={formData.depth || '3 层'}
              onChange={v => update('depth', v)}
            />
          )}

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">额外要求（可选）</label>
            <textarea
              value={formData.prompt || ''}
              onChange={e => update('prompt', e.target.value)}
              placeholder="例如：重点考察反向传播的数学推导..."
              className="w-full h-32 px-4 py-3 rounded-xl border border-input bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-shadow"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-5 border-t border-border bg-secondary/50">
          <button
            onClick={() => onGenerate(formData)}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-base font-semibold hover:opacity-90 active:scale-[0.98] transition-all"
          >
            开始生成
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Generating list item ──
function GeneratingListItem({ title, metadata }: { title: string; metadata: string }) {
  return (
    <div className="flex items-center gap-3 py-3 px-3 rounded-xl bg-primary/5 border border-primary/10">
      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <Loader2 className="w-4 h-4 text-primary animate-spin" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-primary truncate">{title}</p>
        <p className="text-xs text-primary/60 mt-0.5">{metadata}</p>
      </div>
    </div>
  );
}

// ── Recursive File Tree Item ──
function FileTreeItem({
  file, depth, activePath, onSelect,
}: {
  file: FileInfo;
  depth: number;
  activePath: string | null;
  onSelect: (path: string) => void;
}) {
  const isDir = file.type === 'directory';
  const isActive = activePath === file.path;
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<FileInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const handleToggle = useCallback(async () => {
    if (!isDir) return;
    if (!expanded) {
      setExpanded(true);
      if (children.length === 0) {
        setLoading(true);
        try {
          const res = await listFiles(file.path);
          setChildren(res.files.filter(f => f.name !== '.gitkeep'));
        } catch {
          setChildren([]);
        }
        setLoading(false);
      }
    } else {
      setExpanded(false);
    }
  }, [isDir, expanded, children.length, file.path]);

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => isDir ? handleToggle() : onSelect(file.path)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); isDir ? handleToggle() : onSelect(file.path); } }}
        className={`flex items-center gap-2 py-1.5 px-2 rounded-lg cursor-pointer transition-colors ${
          isActive ? 'bg-primary/10' : 'hover:bg-secondary'
        }`}
        style={{ paddingLeft: 8 + depth * 16 }}
      >
        {isDir ? (
          <ChevronRight className={`w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        {isDir ? (
          <FolderOpen className="w-4 h-4 text-amber-500 shrink-0" />
        ) : (
          <FileCode className="w-4 h-4 text-primary/60 shrink-0" />
        )}
        <span className={`text-sm truncate ${isActive ? 'text-primary font-medium' : 'text-foreground'}`}>
          {file.name}
        </span>
        {loading && <Loader2 className="w-3 h-3 text-muted-foreground animate-spin shrink-0" />}
      </div>
      {isDir && expanded && children.map(child => (
        <FileTreeItem
          key={child.path}
          file={child}
          depth={depth + 1}
          activePath={activePath}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}

// ── Main Component ──
interface WorkspaceBrowserProps {
  activePath: string | null;
  onSelect: (path: string) => void;
}

export function WorkspaceBrowser({ activePath, onSelect }: WorkspaceBrowserProps) {
  const { state, actions } = useApp();
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [resources, setResources] = useState<ResourceItem[]>([]);
  const [generateModal, setGenerateModal] = useState<GenerateModal>({ isOpen: false, resourceType: null });

  // Load files from API
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      if (currentPath === null) {
        setFiles([]);
      } else {
        try {
          const targetPath = currentPath === 'workspace' ? 'workspace/generated' : currentPath;
          const res = await listFiles(targetPath);
          setFiles(res.files);
        } catch {
          setFiles([]);
        }
      }
      setLoading(false);
    };
    load();
  }, [currentPath, state.filesVersion]);

  // Derive view state
  const categories = useMemo(() => files.filter(f => f.type === 'directory'), [files]);
  const fileItems = useMemo(() => files.filter(f => f.type === 'file'), [files]);
  const activeCategoryKey = currentPath ? getCategoryKeyFromPath(currentPath) : null;

  // Get generating tasks for current category
  const currentGeneratingTasks = useMemo(() => {
    return state.generatingTasks.filter(t =>
      t.category === activeCategoryKey && t.status === 'generating'
    );
  }, [state.generatingTasks, activeCategoryKey]);

  // Merge real files + optimistic resources
  const displayItems = useMemo(() => {
    if (!activeCategoryKey) {
      // Non-category paths (e.g. knowledge/source) — use raw fileItems
      return fileItems.map<ResourceItem>(f => ({
        id: f.path,
        category: '',
        title: getDisplayName(f.name),
        status: 'completed',
        metadata: buildMetaText(f, false),
      }));
    }
    const optimistic = resources.filter(r => r.category === activeCategoryKey);
    const real: ResourceItem[] = fileItems.map(f => ({
      id: f.path,
      category: activeCategoryKey,
      title: getDisplayName(f.name),
      status: 'completed' as const,
      metadata: buildMetaText(f),
    }));
    return [...optimistic, ...real];
  }, [activeCategoryKey, resources, fileItems]);

  // Navigation
  const handleBack = useCallback(() => {
    if (!currentPath) return;
    const isAtRoot = ROOTS.some(r => r.path === currentPath);
    if (isAtRoot) {
      setCurrentPath(null);
    } else {
      const parts = currentPath.split('/');
      parts.pop();
      const newPath = parts.join('/');
      // Skip 'workspace' level and go directly to root (avoid redirect loop)
      if (newPath === 'workspace') {
        setCurrentPath(null);
      } else {
        setCurrentPath(newPath);
      }
    }
  }, [currentPath]);

  // Delete
  const handleDelete = useCallback(async (e: React.MouseEvent, filePath: string, fileName: string) => {
    e.stopPropagation();
    const displayName = getDisplayName(fileName);
    if (!confirm(`确定删除「${displayName}」？此操作不可撤销。`)) return;
    try {
      await deleteFile(filePath);
      setFiles(prev => prev.filter(f => f.path !== filePath));
    } catch (err) {
      alert('删除失败: ' + (err instanceof Error ? err.message : '未知错误'));
    }
  }, []);

  // Check if current path is a resource category
  const isResourceCategory = !!activeCategoryKey
    || currentPath === 'workspace/generated'
    || (currentPath?.startsWith('workspace/generated/') ?? false);
  const isInsideProject = !!currentPath
    && currentPath.startsWith('workspace/generated/code-cases/')
    && currentPath !== 'workspace/generated/code-cases';

  // Get current category info for generate dialog
  const currentCategory = activeCategoryKey
    ? RESOURCE_CATEGORIES.find(c => c.key === activeCategoryKey)
    : null;
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const newMenuRef = useRef<HTMLDivElement>(null);
  const [generatePrompt, setGeneratePrompt] = useState('');
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);

  // Sync coderProjectPath with navigation
  const setProjectPathRef = useRef(actions.setCoderProjectPath);
  setProjectPathRef.current = actions.setCoderProjectPath;
  useEffect(() => {
    setProjectPathRef.current(isInsideProject ? currentPath! : '');
  }, [isInsideProject, currentPath]);

  // Close popover on outside click
  useEffect(() => {
    if (!newMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (newMenuRef.current && !newMenuRef.current.contains(e.target as Node)) {
        setNewMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [newMenuOpen]);

  const basePath = currentPath || 'workspace/generated/code-cases';

  const handleNewFolder = useCallback(async () => {
    setNewMenuOpen(false);
    const name = prompt('请输入文件夹名称：');
    if (!name?.trim()) return;
    try {
      await writeFile(`${basePath}/${name.trim()}/.gitkeep`, '');
      actions.incrementFilesVersion();
    } catch (err) {
      alert('创建失败: ' + (err instanceof Error ? err.message : '未知错误'));
    }
  }, [actions, basePath]);

  const handleNewFile = useCallback(async () => {
    setNewMenuOpen(false);
    const name = prompt('请输入文件名（含扩展名，如 main.py）：');
    if (!name?.trim()) return;
    try {
      await writeFile(`${basePath}/${name.trim()}`, '');
      actions.incrementFilesVersion();
    } catch (err) {
      alert('创建失败: ' + (err instanceof Error ? err.message : '未知错误'));
    }
  }, [actions, basePath]);

  // Generate resource via agent
  const handleGenerateResource = useCallback(async () => {
    if (!generatePrompt.trim()) return;
    setShowGenerateDialog(false);

    const prompt = generatePrompt.trim();
    setGeneratePrompt('');

    const category = currentCategory;
    if (!category) return;

    // Determine agent and message based on category
    const agent = agentRouters[category.generateLabel] || '@CodeNinja';
    const categoryPath = `workspace/generated/${category.key}`;
    const messages: Record<string, string> = {
      '测验': `请生成练习题，主题：${prompt}。输出 JSON 文件到 ${categoryPath}/ 目录。`,
      '抽认卡': `请生成抽认卡，主题：${prompt}。输出 JSON 文件到 ${categoryPath}/ 目录。`,
      '讲义': `请生成讲义，主题：${prompt}。输出 Markdown 文件到 ${categoryPath}/ 目录。`,
      '思维导图': `请生成思维导图，主题：${prompt}。输出 JSON 文件到 ${categoryPath}/ 目录。`,
      '阅读清单': `请生成阅读清单，主题：${prompt}。输出 Markdown 文件到 ${categoryPath}/ 目录。`,
      '代码案例': `请生成编程挑战题，主题：${prompt}。输出 JSON 文件到 ${categoryPath}/ 目录。`,
      '动画脚本': `请生成动画脚本，主题：${prompt}。输出 Markdown 文件到 ${categoryPath}/ 目录。`,
      'PPT': `请生成PPT演示文稿，主题：${prompt}。用 python-pptx 生成脚本并执行，输出 PPTX 文件到 ${categoryPath}/ 目录。`,
    };
    const message = messages[category.generateLabel] || `请生成${category.label}，主题：${prompt}。输出到 ${categoryPath}/ 目录。`;

    // Add to global generating tasks
    const taskId = `task-${Date.now()}`;
    actions.addGeneratingTask({
      id: taskId,
      category: category.key,
      categoryLabel: category.label,
      prompt,
      status: 'generating',
      startedAt: Date.now(),
    });

    try {
      console.log('[Generate] Starting generation:', { agent, message });
      const { streamSubagent } = await import('@/lib/api');

      let eventCount = 0;
      for await (const event of streamSubagent({ subagent: agent, message })) {
        eventCount++;
        console.log('[Generate] Event:', event.type, event);
        if (event.type === 'done') break;
      }
      console.log('[Generate] Completed with', eventCount, 'events');

      // Mark as completed and refresh
      actions.updateGeneratingTask(taskId, { status: 'completed' });
      actions.incrementFilesVersion();

      // Remove task after 10 seconds so user can see completion
      setTimeout(() => {
        actions.removeGeneratingTask(taskId);
      }, 10000);
    } catch (err) {
      console.error('[Generate] Error:', err);
      actions.updateGeneratingTask(taskId, {
        status: 'error',
        error: err instanceof Error ? err.message : '未知错误',
      });
    }
  }, [generatePrompt, actions, currentCategory]);

  // Open generate modal
  const handleOpenGenerate = useCallback((generateLabel: string) => {
    setGenerateModal({ isOpen: true, resourceType: generateLabel });
  }, []);

  // Submit generation (optimistic UI)
  const handleGenerate = useCallback((formData: Record<string, string>) => {
    const resourceType = generateModal.resourceType!;
    const category = RESOURCE_CATEGORIES.find(c => c.generateLabel === resourceType);
    if (!category) return;

    // Close modal
    setGenerateModal({ isOpen: false, resourceType: null });

    // Log dispatch
    console.log(`[Router Dispatch] 唤醒: ${agentRouters[resourceType] || resourceType} | Payload:`, formData);

    // Optimistic insert
    const tempId = `temp-${Date.now()}`;
    const placeholder: ResourceItem = {
      id: tempId,
      category: category.key,
      title: `正在生成${resourceType}...`,
      status: 'generating',
      metadata: 'AI 正在努力撰写中...',
    };
    setResources(prev => [placeholder, ...prev]);

    // Jump to category
    if (category.key === 'generated') {
      setCurrentPath('workspace/generated');
    } else {
      setCurrentPath(`workspace/generated/${category.key}`);
    }

    // Simulate completion
    setTimeout(() => {
      setResources(prev => prev.map(r =>
        r.id === tempId
          ? { ...r, status: 'completed' as const, title: `${resourceType}已生成`, metadata: '刚刚生成' }
          : r
      ));
    }, 3000);
  }, [generateModal.resourceType]);

  // Header info
  const title = currentPath === null
    ? 'AI 知识空间'
    : ROOTS.find(r => r.path === currentPath)?.label
      || (activeCategoryKey ? RESOURCE_CATEGORIES.find(c => c.key === activeCategoryKey)?.label : null)
      || getDisplayName(currentPath.split('/').pop() || '');

  const description = currentPath === null
    ? '智能体根据你的学习进度自动生成的专属资源'
    : RESOURCE_CATEGORIES.find(c => c.key === activeCategoryKey)?.description
      || '由智能体自动生成的学习资源';

  // ── Loading ──
  if (loading) {
    return (
      <div className="p-4 flex items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-xs">加载中…</span>
        </div>
      </div>
    );
  }

  // ── Workspace root redirect ──
  if (currentPath === 'workspace') {
    setCurrentPath('workspace/generated');
    return null;
  }

  // ── Build view content (no early returns, so modal is always rendered) ──
  let viewContent: React.ReactNode;

  if (currentPath === null) {
    // Root view
    viewContent = (
      <>
        <div className="px-5 pt-5 pb-3">
          <h1 className="text-2xl font-bold text-foreground">{title}</h1>
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        </div>
        {(state.isGeneratingQuiz || state.generatingTasks.length > 0) && (
          <GeneratingBanner tasks={state.generatingTasks.filter(t => t.status !== 'completed' || Date.now() - t.startedAt < 10000)} />
        )}
        <div className="flex-1 overflow-y-auto px-5 pb-6">
          <div className="grid grid-cols-2 gap-3">
            {ROOTS.map(root => (
              <button
                key={root.path}
                onClick={() => setCurrentPath(root.path)}
                className="group flex flex-col items-start p-4 rounded-2xl bg-white dark:bg-card border border-border hover:border-primary/20 hover:shadow-md hover:-translate-y-0.5 transition-all text-left"
              >
                <div className={`w-10 h-10 rounded-xl ${root.color} flex items-center justify-center mb-3`}>
                  <root.icon className="w-5 h-5" />
                </div>
                <span className="text-sm font-semibold text-foreground">{root.label}</span>
              </button>
            ))}
          </div>
        </div>
      </>
    );
  } else if (currentPath === 'workspace/generated' && categories.length > 0) {
    // Category grid
    viewContent = (
      <>
        <div className="px-5 pt-4 pb-2">
          <div className="flex items-center gap-3 mb-3">
            <button onClick={handleBack} className="w-8 h-8 rounded-lg hover:bg-secondary flex items-center justify-center transition-colors">
              <ArrowLeft className="w-4 h-4 text-muted-foreground" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-foreground">{title}</h1>
              <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
            </div>
          </div>
        </div>
        {(state.isGeneratingQuiz || state.generatingTasks.length > 0) && (
          <GeneratingBanner tasks={state.generatingTasks.filter(t => t.status !== 'completed' || Date.now() - t.startedAt < 10000)} />
        )}
        <div className="flex-1 overflow-y-auto px-5 pb-6">
          <div className="flex flex-col gap-2.5">
            {RESOURCE_CATEGORIES.map(cat => (
              <CategoryCard
                key={cat.key}
                category={cat}
                onNavigate={() => setCurrentPath(`workspace/generated/${cat.key}`)}
                onGenerate={() => handleOpenGenerate(cat.generateLabel)}
              />
            ))}
          </div>
        </div>
      </>
    );
  } else if (categories.length > 0 && fileItems.length === 0) {
    // Sub-category with directories
    viewContent = (
      <>
        <div className="px-5 pt-4 pb-2">
          <div className="flex items-center gap-3 mb-3">
            <button onClick={handleBack} className="w-8 h-8 rounded-lg hover:bg-secondary flex items-center justify-center transition-colors">
              <ArrowLeft className="w-4 h-4 text-muted-foreground" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-foreground">{title}</h1>
              <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-6">
          <div className="flex flex-col gap-2">
            {isResourceCategory && (
              <div className="relative" ref={newMenuRef}>
                <button
                  onClick={() => setNewMenuOpen(!newMenuOpen)}
                  className="flex items-center gap-3 py-3 px-3 rounded-xl border-2 border-dashed border-primary/20 hover:border-primary/40 hover:bg-primary/5 transition-all text-left w-full"
                >
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <FolderPlus className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <span className="text-sm font-medium text-primary">新建</span>
                    <span className="text-xs text-primary/60 block">创建文件或文件夹</span>
                  </div>
                </button>
                {newMenuOpen && (
                  <div className="absolute left-0 top-full mt-1 z-50 w-44 bg-popover border border-border rounded-xl shadow-lg overflow-hidden">
                    <button
                      onClick={handleNewFolder}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-foreground hover:bg-accent transition-colors text-left"
                    >
                      <FolderPlus className="w-4 h-4 text-muted-foreground" />
                      新建文件夹
                    </button>
                    <button
                      onClick={handleNewFile}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-foreground hover:bg-accent transition-colors text-left"
                    >
                      <FileCode className="w-4 h-4 text-muted-foreground" />
                      新建文件
                    </button>
                  </div>
                )}
              </div>
            )}
            {categories.map(dir => (
              <button
                key={dir.path}
                onClick={() => setCurrentPath(dir.path)}
                className="flex items-center gap-3 py-3 px-3 rounded-xl hover:bg-secondary transition-colors text-left"
              >
                <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                  <FolderOpen className="w-4 h-4 text-muted-foreground" />
                </div>
                <span className="text-sm font-medium text-foreground">{getDisplayName(dir.name)}</span>
              </button>
            ))}
          </div>
        </div>
      </>
    );
  } else if (isInsideProject) {
    // Project file tree view
    viewContent = (
      <>
        <div className="px-5 pt-4 pb-2">
          <div className="flex items-center gap-3 mb-3">
            <button onClick={handleBack} className="w-8 h-8 rounded-lg hover:bg-secondary flex items-center justify-center transition-colors">
              <ArrowLeft className="w-4 h-4 text-muted-foreground" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-foreground">{title}</h1>
              <p className="text-xs text-muted-foreground mt-0.5">项目文件</p>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-6">
          {/* New button */}
          <div className="relative mb-2" ref={newMenuRef}>
            <button
              onClick={() => setNewMenuOpen(!newMenuOpen)}
              className="w-full flex items-center gap-3 py-2.5 px-3 rounded-xl border-2 border-dashed border-primary/20 hover:border-primary/40 hover:bg-primary/5 transition-all text-left"
            >
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <FolderPlus className="w-3.5 h-3.5 text-primary" />
              </div>
              <span className="text-sm font-medium text-primary">新建</span>
            </button>
            {newMenuOpen && (
              <div className="absolute left-0 top-full mt-1 z-50 w-44 bg-popover border border-border rounded-xl shadow-lg overflow-hidden">
                <button
                  onClick={handleNewFolder}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-foreground hover:bg-accent transition-colors text-left"
                >
                  <FolderPlus className="w-4 h-4 text-muted-foreground" />
                  新建文件夹
                </button>
                <button
                  onClick={handleNewFile}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-foreground hover:bg-accent transition-colors text-left"
                >
                  <FileCode className="w-4 h-4 text-muted-foreground" />
                  新建文件
                </button>
              </div>
            )}
          </div>
          {/* File tree */}
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-4">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-xs">加载中…</span>
            </div>
          ) : files.length > 0 ? (
            <div className="flex flex-col">
              {files.filter(f => f.name !== '.gitkeep').map(file => (
                <FileTreeItem
                  key={file.path}
                  file={file}
                  depth={0}
                  activePath={activePath}
                  onSelect={onSelect}
                />
              ))}
            </div>
          ) : (
            <div className="text-center text-muted-foreground text-xs py-12">项目为空</div>
          )}
        </div>
      </>
    );
  } else {
    // File list view
    viewContent = (
      <>
        <div className="px-5 pt-4 pb-2">
          <div className="flex items-center gap-3 mb-3">
            <button onClick={handleBack} className="w-8 h-8 rounded-lg hover:bg-secondary flex items-center justify-center transition-colors">
              <ArrowLeft className="w-4 h-4 text-muted-foreground" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-foreground">{title}</h1>
              <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
            </div>
          </div>
        </div>
        {(state.isGeneratingQuiz || state.generatingTasks.length > 0) && (
          <GeneratingBanner tasks={state.generatingTasks.filter(t => t.status !== 'completed' || Date.now() - t.startedAt < 10000)} />
        )}
        <div className="flex-1 overflow-y-auto px-5 pb-6">
          {isResourceCategory && (
            <button
              onClick={() => setShowGenerateDialog(true)}
              className="w-full flex items-center gap-3 py-3 px-3 rounded-xl border-2 border-dashed border-primary/20 hover:border-primary/40 hover:bg-primary/5 transition-all text-left mb-3"
            >
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-primary" />
              </div>
              <div>
                <span className="text-sm font-medium text-primary">生成</span>
                <span className="text-xs text-primary/60 block">AI 生成{currentCategory?.label || '资源'}</span>
              </div>
            </button>
          )}
          {/* Show generating tasks */}
          {currentGeneratingTasks.map(task => (
            <GeneratingListItem
              key={task.id}
              title={`正在生成: ${task.prompt}`}
              metadata={`${task.categoryLabel} · AI 正在生成中...`}
            />
          ))}
          {displayItems.length > 0 ? (
            <div className="flex flex-col gap-0.5">
              {displayItems.map(item => {
                if (item.status === 'generating') {
                  return <GeneratingListItem key={item.id} title={item.title} metadata={item.metadata} />;
                }
                const isActive = activePath === item.id;
                return (
                  <div
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelect(item.id)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(item.id); } }}
                    className={`group flex items-center gap-3 py-3 px-3 rounded-xl cursor-pointer transition-colors ${
                      isActive ? 'bg-primary/10' : 'hover:bg-secondary'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      !item.category
                        ? 'bg-sky-50 dark:bg-sky-500/10'
                        : 'bg-primary/10'
                    }`}>
                      {!item.category
                        ? <FileText className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                        : <Sparkles className="w-4 h-4 text-primary" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${
                        isActive ? 'text-primary' : 'text-foreground'
                      }`}>
                        {item.title}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {item.metadata}
                      </p>
                    </div>
                    <button
                      onClick={e => handleDelete(e, item.id, item.title + '.json')}
                      className="p-1.5 rounded-lg text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive hover:bg-destructive/10 transition-all"
                      title="删除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center text-muted-foreground text-xs py-12">暂无资源</div>
          )}
        </div>
      </>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-background">
      {viewContent}
      {generateModal.isOpen && generateModal.resourceType && (
        <GenerateModal
          resourceType={generateModal.resourceType}
          onClose={() => setGenerateModal({ isOpen: false, resourceType: null })}
          onGenerate={handleGenerate}
        />
      )}

      {/* Generate resource dialog */}
      {showGenerateDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowGenerateDialog(false)} />
          <div className="relative bg-card rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="px-6 py-5 border-b border-border">
              <h2 className="text-lg font-semibold text-foreground">
                生成{currentCategory?.label || '资源'}
              </h2>
              <p className="text-xs text-muted-foreground mt-1">输入主题，AI 将自动生成</p>
            </div>
            <div className="px-6 py-5">
              <input
                type="text"
                value={generatePrompt}
                onChange={e => setGeneratePrompt(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleGenerateResource(); }}
                placeholder={getPlaceholder(currentCategory?.label || '')}
                className="w-full px-4 py-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                autoFocus
              />
            </div>
            <div className="px-6 py-4 border-t border-border bg-secondary/50 flex gap-3 justify-end">
              <button
                onClick={() => setShowGenerateDialog(false)}
                className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleGenerateResource}
                disabled={!generatePrompt.trim()}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-all"
              >
                生成
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GeneratingBanner({ tasks }: { tasks?: GeneratingTask[] }) {
  if (!tasks || tasks.length === 0) return null;

  return (
    <div className="mx-5 mb-3 space-y-2">
      {tasks.map(task => (
        <div
          key={task.id}
          className={`flex items-center gap-3 py-3 px-4 rounded-xl border ${
            task.status === 'generating'
              ? 'bg-primary/5 border-primary/10'
              : task.status === 'completed'
                ? 'bg-emerald-500/5 border-emerald-500/20'
                : 'bg-red-500/5 border-red-500/20'
          }`}
        >
          {task.status === 'generating' ? (
            <Loader2 className="w-4 h-4 text-primary animate-spin" />
          ) : task.status === 'completed' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          ) : (
            <XCircle className="w-4 h-4 text-red-500" />
          )}
          <span className={`text-sm ${
            task.status === 'generating'
              ? 'text-primary'
              : task.status === 'completed'
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-red-600 dark:text-red-400'
          }`}>
            {task.status === 'generating'
              ? `正在生成${task.categoryLabel}: ${task.prompt}`
              : task.status === 'completed'
                ? `${task.categoryLabel}已生成: ${task.prompt}`
                : `生成失败: ${task.prompt}`}
          </span>
        </div>
      ))}
    </div>
  );
}
