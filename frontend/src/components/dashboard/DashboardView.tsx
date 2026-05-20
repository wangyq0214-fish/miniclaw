'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Loader2, AlertCircle, RefreshCw, ArrowLeft } from 'lucide-react';
import { generateProfile, initProfile, type StudentProfile } from '@/lib/api';
import { useApp } from '@/lib/store';
import { StatCards } from './StatCards';
import { RadarChart } from './RadarChart';
import { AiInsightCard } from './AiInsightCard';
import { ColdStartForm } from './ColdStartForm';
import { MasteryGraph } from './MasteryGraph';

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
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchProfile = useCallback(async (forceRefresh = false) => {
    try {
      setError(null);
      if (forceRefresh) setIsRefreshing(true);
      else setLoading(true);

      const result = await generateProfile(forceRefresh);
      setProfile(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleColdStart = async (major: string, goal: string, grade?: string) => {
    try {
      await initProfile(major, goal, grade);
      // After init, regenerate profile
      await fetchProfile(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : '初始化失败');
    }
  };

  // Compute mastered points from profile
  const masteredPoints = profile?.dimensions.knowledge_foundation.concepts?.length ?? 0;

  // Loading skeleton
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          <p className="text-sm text-gray-500">正在分析你的学习数据...</p>
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
            onClick={() => fetchProfile()}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  // Cold start: show onboarding form
  if (profile?.needs_onboarding) {
    return (
      <div className="flex-1 overflow-y-auto bg-[#fbfbfc] dark:bg-zinc-950 p-6 md:p-10 flex items-center justify-center">
        <ColdStartForm onSubmit={handleColdStart} />
      </div>
    );
  }

  if (!profile) return null;

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
            <h1 className="text-2xl font-bold text-gray-900 dark:text-zinc-200">学习画像分析</h1>
            <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1">
              基于你的对话、练习和学习记录自动生成
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => fetchProfile(true)}
              disabled={isRefreshing}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors text-gray-400 hover:text-gray-600 dark:text-zinc-400 dark:hover:text-zinc-200"
              title="刷新画像"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </motion.header>

        {/* Stat Cards */}
        <motion.div custom={1} variants={fadeUp} initial="hidden" animate="visible">
          <StatCards
            summaryScore={profile.overall_score}
            masteredPoints={masteredPoints}
            highlightTags={profile.highlight_tags}
          />
        </motion.div>

        {/* Radar Chart + Insight Row */}
        <motion.div
          custom={2}
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 lg:grid-cols-2 gap-6"
        >
          {/* Radar Chart */}
          <div className="bg-white dark:bg-zinc-900/50 dark:backdrop-blur-md rounded-2xl p-6 border border-gray-100 dark:border-white/10 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] flex flex-col">
            <h3 className="text-base font-bold text-gray-800 dark:text-zinc-200 mb-4">多维学习画像</h3>
            <div className="flex-1 relative w-full flex items-center justify-center min-h-[300px]">
              <RadarChart profile={profile} />
            </div>
          </div>

          {/* Dimension Details */}
          <div className="bg-white dark:bg-zinc-900/50 dark:backdrop-blur-md rounded-2xl p-6 border border-gray-100 dark:border-white/10 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] flex flex-col">
            <h3 className="text-base font-bold text-gray-800 dark:text-zinc-200 mb-4">维度详情</h3>
            <div className="flex-1 space-y-3 overflow-y-auto">
              {Object.entries(profile.dimensions).map(([key, dim]) => {
                const DIMENSION_LABELS: Record<string, string> = {
                  knowledge_foundation: '知识基础',
                  cognitive_style: '认知风格',
                  error_patterns: '易错分析',
                  learning_rhythm: '学习节奏',
                  affective_state: '情感态度',
                  goal_progress: '目标达成',
                };
                const label = DIMENSION_LABELS[key] || key;
                const detail = dim.summary || dim.style || dim.mood || dim.pace || dim.progress || '';
                return (
                  <div key={key} className="flex items-center gap-3">
                    <div className="w-20 text-xs font-medium text-gray-500 dark:text-zinc-400 shrink-0">
                      {label}
                    </div>
                    <div className="flex-1 h-2 bg-gray-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${dim.score}%` }}
                        transition={{ duration: 0.8, ease: 'easeOut' }}
                        className="h-full bg-blue-500 rounded-full"
                      />
                    </div>
                    <div className="w-10 text-right text-sm font-semibold text-gray-700 dark:text-zinc-300">
                      {dim.score}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </motion.div>

        {/* Knowledge Graph */}
        <motion.div custom={3} variants={fadeUp} initial="hidden" animate="visible">
          <div className="bg-white dark:bg-zinc-900/50 dark:backdrop-blur-md rounded-2xl p-6 border border-gray-100 dark:border-white/10 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
            <h3 className="text-base font-bold text-gray-800 dark:text-zinc-200 mb-4">知识图谱</h3>
            <div className="h-[400px]">
              <MasteryGraph graph={profile.knowledge_graph} />
            </div>
          </div>
        </motion.div>

        {/* AI Insight */}
        <motion.div custom={4} variants={fadeUp} initial="hidden" animate="visible">
          <AiInsightCard
            insightText={profile.insight_text}
            highlightTags={profile.highlight_tags}
            actionItem={profile.action_item}
            onRefresh={() => fetchProfile(true)}
            isRefreshing={isRefreshing}
          />
        </motion.div>
      </div>
    </div>
  );
}
