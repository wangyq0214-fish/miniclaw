'use client';

import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Brain,
  ArrowDown,
  Sparkles,
  User,
} from 'lucide-react';
import { Message, ToolCall, RetrievalResult, useApp } from '@/lib/store';
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

const TOOL_LABELS: Record<string, string> = {
  update_student_profile: '正在更新学习档案',
  read_file: '正在查阅资料',
  write_file: '正在保存内容',
  generate_lecture: '正在生成讲义',
  generate_exercises: '正在出练习题',
  evaluate_learning: '正在评估学习',
  generate_mindmap: '正在生成思维导图',
  generate_code_case: '正在生成代码案例',
  generate_reading_list: '正在生成阅读清单',
  generate_media_script: '正在生成视频脚本',
  answer_question: '正在解答问题',
};

function getToolLabel(tool: string): string {
  return TOOL_LABELS[tool] || '正在处理…';
}

function ToolCallBlock({ toolCall }: { toolCall: ToolCall }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-muted/50 border border-border rounded-lg my-2">
      <button
        type="button"
        className="w-full flex items-center gap-2 p-2.5 text-left"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
        <span className="text-sm text-muted-foreground">{getToolLabel(toolCall.tool)}</span>
      </button>
      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          <div>
            <span className="text-xs text-muted-foreground">输入:</span>
            <pre className="mt-1 text-xs bg-background border border-border p-2 rounded overflow-auto">
              {JSON.stringify(toolCall.input, null, 2)}
            </pre>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">输出:</span>
            <pre className="mt-1 text-xs bg-background border border-border p-2 rounded overflow-auto max-h-40">
              {toolCall.output}
            </pre>
          </div>
        </div>
      )}
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

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      <div
        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-primary/10 text-primary'
        }`}
        aria-hidden
      >
        {isUser ? <User className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
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

          {isUser ? (
            <div className="text-sm whitespace-pre-wrap break-words">{message.content}</div>
          ) : (
            <div className="min-w-0">
              <MarkdownRenderer content={message.content || ''} />
              {message.isStreaming && (
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
  const { actions } = useApp();
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerPrefillRef = useRef<((msg: string) => void) | null>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const prevLengthRef = useRef(messages.length);

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

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="px-6 py-3 border-b border-border bg-background/80 backdrop-blur">
        <h2 className="text-base font-semibold text-foreground truncate">{sessionId}</h2>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 md:px-6 py-6 relative"
      >
        {messages.length === 0 ? (
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
        )}

        {!isNearBottom && messages.length > 0 && (
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
            onSend={onSendMessage}
            onStop={actions.stopStreaming}
            isLoading={isLoading}
          />
        </div>
      </div>
    </div>
  );
}
