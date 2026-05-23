'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useMemo, useEffect, useRef } from 'react';

interface ContentBlock {
  id: string;
  type: 'title' | 'insight' | 'formula' | 'list' | 'code' | 'text';
  content: string | string[];
  metadata?: Record<string, any>;
}

interface ContentCanvasProps {
  blocks: ContentBlock[];
  isStreaming: boolean;
  currentBlockIndex?: number;
}

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] }
  }
};

export default function ContentCanvas({ blocks, isStreaming, currentBlockIndex }: ContentCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeBlockRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to current block (teleprompter mode)
  useEffect(() => {
    if (activeBlockRef.current && currentBlockIndex !== undefined) {
      activeBlockRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [currentBlockIndex]);

  const renderBlock = (block: ContentBlock) => {
    switch (block.type) {
      case 'title':
        const level = block.metadata?.level || 1;
        if (level === 1) {
          return (
            <h1 className="text-4xl md:text-5xl font-semibold text-slate-800 bg-indigo-50/50 inline-block px-6 py-2 rounded-2xl">
              {block.content}
            </h1>
          );
        } else if (level === 2) {
          return (
            <h2 className="text-3xl md:text-4xl font-semibold text-slate-800 mt-8">
              {block.content}
            </h2>
          );
        } else {
          return (
            <h3 className="text-2xl md:text-3xl font-medium text-slate-700 mt-6">
              {block.content}
            </h3>
          );
        }

      case 'insight':
        return (
          <div className="bg-indigo-50/80 rounded-2xl p-6 max-w-xl mx-auto shadow-sm border border-indigo-100/50">
            <h2 className="text-indigo-600 font-medium mb-2 flex items-center gap-2">
              💡 关键洞察
            </h2>
            <p className="text-slate-700">{block.content}</p>
          </div>
        );

      case 'formula':
        return (
          <div className="bg-slate-50 rounded-xl p-6 max-w-2xl mx-auto border border-slate-200">
            <pre className="text-slate-800 font-mono text-sm overflow-x-auto">
              {block.content}
            </pre>
          </div>
        );

      case 'list':
        const items = Array.isArray(block.content) ? block.content : [block.content];
        return (
          <ul className="space-y-3 max-w-2xl mx-auto">
            {items.map((item, i) => (
              <motion.li
                key={i}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className="flex items-start gap-3 text-slate-700"
              >
                <span className="text-indigo-500 mt-1">•</span>
                <span>{item}</span>
              </motion.li>
            ))}
          </ul>
        );

      case 'code':
        const language = block.metadata?.language || 'text';
        return (
          <div className="bg-slate-900 rounded-xl p-6 max-w-3xl mx-auto">
            <div className="text-slate-400 text-xs mb-2">{language}</div>
            <pre className="text-slate-100 font-mono text-sm overflow-x-auto">
              <code>{block.content}</code>
            </pre>
          </div>
        );

      case 'text':
        return (
          <p className="text-slate-700 text-lg leading-relaxed max-w-2xl mx-auto">
            {block.content}
          </p>
        );

      default:
        return null;
    }
  };

  return (
    <main
      ref={containerRef}
      className="absolute inset-0 top-16 bottom-0 overflow-y-auto px-4 pt-[40vh] pb-[40vh]"
    >
      <div className="max-w-3xl w-full mx-auto space-y-16">
        <AnimatePresence mode="popLayout">
          {blocks.map((block, index) => {
            const isActive = currentBlockIndex !== undefined
              ? index === currentBlockIndex
              : index === blocks.length - 1; // Default to last block if no currentBlockIndex

            return (
              <motion.div
                key={block.id}
                ref={isActive ? activeBlockRef : null}
                custom={index}
                variants={fadeUp}
                initial="hidden"
                animate={{
                  opacity: isActive ? 1 : 0.3,
                  scale: isActive ? 1 : 0.95,
                  y: 0
                }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
                className="mb-8 text-center"
              >
                {renderBlock(block)}
              </motion.div>
            );
          })}
        </AnimatePresence>

        {isStreaming && blocks.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-slate-400 text-lg text-center"
          >
            正在生成内容...
          </motion.div>
        )}
      </div>
    </main>
  );
}
