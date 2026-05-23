'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Minus, MessageSquare, Wand2 } from 'lucide-react';
import { useEffect, useRef } from 'react';

export type ChatMode = 'chat' | 'generate';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  isStreaming?: boolean;
  mode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
}

export default function ChatPanel({ isOpen, onClose, messages, isStreaming, mode, onModeChange }: ChatPanelProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, x: -100, scale: 0.95 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: -100, scale: 0.95 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="absolute left-8 bottom-8 w-80 h-[600px] flex flex-col bg-white/70 backdrop-blur-md border border-indigo-100 rounded-3xl overflow-hidden shadow-2xl z-20"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-indigo-100/50 border-b border-indigo-200/30">
            <div className="flex items-center gap-1">
              {/* Mode Toggle */}
              <button
                onClick={() => onModeChange('chat')}
                className={`p-2 rounded-lg transition-colors ${
                  mode === 'chat'
                    ? 'bg-white text-indigo-600 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
                }`}
                aria-label="问答模式"
                title="问答模式"
              >
                <MessageSquare size={16} />
              </button>
              <button
                onClick={() => onModeChange('generate')}
                className={`p-2 rounded-lg transition-colors ${
                  mode === 'generate'
                    ? 'bg-white text-indigo-600 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
                }`}
                aria-label="生成模式"
                title="生成模式"
              >
                <Wand2 size={16} />
              </button>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-500 hover:text-slate-800 transition-colors rounded-full hover:bg-white/50"
              aria-label="收起对话"
            >
              <Minus size={18} />
            </button>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 text-sm gap-3">
                {mode === 'chat' ? (
                  <>
                    <p>开始对话...</p>
                    <div className="text-xs text-center bg-slate-100/50 rounded-lg p-3">
                      <p className="font-medium text-slate-500 mb-1">💬 问答模式</p>
                      <p>输入问题，AI 助手会为你解答</p>
                    </div>
                  </>
                ) : (
                  <>
                    <p>输入主题生成讲解</p>
                    <div className="text-xs text-center bg-slate-100/50 rounded-lg p-3">
                      <p className="font-medium text-slate-500 mb-1">✨ 生成模式</p>
                      <p>输入主题，自动生成讲解内容</p>
                      <p className="mt-1">例如: 深度学习优化算法</p>
                    </div>
                  </>
                )}
              </div>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                      message.role === 'user'
                        ? 'bg-white border border-slate-200/50 text-slate-800'
                        : 'bg-slate-50/50 text-slate-700'
                    }`}
                  >
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
                  </div>
                </div>
              ))
            )}
            {isStreaming && (
              <div className="flex justify-start">
                <div className="bg-slate-50/50 rounded-2xl px-4 py-2.5">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Pet Container at Bottom */}
          <div className="h-48 flex items-center justify-center border-t border-indigo-100/50 bg-gradient-to-b from-transparent to-indigo-50/30">
            <motion.div
              animate={{
                y: [0, -6, 0],
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: "easeInOut"
              }}
            >
              <span className="text-6xl">🤖</span>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
