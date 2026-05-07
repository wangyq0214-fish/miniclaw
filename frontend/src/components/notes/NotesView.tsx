'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  FileText,
  Plus,
  Check,
  BookOpen,
  Network,
  List,
  Sparkles,
  Send,
  BookmarkPlus,
  X,
  ArrowLeft,
  Upload,
  Link,
  ClipboardPaste,
} from 'lucide-react';
import { MarkdownRenderer } from '@/components/chat/MarkdownRenderer';
import { ExerciseViewer } from '@/components/exercise/ExerciseViewer';
import { MindmapCard } from '@/components/inspector/MindmapCard';
import { MessageActions } from '@/components/chat/MessageActions';
import { streamChat, listSources, createSource, uploadSourceFile, deleteSource, getSourceContent, type SourceItem, type NoteItem, createNote, deleteNote } from '@/lib/api';
import { useApp, bindNotesStore, type NotesChatMessage } from '@/lib/store';

// ── Resizer ──

function PanelResizer({
  onStart,
  onMove,
}: {
  onStart: () => void;
  onMove: (clientX: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    onStart();

    const move = (ev: MouseEvent) => requestAnimationFrame(() => onMove(ev.clientX));
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      ref.current?.classList.remove('active');
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    ref.current?.classList.add('active');
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }, [onStart, onMove]);

  return (
    <div
      ref={ref}
      onMouseDown={handleMouseDown}
      className="group/resizer relative w-2 shrink-0 cursor-col-resize flex items-center justify-center z-10"
    >
      <div className="absolute inset-y-0 -left-1 -right-1" />
      <div className="w-[3px] h-8 rounded-full bg-gray-200 group-hover/resizer:bg-teal-400 group-[.active]/resizer:bg-teal-500 transition-all group-hover/resizer:h-12 group-[.active]/resizer:h-12" />
    </div>
  );
}

// ── Action Cards Config ──

const ACTION_CARDS = [
  { key: 'exercises', label: '练习题', icon: List, bg: '#F3E8FF', iconColor: '#9333EA', subagent: 'exercise_composer', prompt: '请根据选中的来源生成一套练习题' },
  { key: 'lectures', label: '讲义', icon: BookOpen, bg: '#E8F0FE', iconColor: '#2563EB', subagent: 'lecture_writer', prompt: '请根据选中的来源生成一份讲义' },
  { key: 'mindmaps', label: '思维导图', icon: Network, bg: '#E6F4EA', iconColor: '#16A34A', subagent: 'mindmap_designer', prompt: '请根据选中的来源生成思维导图' },
];

type SourceModalView = 'menu' | 'text' | 'website';

// ── Main Component ──

export function NotesView() {
  const { state, dispatch, actions } = useApp();

  // Sources state (local — not persisted to store)
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [selectedSourceIds, setSelectedSourceIds] = useState<Set<string>>(new Set());

  // Add-source modal state
  const [isAddSourceOpen, setIsAddSourceOpen] = useState(false);
  const [sourceModalView, setSourceModalView] = useState<SourceModalView>('menu');
  const [sourceInputValue, setSourceInputValue] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Notes expand/collapse toggle
  const [notesExpanded, setNotesExpanded] = useState(true);

  // Bind store refs for module-level generation (survives unmount)
  useEffect(() => {
    bindNotesStore(dispatch, () => state);
  });

  // Load sources and notes from backend on mount
  useEffect(() => {
    listSources().then(setSources).catch(() => {});
    actions.loadNotes();
  }, []);

  // Source viewing state
  const [viewingSource, setViewingSource] = useState<SourceItem | null>(null);
  const [viewingContent, setViewingContent] = useState<string>('');
  const [viewingLoading, setViewingLoading] = useState(false);

  // Note viewing state (local)
  const [viewingNote, setViewingNote] = useState<NoteItem | null>(null);

  // Panel widths (px)
  const [leftWidth, setLeftWidth] = useState(280);
  const [rightWidth, setRightWidth] = useState(360);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startW: number }>({ startX: 0, startW: 0 });

  const handleLeftStart = useCallback(() => {
    dragRef.current = { startX: 0, startW: leftWidth };
  }, [leftWidth]);

  const handleLeftMove = useCallback((clientX: number) => {
    if (!dragRef.current.startX) dragRef.current.startX = clientX;
    setLeftWidth(Math.max(160, dragRef.current.startW + clientX - dragRef.current.startX));
  }, []);

  const handleRightStart = useCallback(() => {
    dragRef.current = { startX: 0, startW: rightWidth };
  }, [rightWidth]);

  const handleRightMove = useCallback((clientX: number) => {
    if (!dragRef.current.startX) dragRef.current.startX = clientX;
    setRightWidth(Math.max(200, dragRef.current.startW - (clientX - dragRef.current.startX)));
  }, []);

  // Chat state (local input only, messages in store)
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.notesChatMessages]);

  // ── Source handlers ──

  const openAddSourceModal = useCallback(() => {
    setSourceModalView('menu');
    setSourceInputValue('');
    setIsAddSourceOpen(true);
  }, []);

  const closeAddSourceModal = useCallback(() => {
    setIsAddSourceOpen(false);
    setSourceInputValue('');
    setSourceModalView('menu');
  }, []);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const newSource = await uploadSourceFile(file);
      setSources(prev => [newSource, ...prev]);
    } catch {
      const fallback: SourceItem = { id: `src-${Date.now()}`, title: file.name, file_type: 'file' };
      setSources(prev => [fallback, ...prev]);
    }
    closeAddSourceModal();

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [closeAddSourceModal]);

  const handleInsertSource = useCallback(async () => {
    const text = sourceInputValue.trim();
    if (!text) return;

    let title: string;
    if (sourceModalView === 'website') {
      try {
        const url = text.split(/[\s\n]/)[0];
        const hostname = new URL(url).hostname.replace(/^www\./, '');
        title = hostname;
      } catch {
        title = text.slice(0, 50);
      }
    } else {
      const firstLine = text.split('\n').find(l => l.trim()) || '';
      title = firstLine.slice(0, 50) || '粘贴的文字';
    }

    try {
      const newSource = await createSource(title, text, sourceModalView === 'website' ? 'website' : 'text');
      setSources(prev => [newSource, ...prev]);
    } catch {
      const fallback: SourceItem = { id: `src-${Date.now()}`, title, content: text };
      setSources(prev => [fallback, ...prev]);
    }
    closeAddSourceModal();
  }, [sourceInputValue, sourceModalView, closeAddSourceModal]);

  const handleDeleteSource = useCallback(async (id: string) => {
    setSources(prev => prev.filter(s => s.id !== id));
    setSelectedSourceIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    try {
      await deleteSource(id);
    } catch {
      // already removed from UI
    }
  }, []);

  const toggleSource = useCallback((id: string) => {
    setSelectedSourceIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleViewSource = useCallback(async (src: SourceItem) => {
    setViewingSource(src);
    setViewingLoading(true);

    try {
      const result = await getSourceContent(src.id);
      if (result.type === 'text') {
        setViewingContent(result.content);
      } else {
        setViewingContent(`[二进制文件: ${result.filename || src.title}]\n\n此文件类型无法在浏览器中预览。`);
      }
    } catch {
      setViewingContent('无法加载文件内容');
    } finally {
      setViewingLoading(false);
    }
  }, []);

  const closeSourceViewer = useCallback(() => {
    setViewingSource(null);
    setViewingContent('');
  }, []);

  // ── Chat handlers ──

  const handleSendChat = useCallback(async () => {
    const text = chatInput.trim();
    if (!text || state.isNotesStreaming) return;

    const userMsg: NotesChatMessage = { id: `u-${Date.now()}`, role: 'user', content: text };
    const assistantMsg: NotesChatMessage = { id: `a-${Date.now()}`, role: 'assistant', content: '', isStreaming: true };

    actions.addNotesChatMessage(userMsg);
    actions.addNotesChatMessage(assistantMsg);
    setChatInput('');
    actions.setIsNotesStreaming(true);

    // Fetch content of selected sources and embed as context
    const selectedSources = sources.filter(s => selectedSourceIds.has(s.id));
    let contextPrefix = '';
    if (selectedSources.length > 0) {
      const parts = await Promise.all(
        selectedSources.map(async (s) => {
          try {
            const result = await getSourceContent(s.id);
            if (result.type === 'text' && result.content) {
              return `【${s.title}】\n${result.content}`;
            }
            return `【${s.title}】(二进制文件，无法读取内容)`;
          } catch {
            return `【${s.title}】(读取失败)`;
          }
        })
      );
      contextPrefix = `<sources>\n${parts.join('\n\n---\n\n')}\n</sources>\n\n`;
    }

    const controller = new AbortController();

    try {
      let fullContent = '';
      for await (const event of streamChat(
        { message: contextPrefix + text, session_id: '', stream: true },
        controller.signal,
      )) {
        if (event.type === 'token' && event.content) {
          fullContent += event.content;
          actions.updateNotesChatMessage(assistantMsg.id, { content: fullContent });
        }
        if (event.type === 'done' || event.type === 'error') break;
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        actions.updateNotesChatMessage(assistantMsg.id, { content: '请求失败，请重试。' });
      }
    } finally {
      actions.updateNotesChatMessage(assistantMsg.id, { isStreaming: false });
      actions.setIsNotesStreaming(false);
    }
  }, [chatInput, state.isNotesStreaming, sources, selectedSourceIds]);

  const handleStopChat = useCallback(() => {
    actions.stopNotesGeneration();
  }, []);

  // ── Save to notes ──

  const handleSaveToNote = useCallback(async (content: string) => {
    const firstLine = content.split('\n').find(l => l.trim()) || '';
    const title = firstLine.replace(/^#+\s*/, '').slice(0, 50) || '未命名笔记';

    try {
      const note = await createNote(title, content);
      actions.addNote(note);
    } catch {
      actions.addNote({ id: `note-${Date.now()}`, title, content, created_at: new Date().toLocaleString('zh-CN') });
    }
  }, []);

  const handleDeleteNote = useCallback(async (id: string) => {
    actions.setNotes(state.notes.filter(n => n.id !== id));
    try { await deleteNote(id); } catch { /* already removed from UI */ }
  }, [state.notes]);

  // ── Helper: build source context prefix ──

  const buildSourceContext = useCallback(async (): Promise<string> => {
    const selectedSources = sources.filter(s => selectedSourceIds.has(s.id));
    if (selectedSources.length === 0) return '';
    const parts = await Promise.all(
      selectedSources.map(async (s) => {
        try {
          const result = await getSourceContent(s.id);
          if (result.type === 'text' && result.content) return `【${s.title}】\n${result.content}`;
          return `【${s.title}】(二进制文件，无法读取内容)`;
        } catch {
          return `【${s.title}】(读取失败)`;
        }
      })
    );
    return `<sources>\n${parts.join('\n\n---\n\n')}\n</sources>\n\n`;
  }, [sources, selectedSourceIds]);

  // ── Quick action handler (uses store generation) ──

  const handleQuickAction = useCallback(async (subagent: string, prompt: string, label: string) => {
    if (state.isNotesStreaming || state.notesGeneratingLabel) return;
    const contextPrefix = await buildSourceContext();
    actions.startNotesGeneration({ prompt, subagent, label, contextPrefix });
  }, [state.isNotesStreaming, state.notesGeneratingLabel, buildSourceContext]);

  // ── ExerciseViewer "生成测验" callback (topic-based, with source context) ──

  const handleGenerateFromTopics = useCallback(async (prompt: string) => {
    if (state.isNotesStreaming || state.notesGeneratingLabel) return;
    const contextPrefix = await buildSourceContext();
    setViewingNote(null); // Return to notes list view
    actions.startNotesGeneration({ prompt, subagent: 'exercise_composer', label: '测验', contextPrefix });
  }, [state.isNotesStreaming, state.notesGeneratingLabel, buildSourceContext]);

  // ── Render ──

  return (
    <div ref={containerRef} className="flex h-full w-full bg-gray-50/30">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept=".pdf,.md,.txt,.doc,.docx"
        onChange={handleFileUpload}
      />

      {/* ── Left Panel: Sources / Source Viewer ── */}
      <div className="border-r border-gray-200 bg-white flex flex-col overflow-hidden shrink-0" style={{ width: leftWidth }}>
        {viewingSource ? (
          /* Source Content Viewer */
          <>
            <div className="p-4 pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <button
                  onClick={closeSourceViewer}
                  className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center transition-colors"
                >
                  <ArrowLeft className="w-4 h-4 text-gray-500" />
                </button>
                <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                <span className="text-sm font-semibold text-gray-900 truncate">{viewingSource.title}</span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {viewingLoading ? (
                <div className="flex flex-col items-center justify-center py-20 text-gray-300">
                  <div className="w-6 h-6 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs text-gray-400 mt-3">加载中...</p>
                </div>
              ) : (
                <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed whitespace-pre-wrap break-words">
                  <MarkdownRenderer content={viewingContent} />
                </div>
              )}
            </div>
          </>
        ) : (
          /* Source List */
          <>
            <div className="p-5 pb-3">
              <div className="flex items-center gap-2 mb-2">
                <button
                  onClick={() => actions.setActiveTab('resources')}
                  className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center transition-colors"
                  title="返回 Studio"
                >
                  <ArrowLeft className="w-4 h-4 text-gray-500" />
                </button>
                <span className="text-xs text-gray-400">返回 Studio</span>
              </div>
              <h2 className="text-lg font-bold text-gray-900">来源</h2>
              <p className="text-xs text-gray-400 mt-1">管理参考文档与上下文</p>
            </div>

            <div className="px-5 pb-3">
              <button
                onClick={openAddSourceModal}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-gray-200 hover:border-teal-400 hover:bg-teal-50/50 text-gray-400 hover:text-teal-600 transition-all text-sm"
              >
                <Plus className="w-4 h-4" />
                添加来源
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 pb-4">
              {sources.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-300">
                  <FileText className="w-8 h-8 mb-2" />
                  <p className="text-xs">暂无来源</p>
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  {sources.map(src => (
                    <div
                      key={src.id}
                      className="group flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-gray-50 transition-colors"
                    >
                      <div
                        className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                          selectedSourceIds.has(src.id)
                            ? 'bg-teal-500 border-teal-500'
                            : 'border-gray-300'
                        }`}
                        onClick={() => toggleSource(src.id)}
                      >
                        {selectedSourceIds.has(src.id) && <Check className="w-3 h-3 text-white" />}
                      </div>
                      <div
                        className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer"
                        onClick={() => handleViewSource(src)}
                      >
                        <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                        <span className="text-sm text-gray-700 truncate hover:text-teal-600 transition-colors">{src.title}</span>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); handleDeleteSource(src.id); }}
                        className="p-1 rounded text-gray-300 opacity-0 group-hover:opacity-100 hover:text-red-500 hover:bg-red-50 transition-all shrink-0"
                        title="删除来源"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {selectedSourceIds.size > 0 && (
              <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/50">
                <p className="text-xs text-teal-600 font-medium">
                  已选择 {selectedSourceIds.size} 个来源
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Resizer: Left ↔ Middle */}
      <PanelResizer onStart={handleLeftStart} onMove={handleLeftMove} />

      {/* ── Middle Panel: Note Detail / Studio + Notes ── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {viewingNote ? (
          /* Note Detail View */
          <>
            <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-200/60">
              <button
                onClick={() => setViewingNote(null)}
                className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center transition-colors"
              >
                <ArrowLeft className="w-4 h-4 text-gray-500" />
              </button>
              <BookmarkPlus className="w-4 h-4 text-gray-400 shrink-0" />
              <h2 className="text-sm font-bold text-gray-900 truncate">{viewingNote.title}</h2>
              <span className="text-[10px] text-gray-300 ml-auto shrink-0">{viewingNote.created_at}</span>
            </div>
            <div className="flex-1 overflow-y-auto">
              {(() => {
                const content = viewingNote.content.trim();
                // Exercise JSON → interactive ExerciseViewer
                if (content.startsWith('{') || content.startsWith('[')) {
                  try {
                    const parsed = JSON.parse(content);
                    if (parsed.questions && Array.isArray(parsed.questions)) {
                      return <ExerciseViewer content={content} onClose={() => setViewingNote(null)} onGenerateFromTopics={handleGenerateFromTopics} />;
                    }
                    // Mindmap JSON → MindmapCard
                    const tree = parsed.tree || parsed;
                    if (tree && typeof tree === 'object' && typeof tree.title === 'string' && Array.isArray(tree.children)) {
                      return (
                        <div className="h-full min-h-[500px]">
                          <MindmapCard path={viewingNote.title} content={content} />
                        </div>
                      );
                    }
                    // Other JSON → formatted code block
                    return (
                      <div className="p-6">
                        <pre className="text-xs bg-gray-50 rounded-xl p-4 overflow-x-auto border border-gray-100 leading-relaxed">
                          <code>{JSON.stringify(parsed, null, 2)}</code>
                        </pre>
                      </div>
                    );
                  } catch { /* not valid JSON */ }
                }
                // Markdown / text → MarkdownRenderer
                return (
                  <div className="p-6 prose prose-sm max-w-none text-gray-700 leading-relaxed">
                    <MarkdownRenderer content={content} />
                  </div>
                );
              })()}
            </div>
          </>
        ) : (
          /* Normal Mode: Studio + Notes List */
          <>
            {/* Studio Grid */}
            <div className="p-6 pb-4">
              <h2 className="text-lg font-bold text-gray-900 mb-1">快速操作</h2>
              <p className="text-xs text-gray-400 mb-4">
                {selectedSourceIds.size > 0
                  ? `基于 ${selectedSourceIds.size} 个来源生成`
                  : '请先在左侧勾选来源'}
              </p>
              <div className="grid grid-cols-3 gap-3">
                {ACTION_CARDS.map(card => (
                  <button
                    key={card.key}
                    disabled={selectedSourceIds.size === 0 || state.isNotesStreaming || !!state.notesGeneratingLabel}
                    className="group flex items-center gap-3 p-4 rounded-2xl bg-white border border-gray-100 transition-all disabled:opacity-40 disabled:cursor-not-allowed enabled:hover:border-gray-200 enabled:hover:shadow-md enabled:hover:-translate-y-0.5"
                    style={{ backgroundColor: card.bg }}
                    onClick={() => handleQuickAction(card.subagent, card.prompt, card.label)}
                  >
                    <div className="w-10 h-10 rounded-xl bg-white/80 flex items-center justify-center shrink-0">
                      <card.icon className="w-5 h-5" style={{ color: card.iconColor }} />
                    </div>
                    <span className="text-sm font-semibold text-gray-800">{card.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Divider */}
            <div className="mx-6 border-t border-gray-200/60" />

            {/* Notes List */}
            <div className="flex-1 overflow-y-auto p-6 pt-4">
              <button
                onClick={() => setNotesExpanded(v => !v)}
                className="flex items-center justify-between w-full mb-4 group"
              >
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-gray-900">我的笔记</h2>
                  <span className="text-xs text-gray-400">{state.notes.length} 条</span>
                </div>
                <svg
                  className={`w-4 h-4 text-gray-400 transition-transform ${notesExpanded ? '' : '-rotate-90'}`}
                  viewBox="0 0 20 20" fill="currentColor"
                >
                  <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                </svg>
              </button>

              {notesExpanded && (
                <div className="flex flex-col gap-3">
                  {/* Generating loading bar */}
                  {state.notesGeneratingLabel && (
                    <div className="p-4 rounded-xl bg-white border border-gray-100">
                      <div className="flex items-center gap-3">
                        <div className="w-5 h-5 border-2 border-teal-400 border-t-transparent rounded-full animate-spin shrink-0" />
                        <span className="text-sm text-gray-500">正在生成{state.notesGeneratingLabel}...</span>
                      </div>
                      <div className="mt-3 h-1 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-teal-400 rounded-full animate-pulse" style={{ width: '60%' }} />
                      </div>
                    </div>
                  )}
                  {/* Notes list */}
                  {state.notes.length === 0 && !state.notesGeneratingLabel ? (
                    <div className="flex flex-col items-center justify-center py-20 text-gray-300">
                      <BookmarkPlus className="w-10 h-10 mb-3 opacity-40" />
                      <p className="text-sm font-medium text-gray-400">暂无笔记</p>
                      <p className="text-xs text-gray-300 mt-1">点击快速操作生成，或在对话中保存</p>
                    </div>
                  ) : state.notes.map(note => (
                    <div
                      key={note.id}
                      className="group relative p-4 rounded-xl bg-white border border-gray-100 hover:border-gray-200 hover:shadow-sm transition-all cursor-pointer"
                      onClick={() => setViewingNote(note)}
                    >
                      <div className="flex items-start justify-between gap-3 mb-1.5">
                        <h3 className="text-sm font-semibold text-gray-800 line-clamp-1">{note.title}</h3>
                        <button
                          onClick={e => { e.stopPropagation(); handleDeleteNote(note.id); }}
                          className="p-1 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all shrink-0 opacity-0 group-hover:opacity-100"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="text-xs text-gray-400 line-clamp-2 leading-relaxed">
                        {note.content.slice(0, 120)}
                      </div>
                      <p className="text-[10px] text-gray-300 mt-2">{note.created_at}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Resizer: Middle ↔ Right */}
      <PanelResizer onStart={handleRightStart} onMove={handleRightMove} />

      {/* ── Right Panel: Chat ── */}
      <div className="border-l border-gray-200 bg-white flex flex-col overflow-hidden shrink-0" style={{ width: rightWidth }}>
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">对话</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {selectedSourceIds.size > 0
              ? `基于 ${selectedSourceIds.size} 个来源回复`
              : '基于全部知识库回复'}
          </p>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {state.notesChatMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-300">
              <Sparkles className="w-8 h-8 mb-2 opacity-40" />
              <p className="text-sm text-gray-400">开始提问</p>
              <p className="text-xs text-gray-300 mt-1">左侧勾选来源可限定上下文</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {state.notesChatMessages.map(msg => (
                <div key={msg.id} className={`group ${msg.role === 'user' ? 'flex justify-end' : ''}`}>
                  {msg.role === 'user' ? (
                    <div className="max-w-[85%] px-4 py-2.5 rounded-2xl rounded-br-md bg-teal-500 text-white text-sm">
                      {msg.content}
                    </div>
                  ) : (
                    <div className="max-w-[90%]">
                      <div className="px-4 py-3 rounded-2xl rounded-bl-md bg-gray-50 text-sm text-gray-800 leading-relaxed">
                        <MarkdownRenderer content={msg.content} />
                        {msg.isStreaming && (
                          <span className="inline-block w-1.5 h-4 bg-teal-400 animate-pulse ml-0.5 rounded-sm" />
                        )}
                      </div>
                      {!msg.isStreaming && msg.content && (
                        <MessageActions
                          content={msg.content}
                          onSaveToNote={handleSaveToNote}
                        />
                      )}
                    </div>
                  )}
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="p-4 border-t border-gray-100">
          <div className="flex items-end gap-2">
            <textarea
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendChat();
                }
              }}
              placeholder="输入问题..."
              rows={1}
              className="flex-1 resize-none rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 max-h-32"
              style={{ minHeight: 40 }}
            />
            {state.isNotesStreaming ? (
              <button
                onClick={handleStopChat}
                className="w-9 h-9 rounded-xl bg-red-50 hover:bg-red-100 flex items-center justify-center text-red-500 transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleSendChat}
                disabled={!chatInput.trim()}
                className="w-9 h-9 rounded-xl bg-teal-500 hover:bg-teal-600 disabled:bg-gray-200 disabled:text-gray-400 flex items-center justify-center text-white transition-colors shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Add Source Modal ── */}
      {isAddSourceOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeAddSourceModal} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">

            {/* ── View A: Main Menu ── */}
            {sourceModalView === 'menu' && (
              <>
                {/* Header */}
                <div className="flex items-center justify-between px-8 pt-7 pb-4">
                  <h2 className="text-xl font-bold text-gray-900">添加来源</h2>
                  <button
                    onClick={closeAddSourceModal}
                    className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Drop zone */}
                <div className="mx-8 mb-6">
                  <div className="flex flex-col items-center justify-center py-12 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50/50">
                    <Upload className="w-8 h-8 text-gray-300 mb-3" />
                    <p className="text-sm text-gray-400">或拖放文件</p>
                    <p className="text-xs text-gray-300 mt-1">PDF、图片、文档、音频、文本</p>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-3 px-8 pb-8">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-full border border-gray-200 bg-white hover:bg-gray-50 text-sm font-medium text-gray-700 transition-colors"
                  >
                    <Upload className="w-4 h-4 text-gray-500" />
                    上传文件
                  </button>
                  <button
                    onClick={() => setSourceModalView('website')}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-full border border-gray-200 bg-white hover:bg-gray-50 text-sm font-medium text-gray-700 transition-colors"
                  >
                    <Link className="w-4 h-4 text-gray-500" />
                    网站
                  </button>
                  <button
                    onClick={() => setSourceModalView('text')}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-full border border-gray-200 bg-white hover:bg-gray-50 text-sm font-medium text-gray-700 transition-colors"
                  >
                    <ClipboardPaste className="w-4 h-4 text-gray-500" />
                    复制的文字
                  </button>
                </div>
              </>
            )}

            {/* ── View B: Paste Text ── */}
            {sourceModalView === 'text' && (
              <>
                {/* Header */}
                <div className="flex items-center justify-between px-8 pt-6 pb-2">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setSourceModalView('menu')}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
                    >
                      <ArrowLeft className="w-5 h-5" />
                    </button>
                    <h2 className="text-lg font-bold text-gray-900">粘贴复制的文字</h2>
                  </div>
                  <button
                    onClick={closeAddSourceModal}
                    className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Tip */}
                <p className="px-8 pt-2 pb-4 text-sm text-gray-400">
                  在下方粘贴复制的文字，即可将其作为来源上传。
                </p>

                {/* Textarea */}
                <div className="px-8 pb-4">
                  <textarea
                    value={sourceInputValue}
                    onChange={e => setSourceInputValue(e.target.value)}
                    placeholder="在此处粘贴文字"
                    className="w-full h-64 px-4 py-3 rounded-xl border border-gray-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-shadow"
                  />
                </div>

                {/* Footer */}
                <div className="flex justify-end px-8 pb-6">
                  <button
                    onClick={handleInsertSource}
                    disabled={!sourceInputValue.trim()}
                    className="px-6 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:bg-gray-200 disabled:text-gray-400 bg-gray-900 text-white hover:bg-gray-800"
                  >
                    插入
                  </button>
                </div>
              </>
            )}

            {/* ── View C: Website URL ── */}
            {sourceModalView === 'website' && (
              <>
                {/* Header */}
                <div className="flex items-center justify-between px-8 pt-6 pb-2">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setSourceModalView('menu')}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
                    >
                      <ArrowLeft className="w-5 h-5" />
                    </button>
                    <h2 className="text-lg font-bold text-gray-900">网站网址</h2>
                  </div>
                  <button
                    onClick={closeAddSourceModal}
                    className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Tip */}
                <p className="px-8 pt-2 pb-4 text-sm text-gray-400">
                  在下方粘贴复制的文字，即可将其作为来源上传。
                </p>

                {/* URL input */}
                <div className="px-8 pb-3">
                  <textarea
                    value={sourceInputValue}
                    onChange={e => setSourceInputValue(e.target.value)}
                    placeholder="粘贴任何链接"
                    className="w-full h-64 px-4 py-3 rounded-xl border border-gray-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-shadow"
                  />
                </div>

                {/* Notes */}
                <div className="px-8 pb-4">
                  <ul className="text-xs text-gray-400 space-y-1.5 list-disc list-inside">
                    <li>如果要添加多个网址，请用空格或换行符分隔。</li>
                    <li>目前只会导入网站上的可见文字。</li>
                    <li>不支持付费文章。</li>
                  </ul>
                </div>

                {/* Footer */}
                <div className="flex justify-end px-8 pb-6">
                  <button
                    onClick={handleInsertSource}
                    disabled={!sourceInputValue.trim()}
                    className="px-6 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:bg-gray-200 disabled:text-gray-400 bg-gray-900 text-white hover:bg-gray-800"
                  >
                    插入
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
