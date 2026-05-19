'use client';

import { useState, useEffect } from 'react';
import { Trash2, ChevronDown, ChevronUp, BookMarked } from 'lucide-react';
import { MarkdownRenderer } from '@/components/chat/MarkdownRenderer';
import { getMistakes, removeMistake, clearMistakes, type MistakeEntry } from '@/lib/mistakeBook';

export function MistakeBook() {
  const [mistakes, setMistakes] = useState<MistakeEntry[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    setMistakes(getMistakes());
  }, []);

  const handleRemove = (questionId: string) => {
    removeMistake(questionId);
    setMistakes(prev => prev.filter(m => m.question_id !== questionId));
  };

  const handleClear = () => {
    clearMistakes();
    setMistakes([]);
  };

  if (mistakes.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <BookMarked className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p className="text-sm font-medium">错题本为空</p>
          <p className="text-xs mt-1">做题时答错的题目会自动收录到这里</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-sm font-medium text-muted-foreground">
          共 {mistakes.length} 道错题
        </span>
        <button
          onClick={handleClear}
          className="text-xs text-muted-foreground hover:text-destructive transition-colors"
        >
          清空全部
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {mistakes.map((m) => {
          const isExpanded = expandedId === m.question_id;

          return (
            <div
              key={m.question_id}
              className="rounded-xl border border-border bg-card overflow-hidden"
            >
              {/* Question header */}
              <div
                onClick={() => setExpandedId(isExpanded ? null : m.question_id)}
                className="w-full text-left p-4 hover:bg-muted/30 transition-colors cursor-pointer"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setExpandedId(isExpanded ? null : m.question_id); }}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium line-clamp-2">
                      <MarkdownRenderer content={m.question_text_md} />
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                        {m.difficulty}
                      </span>
                      {m.topic && (
                        <span className="text-xs text-muted-foreground truncate">
                          {m.topic}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground ml-auto shrink-0">
                        {new Date(m.added_at).toLocaleDateString('zh-CN')}
                      </span>
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemove(m.question_id);
                      }}
                      className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      title="移除"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                </div>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
                  {/* Options */}
                  {m.options.map((opt) => {
                    const isCorrect = opt.is_correct;
                    const isUserSelected = opt.id === m.user_selected_id;

                    let containerClass = 'bg-muted/30 dark:bg-neutral-800/50';
                    let idClass = 'text-muted-foreground';
                    let textClass = '';
                    let badgeClass = '';

                    if (isCorrect) {
                      containerClass = 'bg-green-50 dark:bg-emerald-500/10 border border-green-200 dark:border-emerald-500/30';
                      idClass = 'text-green-600 dark:text-emerald-400';
                      textClass = 'text-green-800 dark:text-emerald-300';
                      badgeClass = 'text-green-600 dark:text-emerald-400';
                    } else if (isUserSelected) {
                      containerClass = 'bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30';
                      idClass = 'text-red-500 dark:text-red-400';
                      textClass = 'text-red-800 dark:text-red-300';
                      badgeClass = 'text-red-500 dark:text-red-400';
                    }

                    return (
                      <div key={opt.id} className={`rounded-lg p-3 ${containerClass}`}>
                        <div className="flex items-start gap-2">
                          <span className={`text-xs font-medium shrink-0 w-4 ${idClass}`}>
                            {opt.id}
                          </span>
                          <div className={`flex-1 text-sm ${textClass}`}>
                            <MarkdownRenderer content={opt.text_md} />
                          </div>
                          {isCorrect && (
                            <span className={`text-xs font-medium shrink-0 ${badgeClass}`}>正确</span>
                          )}
                          {isUserSelected && !isCorrect && (
                            <span className={`text-xs font-medium shrink-0 ${badgeClass}`}>你的选择</span>
                          )}
                        </div>
                        {(isCorrect || isUserSelected) && opt.explanation_md && (
                          <div className="mt-2 ml-6 text-xs text-muted-foreground">
                            <MarkdownRenderer content={opt.explanation_md} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
