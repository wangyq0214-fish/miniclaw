'use client';

import { useState, useEffect, useCallback } from 'react';
import { BookOpen, FlaskConical } from 'lucide-react';

interface Position {
  top: number;
  left: number;
}

export function SelectionToolbar() {
  const [text, setText] = useState('');
  const [pos, setPos] = useState<Position | null>(null);

  const hide = useCallback(() => {
    setText('');
    setPos(null);
  }, []);

  useEffect(() => {
    const handleMouseUp = () => {
      // Small delay to let selection finalize
      setTimeout(() => {
        const sel = window.getSelection();
        const selected = sel?.toString().trim() ?? '';
        if (!selected || selected.length < 2) {
          setText('');
          setPos(null);
          return;
        }

        // Only activate within the inspector content area
        const anchor = sel?.anchorNode;
        const container = anchor instanceof Node
          ? anchor.parentElement?.closest('[data-inspector-content]')
          : null;
        if (!container) {
          setText('');
          setPos(null);
          return;
        }

        const range = sel!.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();

        setText(selected);
        setPos({
          top: rect.top - containerRect.top - 40,
          left: rect.left - containerRect.left + rect.width / 2,
        });
      }, 10);
    };

    const handleMouseDown = (e: MouseEvent) => {
      // Hide when clicking outside the toolbar
      const target = e.target as HTMLElement;
      if (!target.closest('[data-selection-toolbar]')) {
        hide();
      }
    };

    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mousedown', handleMouseDown);
    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [hide]);

  if (!text || !pos) return null;

  const dispatch = (action: 'explain' | 'quiz') => {
    window.dispatchEvent(
      new CustomEvent('miniclaw:selection-action', {
        detail: { text, action },
      })
    );
    hide();
  };

  return (
    <div
      data-selection-toolbar
      className="absolute z-50 flex items-center gap-1 bg-gray-900 text-white text-xs rounded-lg shadow-lg px-1 py-1 -translate-x-1/2 pointer-events-auto"
      style={{ top: pos.top, left: pos.left }}
    >
      <button
        onClick={() => dispatch('explain')}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md hover:bg-gray-700 transition-colors whitespace-nowrap"
      >
        <BookOpen className="w-3.5 h-3.5" />
        解释此概念
      </button>
      <button
        onClick={() => dispatch('quiz')}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md hover:bg-gray-700 transition-colors whitespace-nowrap"
      >
        <FlaskConical className="w-3.5 h-3.5" />
        生成测验
      </button>
    </div>
  );
}
