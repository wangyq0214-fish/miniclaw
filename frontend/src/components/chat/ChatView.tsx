'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, ChevronDown, ChevronRight, Brain } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Message, ToolCall, RetrievalResult } from '@/lib/store';

interface ChatViewProps {
  sessionId: string;
  messages: Message[];
  onSendMessage: (message: string) => void;
  isLoading: boolean;
}

function ToolCallBlock({ toolCall }: { toolCall: ToolCall }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg my-2">
      <div
        className="flex items-center gap-2 p-3 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-gray-500" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-500" />
        )}
        <span className="text-sm font-medium text-gray-700">
          工具: {toolCall.tool}
        </span>
      </div>
      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          <div>
            <span className="text-xs text-gray-500">输入:</span>
            <pre className="mt-1 text-xs bg-gray-100 p-2 rounded overflow-auto">
              {JSON.stringify(toolCall.input, null, 2)}
            </pre>
          </div>
          <div>
            <span className="text-xs text-gray-500">输出:</span>
            <pre className="mt-1 text-xs bg-gray-100 p-2 rounded overflow-auto max-h-40">
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
    <div className="bg-purple-50 border border-purple-200 rounded-lg my-2">
      <div
        className="flex items-center gap-2 p-3 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <Brain className="w-4 h-4 text-purple-600" />
        <span className="text-sm font-medium text-purple-700">
          记忆检索 ({retrievals.length} 条)
        </span>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-purple-500 ml-auto" />
        ) : (
          <ChevronRight className="w-4 h-4 text-purple-500 ml-auto" />
        )}
      </div>
      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          {retrievals.map((r, i) => (
            <div key={i} className="text-xs bg-purple-100/50 p-2 rounded">
              <div className="flex justify-between text-purple-600 mb-1">
                <span>{r.source}</span>
                <span>{(r.score * 100).toFixed(0)}%</span>
              </div>
              <p className="text-gray-700">{r.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 ${
          isUser
            ? 'bg-blue-500 text-white'
            : 'bg-gray-100 text-gray-800'
        }`}
      >
        {/* Retrieval Card */}
        {!isUser && message.retrievals && message.retrievals.length > 0 && (
          <RetrievalCard retrievals={message.retrievals} />
        )}

        {/* Tool Calls */}
        {!isUser && message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mb-2">
            {message.toolCalls.map((tc, i) => (
              <ToolCallBlock key={i} toolCall={tc} />
            ))}
          </div>
        )}

        {/* Content */}
        <div className="text-sm whitespace-pre-wrap">
          {message.content}
          {message.isStreaming && (
            <span className="inline-block w-1 h-4 bg-current animate-pulse ml-1" />
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
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      onSendMessage(input.trim());
      setInput('');
    }
  };

  return (
    <div className="flex flex-col h-full bg-white/50">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200/50 bg-white/80 backdrop-blur">
        <h2 className="text-lg font-semibold text-gray-800">{sessionId}</h2>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 py-12">
            <p className="text-lg">开始一段新对话</p>
            <p className="text-sm mt-2">输入消息与 Mini-OpenClaw 交流</p>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-gray-200/50 bg-white/80 backdrop-blur">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="输入消息..."
            className="flex-1 px-4 py-2 bg-gray-100 rounded-xl border-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isLoading}
          />
          <Button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="rounded-xl"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
