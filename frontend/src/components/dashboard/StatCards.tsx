'use client';

import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Minus, Clock, Brain } from 'lucide-react';
import { getUserItem, setUserItem } from '@/lib/userStorage';

interface StatCardsProps {
  summaryScore: number;
  masteredPoints: number;
  highlightTags?: string[];
  previousScore?: number;
}

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}小时${minutes}分${seconds}秒`;
  if (minutes > 0) return `${minutes}分${seconds}秒`;
  return `${seconds}秒`;
}

// Track online duration with user-scoped localStorage persistence
const ONLINE_KEY = 'online_start';

function useOnlineDuration() {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let interval: NodeJS.Timeout | null = null;

    const startTracking = () => {
      const stored = getUserItem(ONLINE_KEY);
      if (stored) {
        const start = parseInt(stored, 10);
        setSeconds(Math.floor((Date.now() - start) / 1000));
      } else {
        setUserItem(ONLINE_KEY, String(Date.now()));
      }

      interval = setInterval(() => {
        const stored = getUserItem(ONLINE_KEY);
        if (stored) {
          const start = parseInt(stored, 10);
          setSeconds(Math.floor((Date.now() - start) / 1000));
        }
      }, 1000);
    };

    // 检查 miniclaw_user_id 是否已设置
    if (localStorage.getItem('miniclaw_user_id')) {
      startTracking();
    } else {
      // 轮询等待 user id 设置
      const waitTimer = setInterval(() => {
        if (localStorage.getItem('miniclaw_user_id')) {
          clearInterval(waitTimer);
          startTracking();
        }
      }, 200);

      return () => {
        clearInterval(waitTimer);
        if (interval) clearInterval(interval);
      };
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, []);

  return seconds;
}

export function StatCards({ summaryScore, masteredPoints, highlightTags, previousScore }: StatCardsProps) {
  const onlineSeconds = useOnlineDuration();
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
          在线时长
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-bold text-gray-900 dark:text-zinc-200">{formatDuration(onlineSeconds)}</span>
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
