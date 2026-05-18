'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Loader2, AlertCircle, RefreshCw, ArrowLeft } from 'lucide-react';
import { getDashboardData, type DashboardData } from '@/lib/api';
import { useApp } from '@/lib/store';
import { StatCards } from './StatCards';
import { RadarChart } from './RadarChart';
import { TrendLineChart } from './TrendLineChart';
import { AiInsightCard } from './AiInsightCard';
import { SubjectFilter } from './SubjectFilter';

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.4, ease: [0.4, 0, 0.2, 1] as const },
  }),
};

export function DashboardView() {
  const { actions } = useApp();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSubject, setSelectedSubject] = useState('全部学科');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchData = useCallback(async (forceRefresh = false) => {
    try {
      setError(null);
      if (forceRefresh) setIsRefreshing(true);
      else setLoading(true);

      const result = await getDashboardData(7);
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Extract unique subjects from trend data (for filter)
  const subjects: string[] = [];

  // Loading skeleton
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          <p className="text-sm text-gray-500">正在加载学习分析数据...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <AlertCircle className="w-8 h-8 text-red-400" />
          <p className="text-sm text-gray-500">{error}</p>
          <button
            onClick={() => fetchData()}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="flex-1 overflow-y-auto bg-[#fbfbfc] dark:bg-zinc-950 p-6 md:p-10">
      <div className="max-w-6xl mx-auto flex flex-col gap-6">
        {/* Header */}
        <motion.header
          custom={0}
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2"
        >
          <div>
            <div className="flex items-center gap-3 mb-1">
              <button
                onClick={() => actions.setActiveTab('learning-path')}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                返回
              </button>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-zinc-200">学习效果评估与能力分析</h1>
            <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1">
              基于你最近的学习记录与测试表现生成的智能洞察
              {data.cached && <span className="ml-2 text-xs text-gray-400">(缓存数据)</span>}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {subjects.length > 0 && (
              <SubjectFilter
                subjects={subjects}
                selected={selectedSubject}
                onSelect={setSelectedSubject}
              />
            )}
            <button
              onClick={() => fetchData(true)}
              disabled={isRefreshing}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors text-gray-400 hover:text-gray-600 dark:text-zinc-400 dark:hover:text-zinc-200"
              title="刷新数据"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </motion.header>

        {/* Stat Cards */}
        <motion.div custom={1} variants={fadeUp} initial="hidden" animate="visible">
          <StatCards
            summaryScore={data.summary_score}
            effectiveSeconds={data.effective_seconds}
            masteredPoints={data.mastered_points}
          />
        </motion.div>

        {/* Charts Row */}
        <motion.div
          custom={2}
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 lg:grid-cols-2 gap-6"
        >
          {/* Radar Chart */}
          <div className="bg-white dark:bg-zinc-900/50 dark:backdrop-blur-md rounded-2xl p-6 border border-gray-100 dark:border-white/10 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] flex flex-col">
            <h3 className="text-base font-bold text-gray-800 dark:text-zinc-200 mb-4">多维能力图谱</h3>
            <div className="flex-1 relative w-full flex items-center justify-center min-h-[300px]">
              <RadarChart scores={data.radar_scores} />
            </div>
          </div>

          {/* Trend Line Chart */}
          <div className="bg-white dark:bg-zinc-900/50 dark:backdrop-blur-md rounded-2xl p-6 border border-gray-100 dark:border-white/10 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] flex flex-col">
            <h3 className="text-base font-bold text-gray-800 dark:text-zinc-200 mb-4">近 7 天学习得分趋势</h3>
            <div className="flex-1 relative w-full min-h-[300px]">
              <TrendLineChart data={data.trend_scores} />
            </div>
          </div>
        </motion.div>

        {/* AI Insight */}
        <motion.div custom={3} variants={fadeUp} initial="hidden" animate="visible">
          <AiInsightCard
            insightText={data.insight_text}
            highlightTags={data.highlight_tags}
            actionItem={data.action_item}
            onRefresh={() => fetchData(true)}
            isRefreshing={isRefreshing}
          />
        </motion.div>
      </div>
    </div>
  );
}
