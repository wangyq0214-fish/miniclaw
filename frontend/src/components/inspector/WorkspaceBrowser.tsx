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
  BarChart3,
  Code,
  FolderOpen,
  Library,
  FolderPlus,
} from 'lucide-react';
import { listFiles, deleteFile, writeFile, type FileInfo } from '@/lib/api';
import { useApp } from '@/lib/store';

// ── Agent routers ──
const agentRouters: Record<string, string> = {
  '测验': '@QuizMaster',
  '讲义': '@LectureTutor',
  '代码案例': '@CodeNinja',
  '思维导图': '@GraphMapper',
  '阅读清单': '@ReadingCurator',
  '动画脚本': '@MediaScriptWriter',
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
  { key: 'exercises', icon: FileCode, label: '练习题', color: 'text-purple-600', bgColor: 'bg-purple-50', description: '根据学习进度生成的针对性练习', generateLabel: '测验' },
  { key: 'lectures', icon: BookOpen, label: '讲义', color: 'text-blue-600', bgColor: 'bg-blue-50', description: '深度讲解文档，涵盖核心概念与原理', generateLabel: '讲义' },
  { key: 'mindmaps', icon: Network, label: '思维导图', color: 'text-emerald-600', bgColor: 'bg-emerald-50', description: '可视化知识结构，梳理概念关系', generateLabel: '思维导图' },
  { key: 'reading-lists', icon: List, label: '阅读清单', color: 'text-amber-600', bgColor: 'bg-amber-50', description: '精选阅读材料与推荐书单', generateLabel: '阅读清单' },
  { key: 'evaluations', icon: BarChart3, label: '评估', color: 'text-rose-600', bgColor: 'bg-rose-50', description: '学习效果评估与能力分析', generateLabel: '评估' },
  { key: 'code-cases', icon: Code, label: '代码案例', color: 'text-violet-600', bgColor: 'bg-violet-50', description: '可运行的分级代码示例', generateLabel: '代码案例' },
  { key: 'media-scripts', icon: FileCode, label: '动画脚本', color: 'text-pink-600', bgColor: 'bg-pink-50', description: '场景分镜动画脚本，含视觉元素与旁白', generateLabel: '动画脚本' },
];

// ── Roots ──
const ROOTS = [
  { path: 'knowledge/source', label: '共享资源', icon: Library, color: 'bg-sky-50 text-sky-600' },
  { path: 'workspace', label: '我的工作区', icon: FolderOpen, color: 'bg-violet-50 text-violet-600' },
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

function getDisplayName(fileName: string): string {
  const nameWithoutExt = fileName.replace(/\.(md|json|txt|pdf|html|docx?)$/i, '');
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

function buildMetaText(file: FileInfo): string {
  const parts: string[] = ['AI 生成'];
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
      className="group flex items-center justify-between p-4 rounded-2xl bg-white border border-gray-100 hover:border-gray-200 hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer"
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
          <span className="text-sm font-semibold text-gray-800 block">{category.label}</span>
          <span className="text-xs text-gray-400 line-clamp-1">{category.description}</span>
        </div>
      </div>
      <button
        onClick={e => { e.stopPropagation(); onGenerate(); }}
        className="w-8 h-8 rounded-full bg-gray-50 hover:bg-indigo-50 flex items-center justify-center text-gray-400 hover:text-indigo-500 transition-colors shrink-0 ml-2"
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
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      <div className="flex flex-wrap gap-2">
        {options.map(opt => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              value === opt
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
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
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            {category && (
              <div className={`w-9 h-9 rounded-xl ${category.bgColor} flex items-center justify-center`}>
                <category.icon className={`w-5 h-5 ${category.color}`} />
              </div>
            )}
            <div>
              <h2 className="text-lg font-semibold text-gray-900">自定义生成</h2>
              <p className="text-xs text-gray-400">{resourceType}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
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
            <label className="block text-sm font-medium text-gray-700 mb-2">额外要求（可选）</label>
            <textarea
              value={formData.prompt || ''}
              onChange={e => update('prompt', e.target.value)}
              placeholder="例如：重点考察反向传播的数学推导..."
              className="w-full h-32 px-4 py-3 rounded-xl border border-gray-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-shadow"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-5 border-t border-gray-100 bg-gray-50/50">
          <button
            onClick={() => onGenerate(formData)}
            className="w-full py-3 rounded-xl bg-indigo-600 text-white text-base font-semibold hover:bg-indigo-700 active:scale-[0.98] transition-all"
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
    <div className="flex items-center gap-3 py-3 px-3 rounded-xl bg-gradient-to-r from-blue-50/60 to-indigo-50/40">
      <div className="w-8 h-8 rounded-lg bg-blue-100/60 flex items-center justify-center shrink-0">
        <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-blue-700 truncate">{title}</p>
        <p className="text-xs text-blue-400 mt-0.5">{metadata}</p>
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
          isActive ? 'bg-blue-50/80' : 'hover:bg-gray-50'
        }`}
        style={{ paddingLeft: 8 + depth * 16 }}
      >
        {isDir ? (
          <ChevronRight className={`w-3.5 h-3.5 text-gray-400 shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        {isDir ? (
          <FolderOpen className="w-4 h-4 text-amber-500 shrink-0" />
        ) : (
          <FileCode className="w-4 h-4 text-blue-400 shrink-0" />
        )}
        <span className={`text-sm truncate ${isActive ? 'text-blue-700 font-medium' : 'text-gray-700'}`}>
          {file.name}
        </span>
        {loading && <Loader2 className="w-3 h-3 text-gray-400 animate-spin shrink-0" />}
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

  // Merge real files + optimistic resources
  const displayItems = useMemo(() => {
    if (!activeCategoryKey) {
      // Non-category paths (e.g. knowledge/source) — use raw fileItems
      return fileItems.map<ResourceItem>(f => ({
        id: f.path,
        category: '',
        title: getDisplayName(f.name),
        status: 'completed',
        metadata: buildMetaText(f),
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
      setCurrentPath(parts.join('/'));
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

  // New item creation for code-cases
  const isCodeCases = activeCategoryKey === 'code-cases'
    || currentPath === 'workspace/generated/code-cases'
    || (currentPath?.startsWith('workspace/generated/code-cases/') ?? false);
  const isInsideProject = !!currentPath
    && currentPath.startsWith('workspace/generated/code-cases/')
    && currentPath !== 'workspace/generated/code-cases';
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const newMenuRef = useRef<HTMLDivElement>(null);

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
        <div className="flex items-center gap-2 text-gray-500">
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
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          <p className="text-sm text-gray-400 mt-1">{description}</p>
        </div>
        {state.isGeneratingQuiz && <GeneratingBanner />}
        <div className="flex-1 overflow-y-auto px-5 pb-6">
          <div className="grid grid-cols-2 gap-3">
            {ROOTS.map(root => (
              <button
                key={root.path}
                onClick={() => setCurrentPath(root.path)}
                className="group flex flex-col items-start p-4 rounded-2xl bg-white border border-gray-100 hover:border-gray-200 hover:shadow-md hover:-translate-y-0.5 transition-all text-left"
              >
                <div className={`w-10 h-10 rounded-xl ${root.color} flex items-center justify-center mb-3`}>
                  <root.icon className="w-5 h-5" />
                </div>
                <span className="text-sm font-semibold text-gray-800">{root.label}</span>
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
            <button onClick={handleBack} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center transition-colors">
              <ArrowLeft className="w-4 h-4 text-gray-500" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{title}</h1>
              <p className="text-xs text-gray-400 mt-0.5">{description}</p>
            </div>
          </div>
        </div>
        {state.isGeneratingQuiz && <GeneratingBanner />}
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
            <button onClick={handleBack} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center transition-colors">
              <ArrowLeft className="w-4 h-4 text-gray-500" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{title}</h1>
              <p className="text-xs text-gray-400 mt-0.5">{description}</p>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-6">
          <div className="flex flex-col gap-2">
            {isCodeCases && (
              <div className="relative" ref={newMenuRef}>
                <button
                  onClick={() => setNewMenuOpen(!newMenuOpen)}
                  className="flex items-center gap-3 py-3 px-3 rounded-xl border-2 border-dashed border-violet-200 hover:border-violet-400 hover:bg-violet-50/50 transition-all text-left w-full"
                >
                  <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
                    <FolderPlus className="w-4 h-4 text-violet-600" />
                  </div>
                  <div>
                    <span className="text-sm font-medium text-violet-700">新建</span>
                    <span className="text-xs text-violet-400 block">创建文件或文件夹</span>
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
                className="flex items-center gap-3 py-3 px-3 rounded-xl hover:bg-gray-50 transition-colors text-left"
              >
                <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                  <FolderOpen className="w-4 h-4 text-gray-500" />
                </div>
                <span className="text-sm font-medium text-gray-800">{getDisplayName(dir.name)}</span>
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
            <button onClick={handleBack} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center transition-colors">
              <ArrowLeft className="w-4 h-4 text-gray-500" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{title}</h1>
              <p className="text-xs text-gray-400 mt-0.5">项目文件</p>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-6">
          {/* New button */}
          <div className="relative mb-2" ref={newMenuRef}>
            <button
              onClick={() => setNewMenuOpen(!newMenuOpen)}
              className="w-full flex items-center gap-3 py-2.5 px-3 rounded-xl border-2 border-dashed border-violet-200 hover:border-violet-400 hover:bg-violet-50/50 transition-all text-left"
            >
              <div className="w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
                <FolderPlus className="w-3.5 h-3.5 text-violet-600" />
              </div>
              <span className="text-sm font-medium text-violet-700">新建</span>
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
            <div className="flex items-center gap-2 text-gray-500 py-4">
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
            <div className="text-center text-gray-400 text-xs py-12">项目为空</div>
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
            <button onClick={handleBack} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center transition-colors">
              <ArrowLeft className="w-4 h-4 text-gray-500" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{title}</h1>
              <p className="text-xs text-gray-400 mt-0.5">{description}</p>
            </div>
          </div>
        </div>
        {state.isGeneratingQuiz && <GeneratingBanner />}
        <div className="flex-1 overflow-y-auto px-5 pb-6">
          {isCodeCases && (
            <div className="relative mb-3" ref={newMenuRef}>
              <button
                onClick={() => setNewMenuOpen(!newMenuOpen)}
                className="w-full flex items-center gap-3 py-3 px-3 rounded-xl border-2 border-dashed border-violet-200 hover:border-violet-400 hover:bg-violet-50/50 transition-all text-left"
              >
                <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
                  <FolderPlus className="w-4 h-4 text-violet-600" />
                </div>
                <div>
                  <span className="text-sm font-medium text-violet-700">新建</span>
                  <span className="text-xs text-violet-400 block">创建文件或文件夹</span>
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
                      isActive ? 'bg-blue-50/80' : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                      <Sparkles className="w-4 h-4 text-indigo-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${isActive ? 'text-blue-700' : 'text-gray-800'}`}>
                        {item.title}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">{item.metadata}</p>
                    </div>
                    <button
                      onClick={e => handleDelete(e, item.id, item.title + '.json')}
                      className="p-1.5 rounded-lg text-gray-300 opacity-0 group-hover:opacity-100 hover:text-red-500 hover:bg-red-50 transition-all"
                      title="删除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center text-gray-400 text-xs py-12">暂无资源</div>
          )}
        </div>
      </>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {viewContent}
      {generateModal.isOpen && generateModal.resourceType && (
        <GenerateModal
          resourceType={generateModal.resourceType}
          onClose={() => setGenerateModal({ isOpen: false, resourceType: null })}
          onGenerate={handleGenerate}
        />
      )}
    </div>
  );
}

function GeneratingBanner() {
  return (
    <div className="mx-5 mb-3 flex items-center gap-3 py-3 px-4 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100">
      <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
      <span className="text-sm text-blue-700">正在生成测验...</span>
    </div>
  );
}
