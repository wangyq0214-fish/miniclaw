'use client';

import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Brain,
  ArrowDown,
  Sparkles,
  User,
  Loader2,
  Check,
  FileText,
  Network,
  Video,
  Film,
  Wrench,
  BookOpen,
  GraduationCap,
  Code,
  List,
  Circle,
  CircleDot,
  CheckCircle2,
  XCircle,
  Layers,
} from 'lucide-react';
import { Message, ToolCall, RetrievalResult, StatusEntry, PipelineStage, useApp } from '@/lib/store';
import { streamSubagent } from '@/lib/api';
import { useAvatar } from '@/hooks/useAvatar';
import usePetStore from '@/components/pet/usePetStore';
import { MarkdownRenderer } from '@/components/chat/MarkdownRenderer';
import { ComposerInput } from '@/components/chat/ComposerInput';
import { MessageActions } from '@/components/chat/MessageActions';
import { EmptyChatState } from '@/components/chat/EmptyChatState';

interface ChatViewProps {
  sessionId: string;
  messages: Message[];
  onSendMessage: (message: string) => void;
  isLoading: boolean;
}

type ChatMode = 'chat' | 'coder';

interface CoderMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCall[];
  isStreaming?: boolean;
}

const TOOL_LABELS: Record<string, string> = {
  update_student_profile: '正在更新学习档案',
  read_file: '正在查阅资料',
  write_file: '正在保存内容',
  generate_lecture: '正在生成讲义',
  generate_exercises: '正在出练习题',
  generate_flashcards: '正在生成抽认卡',
  evaluate_learning: '正在评估学习',
  generate_mindmap: '正在生成思维导图',
  generate_code_case: '正在生成代码案例',
  generate_reading_list: '正在生成阅读清单',
  generate_media_script: '正在生成视频脚本',
  generate_manim_video: '正在生成教学视频',
  answer_question: '正在解答问题',
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TOOL_ICONS: Record<string, any> = {
  update_student_profile: GraduationCap,
  read_file: FileText,
  write_file: FileText,
  generate_lecture: BookOpen,
  generate_exercises: List,
  generate_flashcards: Layers,
  evaluate_learning: Brain,
  generate_mindmap: Network,
  generate_code_case: Code,
  generate_reading_list: List,
  generate_media_script: Film,
  generate_manim_video: Video,
  answer_question: Sparkles,
};

function getToolLabel(tool: string): string {
  return TOOL_LABELS[tool] || '正在处理…';
}

function ToolCallBlock({ toolCall }: { toolCall: ToolCall }) {
  const isRunning = toolCall.status === 'running';
  const [expanded, setExpanded] = useState(isRunning);
  const [elapsed, setElapsed] = useState(0);

  // Live elapsed timer
  useEffect(() => {
    if (!isRunning || !toolCall.startTime) return;
    setElapsed(Math.floor((Date.now() - toolCall.startTime) / 1000));
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - toolCall.startTime!) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [isRunning, toolCall.startTime]);

  // Auto-expand when running
  useEffect(() => {
    if (isRunning) setExpanded(true);
  }, [isRunning]);

  const Icon = TOOL_ICONS[toolCall.tool] || Wrench;

  return (
    <div className={`border rounded-lg my-2 transition-colors ${
      isRunning
        ? 'border-primary/30 bg-primary/5'
        : 'border-border bg-muted/50'
    }`}>
      <button
        type="button"
        className="w-full flex items-center gap-2 p-2.5 text-left"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
        )}
        {isRunning ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
        ) : (
          <Check className="w-3.5 h-3.5 text-green-500" />
        )}
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">{getToolLabel(toolCall.tool)}</span>
        {isRunning && toolCall.startTime && (
          <span className="text-xs text-muted-foreground ml-auto tabular-nums">{elapsed}s</span>
        )}
      </button>
      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          <div>
            <span className="text-xs text-muted-foreground">输入:</span>
            <pre className="mt-1 text-xs bg-background border border-border p-2 rounded overflow-auto font-mono">
              {JSON.stringify(toolCall.input, null, 2)}
            </pre>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">输出:</span>
            <pre className={`mt-1 text-xs p-2 rounded overflow-auto max-h-40 font-mono ${
              isRunning
                ? 'bg-zinc-900 text-zinc-400 border border-white/5'
                : 'bg-background border border-border'
            }`}>
              {toolCall.output || (isRunning ? '等待输出...' : '无输出')}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

function AgentWorkTimeline({ statusMessages, isStreaming }: { statusMessages: StatusEntry[]; isStreaming: boolean }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!isStreaming) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [isStreaming]);

  if (!statusMessages || statusMessages.length === 0) return null;

  // Show last N entries, collapse older ones
  const MAX_VISIBLE = 4;
  const visible = statusMessages.slice(-MAX_VISIBLE);
  const hiddenCount = statusMessages.length - visible.length;

  return (
    <div className="my-2 space-y-0">
      {hiddenCount > 0 && (
        <div className="flex items-center gap-2 py-1 pl-1">
          <div className="w-1 h-1 rounded-full bg-muted-foreground/30" />
          <span className="text-xs text-muted-foreground/50">
            ...{hiddenCount} 步已完成
          </span>
        </div>
      )}
      {visible.map((entry, i) => {
        const isLast = i === visible.length - 1;
        const isCurrent = isLast && isStreaming;
        const elapsed = Math.floor((now - entry.time) / 1000);
        // Detect subagent messages: "agentname: action"
        const subagentMatch = entry.message.match(/^(\w[\w-]*):\s/);
        const isSubagent = !!subagentMatch;
        const subagentName = subagentMatch?.[1] || '';
        const subagentAction = isSubagent ? entry.message.slice(subagentMatch![0].length) : entry.message;

        return (
          <div
            key={`${entry.time}-${i}`}
            className={`flex items-center gap-2.5 py-1 ${isSubagent ? 'pl-4' : ''}`}
          >
            {isCurrent ? (
              <Loader2 className="w-3 h-3 animate-spin text-primary shrink-0" />
            ) : isSubagent ? (
              <div className="w-1.5 h-1.5 rounded-full bg-blue-400/60 shrink-0" />
            ) : (
              <Check className="w-3 h-3 text-green-500/70 shrink-0" />
            )}
            {isSubagent && (
              <span className="text-xs text-blue-500/70 font-medium shrink-0">
                {subagentName}
              </span>
            )}
            <span className={`text-sm ${isCurrent ? 'text-foreground' : 'text-muted-foreground/70'}`}>
              {subagentAction}
            </span>
            {isCurrent && (
              <span className="text-xs text-muted-foreground/50 ml-auto tabular-nums">
                {elapsed}s
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PipelineProgress({ stages, isStreaming }: { stages: PipelineStage[]; isStreaming: boolean }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!isStreaming) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [isStreaming]);

  if (!stages || stages.length === 0) return null;

  return (
    <div className="my-3 space-y-0">
      {stages.map((stage, i) => {
        const isRunning = stage.status === 'running';
        const isDone = stage.status === 'done';
        const isFail = stage.status === 'fail';
        const isPending = stage.status === 'pending';
        const elapsed = stage.startTime
          ? Math.floor(((isDone || isFail ? stage.endTime! : now) - stage.startTime) / 1000)
          : 0;

        return (
          <div key={stage.id} className="flex items-start gap-3">
            {/* Vertical connector line + icon */}
            <div className="flex flex-col items-center shrink-0">
              {/* Connector from previous stage */}
              {i > 0 && (
                <div className={`w-px h-3 ${
                  isDone || isRunning ? 'bg-primary/40' : 'bg-border'
                }`} />
              )}
              {/* Stage icon */}
              {isRunning ? (
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
              ) : isDone ? (
                <CheckCircle2 className="w-4 h-4 text-green-500" />
              ) : isFail ? (
                <XCircle className="w-4 h-4 text-destructive" />
              ) : (
                <Circle className="w-4 h-4 text-muted-foreground/30" />
              )}
              {/* Connector to next stage */}
              {i < stages.length - 1 && (
                <div className={`w-px h-3 ${
                  isDone ? 'bg-primary/40' : 'bg-border'
                }`} />
              )}
            </div>

            {/* Stage content */}
            <div className={`py-0.5 min-w-0 flex-1 ${
              isPending ? 'opacity-40' : ''
            }`}>
              <div className="flex items-center gap-2">
                <span className={`text-sm ${
                  isRunning ? 'text-foreground font-medium' :
                  isDone ? 'text-muted-foreground' :
                  isFail ? 'text-destructive' :
                  'text-muted-foreground/50'
                }`}>
                  {stage.label}
                </span>
                {isRunning && (
                  <span className="text-xs text-muted-foreground tabular-nums">{elapsed}s</span>
                )}
                {isDone && stage.startTime && stage.endTime && (
                  <span className="text-xs text-muted-foreground/50 tabular-nums">
                    {Math.max(1, Math.round((stage.endTime - stage.startTime) / 1000))}s
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RetrievalCard({ retrievals }: { retrievals: RetrievalResult[] }) {
  const [expanded, setExpanded] = useState(false);

  if (!retrievals || retrievals.length === 0) return null;

  return (
    <div className="bg-primary/5 border border-primary/20 rounded-lg my-2">
      <button
        type="button"
        className="w-full flex items-center gap-2 p-2.5"
        onClick={() => setExpanded(!expanded)}
      >
        <Brain className="w-4 h-4 text-primary" />
        <span className="text-sm text-primary/80">
          正在回顾你的学习记录 ({retrievals.length} 条)
        </span>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-primary/70 ml-auto" />
        ) : (
          <ChevronRight className="w-4 h-4 text-primary/70 ml-auto" />
        )}
      </button>
      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          {retrievals.map((r, i) => (
            <div key={i} className="text-xs bg-primary/10 p-2 rounded">
              <div className="flex justify-between text-primary mb-1">
                <span>{r.source}</span>
                <span>{(r.score * 100).toFixed(0)}%</span>
              </div>
              <p className="text-foreground/80">{r.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatRelativeTime(iso?: string): string {
  if (!iso) return '';
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return '';
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  return new Date(iso).toLocaleString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function MessageBubble({
  message,
  onRegenerate,
  isLast,
}: {
  message: Message;
  onRegenerate?: () => void;
  isLast: boolean;
}) {
  const isUser = message.role === 'user';
  const { avatar } = useAvatar();
  const { skin } = usePetStore();

  // Generate AI avatar from pet spritesheet (first frame of idle)
  const getPetAvatarStyle = () => {
    if (!skin) return null;
    const { frameWidth, frameHeight, cols, rows } = skin.grid;
    const displaySize = 32; // Match the w-8 h-8 size
    const displayH = Math.round(displaySize * (frameHeight / frameWidth));
    return {
      width: displaySize,
      height: displayH,
      backgroundImage: `url(${skin.src})`,
      backgroundSize: `${displaySize * cols}px ${displayH * rows}px`,
      backgroundPosition: '0px 0px',
      backgroundRepeat: 'no-repeat',
    };
  };

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      <div
        className={`flex-shrink-0 w-8 h-8 rounded-md flex items-center justify-center overflow-hidden ${
          isUser
            ? 'bg-secondary text-foreground'
            : 'bg-foreground/10'
        }`}
        aria-hidden
      >
        {isUser ? (
          avatar ? (
            <img src={avatar} alt="用户头像" className="w-full h-full object-cover" />
          ) : (
            <User className="w-4 h-4" />
          )
        ) : skin ? (
          <div style={getPetAvatarStyle() || undefined} title={skin.name} />
        ) : (
          <Sparkles className="w-4 h-4" />
        )}
      </div>

      <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} min-w-0 group`}>
        <div
          className={`max-w-[92%] rounded-2xl px-4 py-3 ${
            isUser
              ? 'bg-primary text-primary-foreground'
              : 'bg-card text-card-foreground border border-border'
          }`}
        >
          {!isUser && message.retrievals && message.retrievals.length > 0 && (
            <RetrievalCard retrievals={message.retrievals} />
          )}

          {!isUser && message.toolCalls && message.toolCalls.length > 0 && (
            <div className="mb-2">
              {message.toolCalls.map((tc, i) => (
                <ToolCallBlock key={tc.id ?? `${tc.tool}-${i}`} toolCall={tc} />
              ))}
            </div>
          )}

          {/* Pipeline stage progress — shows 5-stage stepper during video generation */}
          {!isUser && message.pipelineStages && message.pipelineStages.some((s) => s.status !== 'pending') && (
            <PipelineProgress stages={message.pipelineStages} isStreaming={!!message.isStreaming} />
          )}

          {isUser ? (
            <div className="text-sm whitespace-pre-wrap break-words">{message.content}</div>
          ) : (
            <div className="min-w-0">
              {/* Agent work timeline - shows progress while streaming */}
              {message.isStreaming && message.statusMessages && message.statusMessages.length > 0 && (
                <AgentWorkTimeline
                  statusMessages={message.statusMessages}
                  isStreaming={message.isStreaming}
                />
              )}
              {/* Fallback thinking indicator when no status messages yet */}
              {message.isStreaming &&
                (!message.statusMessages || message.statusMessages.length === 0) &&
                (!message.toolCalls || message.toolCalls.length === 0) &&
                !message.content && (
                  <div className="flex items-center gap-2 text-muted-foreground py-1">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span className="text-sm">正在思考...</span>
                  </div>
                )}
              <MarkdownRenderer content={message.content || ''} />
              {message.isStreaming && message.content && (
                <span className="inline-block w-1 h-4 bg-current animate-pulse ml-0.5 align-middle" />
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 px-1">
          {!isUser && !message.isStreaming && message.content && (
            <MessageActions
              content={message.content}
              onRegenerate={isLast ? onRegenerate : undefined}
            />
          )}
          {message.timestamp && !message.isStreaming && (
            <span className="text-[10px] text-muted-foreground mt-1">
              {formatRelativeTime(message.timestamp)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function ChatView({
  sessionId,
  messages,
  onSendMessage,
  isLoading,
}: ChatViewProps) {
  const { state, actions } = useApp();
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerPrefillRef = useRef<((msg: string) => void) | null>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const prevLengthRef = useRef(messages.length);

  // Get current session title
  const currentSession = state.sessions.find(s => s.session_id === sessionId);
  const sessionTitle = currentSession?.title || sessionId;

  // Coder mode state
  const [chatMode, setChatMode] = useState<ChatMode>('chat');
  const [coderMessages, setCoderMessages] = useState<CoderMessage[]>([]);
  const [coderStreaming, setCoderStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Track whether user has scrolled away from bottom
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handler = () => {
      const threshold = 120;
      const near = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
      setIsNearBottom(near);
    };
    el.addEventListener('scroll', handler, { passive: true });
    handler();
    return () => el.removeEventListener('scroll', handler);
  }, []);

  // Smart auto-scroll: only follow new content if user was already near bottom.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const grew = messages.length > prevLengthRef.current;
    prevLengthRef.current = messages.length;
    if (isNearBottom || grew) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, isNearBottom]);

  const scrollToBottom = () => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

  const handleEmptyPrompt = (prompt: string) => {
    onSendMessage(prompt);
  };

  // Coder mode: send message to code_case_builder subagent
  const handleCoderSend = useCallback(async (message: string) => {
    const userMsg: CoderMessage = {
      id: `coder-user-${Date.now()}`,
      role: 'user',
      content: message,
    };
    const assistantMsg: CoderMessage = {
      id: `coder-assistant-${Date.now()}`,
      role: 'assistant',
      content: '',
      toolCalls: [],
      isStreaming: true,
    };

    setCoderMessages((prev) => [...prev, userMsg, assistantMsg]);
    setCoderStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    let fullContent = '';
    const toolCalls: ToolCall[] = [];

    try {
      // Prepend project path context if inside a project
      const fullMessage = state.coderProjectPath
        ? `【当前项目目录】${state.coderProjectPath}/\n（所有文件必须写入此目录下，项目之间相互隔离）\n\n${message}`
        : message;

      const stream = streamSubagent(
        { subagent: 'code_case_builder', message: fullMessage },
        controller.signal,
      );

      for await (const event of stream) {
        const eventType = (event as Record<string, unknown>).type as string;

        if (eventType === 'token') {
          const content = (event as Record<string, unknown>).content as string;
          fullContent += content;
          setCoderMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id ? { ...m, content: fullContent } : m,
            ),
          );
        } else if (eventType === 'tool_start') {
          const tool = (event as Record<string, unknown>).tool as string;
          const input = (event as Record<string, unknown>).input as Record<string, unknown>;
          const id = (event as Record<string, unknown>).id as string;

          toolCalls.push({ id, tool, input, output: '', status: 'running' });
          setCoderMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id ? { ...m, toolCalls: [...toolCalls] } : m,
            ),
          );

          // Stream code into Inspector on write_file for .py files
          if (tool === 'write_file' && input) {
            const path = input.path as string;
            const content = input.content as string;
            if (path && path.endsWith('.py') && content) {
              actions.loadCodeToInspector(content, path.split('/').pop() || 'code.py');
            }
          }
        } else if (eventType === 'tool_end') {
          const id = (event as Record<string, unknown>).id as string;
          const tc = toolCalls.find((t) => t.id === id);
          if (tc) tc.status = 'completed';
          setCoderMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id ? { ...m, toolCalls: [...toolCalls] } : m,
            ),
          );
        } else if (eventType === 'error') {
          const error = (event as Record<string, unknown>).error as string;
          fullContent += `\n\n**错误:** ${error}`;
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        fullContent += `\n\n**错误:** ${(err as Error).message}`;
      }
    } finally {
      setCoderMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsg.id ? { ...m, content: fullContent, isStreaming: false } : m,
        ),
      );
      setCoderStreaming(false);
      abortRef.current = null;
    }
  }, [actions, state.coderProjectPath]);

  const handleCoderStop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setCoderStreaming(false);
    setCoderMessages((prev) =>
      prev.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m)),
    );
  }, []);

  const activeMessages = chatMode === 'chat' ? messages : coderMessages;
  const activeIsLoading = chatMode === 'chat' ? isLoading : coderStreaming;
  const activeOnSend = chatMode === 'chat' ? onSendMessage : handleCoderSend;
  const activeOnStop = chatMode === 'chat' ? actions.stopStreaming : handleCoderStop;

  // Auto-scroll for coder messages
  const coderPrevLengthRef = useRef(coderMessages.length);
  useLayoutEffect(() => {
    if (chatMode !== 'coder') return;
    const el = scrollRef.current;
    if (!el) return;
    const grew = coderMessages.length > coderPrevLengthRef.current;
    coderPrevLengthRef.current = coderMessages.length;
    if (isNearBottom || grew) {
      el.scrollTop = el.scrollHeight;
    }
  }, [coderMessages, isNearBottom, chatMode]);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="px-6 py-3 border-b border-border bg-background/80 backdrop-blur">
        <h2 className="text-base font-semibold text-foreground truncate">{sessionTitle}</h2>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 md:px-6 py-6 relative"
      >
        {chatMode === 'chat' ? (
          messages.length === 0 ? (
            <EmptyChatState onSelectPrompt={handleEmptyPrompt} />
          ) : (
            <div className="max-w-3xl mx-auto space-y-5">
              {messages.map((msg, idx) => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  isLast={idx === messages.length - 1}
                  onRegenerate={actions.regenerateLastAssistant}
                />
              ))}
            </div>
          )
        ) : (
          <div className="max-w-3xl mx-auto space-y-5">
            {coderMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <Code className="w-12 h-12 mb-3 opacity-50" />
                <p className="text-sm font-medium">代码助手</p>
                <p className="text-xs mt-1">描述你想实现的功能，AI 会生成代码并加载到编辑器</p>
              </div>
            ) : (
              coderMessages.map((msg) => (
                <div key={msg.id} className="flex gap-3">
                  <div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center shrink-0 mt-0.5">
                    {msg.role === 'user' ? (
                      <User className="w-3.5 h-3.5 text-muted-foreground" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5 text-primary" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    {msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0 && (
                      <div className="mb-2 space-y-1">
                        {msg.toolCalls.map((tc) => (
                          <ToolCallBlock key={tc.id} toolCall={tc} />
                        ))}
                      </div>
                    )}
                    {msg.content && <MarkdownRenderer content={msg.content} />}
                    {msg.isStreaming && !msg.content && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>正在思考...</span>
                      </div>
                    )}
                    {msg.isStreaming && msg.content && (
                      <span className="inline-block w-1.5 h-4 bg-primary animate-pulse ml-0.5" />
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {!isNearBottom && activeMessages.length > 0 && (
          <button
            onClick={scrollToBottom}
            className="sticky bottom-4 float-right mr-1 bg-card border border-border rounded-full p-2 shadow-md hover:bg-accent transition-colors"
            aria-label="回到底部"
          >
            <ArrowDown className="w-4 h-4 text-foreground" />
          </button>
        )}
      </div>

      {/* Input */}
      <div className="p-4 border-t border-border bg-background/80 backdrop-blur">
        <div className="max-w-3xl mx-auto">
          <ComposerInput
            onSend={activeOnSend}
            onStop={activeOnStop}
            isLoading={activeIsLoading}
            chatMode={chatMode}
            onChatModeChange={setChatMode}
          />
        </div>
      </div>
    </div>
  );
}
