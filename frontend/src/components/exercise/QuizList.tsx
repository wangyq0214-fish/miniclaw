'use client';

import { FileQuestion, Loader2, MoreVertical } from 'lucide-react';

interface QuizItem {
  id: string;
  title: string;
  sourceCount: number;
  timeAgo: string;
}

interface QuizListProps {
  quizList: QuizItem[];
  generating?: boolean;
  generatingSourceCount?: number;
  onSelect?: (id: string) => void;
}

function GeneratingCard({ sourceCount }: { sourceCount: number }) {
  return (
    <div className="flex items-center gap-3 py-3 px-4 rounded-xl bg-gradient-to-r from-slate-50 to-white">
      <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
        <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800">正在生成测验...</p>
        <p className="text-xs text-gray-500 mt-0.5">基于 {sourceCount} 个来源</p>
      </div>
    </div>
  );
}

function QuizRow({ item, onSelect }: { item: QuizItem; onSelect?: (id: string) => void }) {
  return (
    <button
      onClick={() => onSelect?.(item.id)}
      className="w-full flex items-center gap-3 py-3 px-4 rounded-xl hover:bg-gray-50/80 transition-colors text-left group"
    >
      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
        <FileQuestion className="w-4 h-4 text-slate-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{item.title}</p>
        <p className="text-xs text-gray-500 mt-0.5">
          {item.sourceCount} 个来源 · {item.timeAgo}
        </p>
      </div>
      <button
        onClick={e => e.stopPropagation()}
        className="p-1 rounded-md text-gray-400 opacity-0 group-hover:opacity-100 hover:text-gray-600 hover:bg-gray-100 transition-all"
      >
        <MoreVertical className="w-4 h-4" />
      </button>
    </button>
  );
}

export function QuizList({ quizList, generating, generatingSourceCount = 0, onSelect }: QuizListProps) {
  return (
    <div className="flex flex-col gap-1">
      {generating && <GeneratingCard sourceCount={generatingSourceCount} />}
      {quizList.map(item => (
        <QuizRow key={item.id} item={item} onSelect={onSelect} />
      ))}
      {!generating && quizList.length === 0 && (
        <div className="py-8 text-center text-xs text-gray-400">暂无测验</div>
      )}
    </div>
  );
}
