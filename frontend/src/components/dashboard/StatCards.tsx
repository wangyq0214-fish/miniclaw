'use client';

import { TrendingUp, TrendingDown, Minus, Clock, Brain } from 'lucide-react';

interface StatCardsProps {
  summaryScore: number;
  effectiveHours: number;
  masteredPoints: number;
  previousScore?: number;
}

export function StatCards({ summaryScore, effectiveHours, masteredPoints, previousScore }: StatCardsProps) {
  const diff = previousScore != null ? summaryScore - previousScore : 0;
  const trend = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Composite Score */}
      <div className="bg-white dark:bg-zinc-900/50 dark:backdrop-blur-md rounded-2xl p-5 border border-gray-100 dark:border-white/10 shadow-sm dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] relative overflow-hidden">
        <div className="text-sm font-medium text-gray-500 dark:text-zinc-400 mb-2 flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center">
            <TrendingUp className="w-3 h-3 text-blue-500 dark:text-blue-400" />
          </div>
          当前综合评分
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-bold text-gray-900 dark:text-zinc-200">{summaryScore}</span>
          {previousScore != null && (
            <span className={`text-sm font-medium flex items-center ${
              trend === 'up' ? 'text-green-500' : trend === 'down' ? 'text-red-500' : 'text-gray-400'
            }`}>
              <TrendIcon className="w-3 h-3 mr-0.5" />
              {diff > 0 ? '+' : ''}{diff.toFixed(1)}%
            </span>
          )}
        </div>
        <div className="absolute -right-4 -bottom-4 opacity-[0.03]">
          <TrendingUp className="w-24 h-24" />
        </div>
      </div>

      {/* Effective Hours */}
      <div className="bg-white dark:bg-zinc-900/50 dark:backdrop-blur-md rounded-2xl p-5 border border-gray-100 dark:border-white/10 shadow-sm dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
        <div className="text-sm font-medium text-gray-500 dark:text-zinc-400 mb-2 flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-purple-100 dark:bg-purple-500/20 flex items-center justify-center">
            <Clock className="w-3 h-3 text-purple-500 dark:text-purple-400" />
          </div>
          有效学习时长
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-bold text-gray-900 dark:text-zinc-200">{effectiveHours}</span>
          <span className="text-sm text-gray-500 dark:text-zinc-400">小时</span>
        </div>
      </div>

      {/* Mastered Points */}
      <div className="bg-white dark:bg-zinc-900/50 dark:backdrop-blur-md rounded-2xl p-5 border border-gray-100 dark:border-white/10 shadow-sm dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
        <div className="text-sm font-medium text-gray-500 dark:text-zinc-400 mb-2 flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-teal-100 dark:bg-teal-500/20 flex items-center justify-center">
            <Brain className="w-3 h-3 text-teal-500 dark:text-teal-400" />
          </div>
          掌握知识点
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-bold text-gray-900 dark:text-zinc-200">{masteredPoints}</span>
          <span className="text-sm text-gray-500 dark:text-zinc-400">个</span>
        </div>
      </div>
    </div>
  );
}
