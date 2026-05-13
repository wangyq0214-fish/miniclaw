'use client';

import { Zap, RefreshCw } from 'lucide-react';
import { MarkdownRenderer } from '@/components/chat/MarkdownRenderer';

interface AiInsightCardProps {
  insightText: string;
  highlightTags: string[];
  actionItem: string;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export function AiInsightCard({ insightText, highlightTags, actionItem, onRefresh, isRefreshing }: AiInsightCardProps) {
  if (!insightText) {
    return (
      <div className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-800/80 rounded-2xl p-6 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3 text-gray-400">
          <Zap className="w-5 h-5" />
          <span className="text-sm">完成更多学习后，AI 将为你生成个性化洞察</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-r from-[#f0f4ff] to-[#f4faff] dark:from-blue-950/30 dark:to-indigo-950/20 rounded-2xl p-6 border border-blue-100 dark:border-blue-900/30 shadow-sm relative overflow-hidden">
      {/* Decorative glow */}
      <div className="absolute -right-4 -top-6 text-9xl opacity-[0.03] select-none pointer-events-none">
        ✨
      </div>

      <div className="flex gap-4">
        {/* Icon */}
        <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-md">
          <Zap className="w-5 h-5" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-base font-bold text-blue-900 dark:text-blue-200">AI 智能洞察与行动建议</h3>
            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={isRefreshing}
                className="p-1.5 rounded-lg hover:bg-blue-100/50 dark:hover:bg-blue-900/30 transition-colors text-blue-400 hover:text-blue-600"
                title="重新生成"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>
            )}
          </div>

          {/* Insight text */}
          <p className="text-sm text-blue-800 dark:text-blue-300 leading-relaxed mb-3">
            <MarkdownRenderer content={insightText} />
          </p>

          {/* Tags */}
          {highlightTags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {highlightTags.map((tag, i) => (
                <span
                  key={i}
                  className="px-2.5 py-1 text-xs font-medium rounded-full bg-blue-100/60 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Action item */}
          {actionItem && (
            <div className="mt-3 pt-3 border-t border-blue-100/50 dark:border-blue-800/30">
              <p className="text-sm text-blue-700 dark:text-blue-400">
                <span className="font-semibold">行动建议：</span>
                {actionItem}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
