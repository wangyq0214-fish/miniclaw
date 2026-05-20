'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, ChevronRight, RotateCcw, Check, X,
  Sparkles, Eye, Lightbulb, Tag,
} from 'lucide-react';
import { MarkdownRenderer } from '@/components/chat/MarkdownRenderer';
import { logFlashcardReview } from '@/lib/learningEvents';
import { getUserItem, setUserItem } from '@/lib/userStorage';
import { useApp } from '@/lib/store';
import { saveLearningProgress } from '@/lib/api';

interface Flashcard {
  id: string;
  front: string;
  back: string;
  difficulty: string;
  category: string;
  tags: string[];
}

interface FlashcardData {
  topic: string;
  total: number;
  difficulty_distribution: Record<string, number>;
  generated_at: string;
  generated_by: string;
  covered_topics: string[];
  recommended_topics: string[];
  cards: Flashcard[];
}

interface FlashcardViewerProps {
  content: string;
  onClose?: () => void;
  /** When set, emits a learning map completion event on flashcard review finish */
  nodeId?: string;
  /** File path — used as fallback identifier when nodeId is not available */
  filePath?: string;
}

const difficultyColors: Record<string, string> = {
  '基础': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  '中等': 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  '困难': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

const categoryIcons: Record<string, typeof Lightbulb> = {
  '概念': Lightbulb,
  '原理': Sparkles,
  '对比': Eye,
  '应用': Tag,
  '公式': Tag,
};

export function FlashcardViewer({ content, onClose, nodeId, filePath }: FlashcardViewerProps) {
  const { actions } = useApp();
  const effectiveNodeId = nodeId || (filePath ? `file:${filePath}` : undefined);
  const [data, setData] = useState<FlashcardData | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [mastered, setMastered] = useState<Record<string, boolean>>({});
  const [parseError, setParseError] = useState<string | null>(null);
  const [hidePreviousResult, setHidePreviousResult] = useState(false);

  // Synchronously compute previous completion result from localStorage
  const previousResult = useMemo(() => {
    if (hidePreviousResult || !effectiveNodeId || typeof window === 'undefined') return null;
    try {
      const results = JSON.parse(getUserItem('miniclaw_learning_results') || '{}');
      const r = results[`${effectiveNodeId}:flashcard`];
      if (r?.completed) return r;
      if (filePath) {
        const paths: Record<string, string> = JSON.parse(getUserItem('miniclaw_gen_paths') || '{}');
        for (const [key, fp] of Object.entries(paths)) {
          if (fp === filePath) {
            const origNodeId = key.split(':')[0];
            const r2 = results[`${origNodeId}:flashcard`];
            if (r2?.completed) return r2;
            break;
          }
        }
      }
      return null;
    } catch {
      return null;
    }
  }, [effectiveNodeId, content, hidePreviousResult, filePath]);

  // Completion page state
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);

  const toggleTopic = useCallback((topic: string) => {
    setSelectedTopics(prev =>
      prev.includes(topic) ? prev.filter(t => t !== topic) : [...prev, topic]
    );
  }, []);

  const handleGenerateNew = useCallback(async () => {
    if (selectedTopics.length === 0) return;
    const topicPrompt = selectedTopics.join('、');
    const message = `请生成抽认卡，主题：${topicPrompt}。输出 JSON 文件到 workspace/generated/flashcards/ 目录。`;
    const taskId = `task-${Date.now()}`;
    actions.addGeneratingTask({
      id: taskId,
      category: 'flashcards',
      categoryLabel: '抽认卡',
      prompt: topicPrompt,
      status: 'generating',
      startedAt: Date.now(),
    });
    try {
      const { streamSubagent } = await import('@/lib/api');
      for await (const event of streamSubagent({ subagent: 'flashcard_composer', message })) {
        if (event.type === 'done') break;
      }
      actions.updateGeneratingTask(taskId, { status: 'completed' });
      actions.incrementFilesVersion();
      setTimeout(() => actions.removeGeneratingTask(taskId), 10000);
    } catch (err) {
      actions.updateGeneratingTask(taskId, {
        status: 'error',
        error: err instanceof Error ? err.message : '未知错误',
      });
    }
  }, [selectedTopics, actions]);

  // Parse content
  useEffect(() => {
    function parseWithRepair(raw: string): FlashcardData | null {
      try { return JSON.parse(raw); } catch {}
      // Repair unescaped LaTeX backslashes: \s \f \t \m \a etc → \\s \\f etc
      const repaired = raw.replace(/\\(?!["\\/bfnrtu])/g, '\\\\');
      try { return JSON.parse(repaired); } catch {}
      return null;
    }
    const parsed = parseWithRepair(content);
    if (!parsed) {
      setParseError('JSON 解析失败');
      return;
    }
    if (!parsed.cards || !Array.isArray(parsed.cards)) {
      setParseError('JSON 缺少 cards 数组');
      return;
    }
    setData(parsed);
    setCurrentIndex(0);
    setIsFlipped(false);
    setMastered({});
    setHidePreviousResult(false);
    setParseError(null);
  }, [content]);

  const cards = data?.cards ?? [];
  const currentCard = cards[currentIndex];

  const handleFlip = useCallback(() => {
    setIsFlipped(prev => !prev);
  }, []);

  const handleNext = useCallback(() => {
    if (currentIndex < cards.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setIsFlipped(false);
    }
  }, [currentIndex, cards.length]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
      setIsFlipped(false);
    }
  }, [currentIndex]);

  const handleMarkMastered = useCallback((cardId: string) => {
    setMastered(prev => ({ ...prev, [cardId]: true }));
    logFlashcardReview({ cardId, mastered: true, category: currentCard?.category ?? '' });
    if (currentIndex < cards.length - 1) {
      setTimeout(() => {
        setCurrentIndex(prev => prev + 1);
        setIsFlipped(false);
      }, 300);
    }
  }, [currentIndex, cards.length, currentCard?.category]);

  const handleMarkUnmastered = useCallback((cardId: string) => {
    setMastered(prev => ({ ...prev, [cardId]: false }));
    logFlashcardReview({ cardId, mastered: false, category: currentCard?.category ?? '' });
    if (currentIndex < cards.length - 1) {
      setTimeout(() => {
        setCurrentIndex(prev => prev + 1);
        setIsFlipped(false);
      }, 300);
    }
  }, [currentIndex, cards.length, currentCard?.category]);

  const handleRestart = useCallback(() => {
    setCurrentIndex(0);
    setIsFlipped(false);
    setMastered({});
    setHidePreviousResult(true);
  }, []);

  // Stats
  const { masteredCount, unmasteredCount, progressPercent } = useMemo(() => {
    const m = Object.values(mastered).filter(Boolean).length;
    const u = cards.length - m;
    const p = cards.length > 0 ? Math.round((m / cards.length) * 100) : 0;
    return { masteredCount: m, unmasteredCount: u, progressPercent: p };
  }, [mastered, cards.length]);

  const allReviewed = cards.length > 0 && cards.every(c => mastered[c.id] !== undefined);
  const showCompletion = allReviewed && currentIndex === cards.length - 1 && mastered[currentCard?.id] !== undefined;

  // Persist flashcard completion to learning map (localStorage + backend)
  useEffect(() => {
    if (showCompletion && effectiveNodeId && data) {
      // Find original learning map nodeId if this file was generated from there
      let originalNodeId: string | undefined;
      try {
        const paths: Record<string, string> = JSON.parse(getUserItem('miniclaw_gen_paths') || '{}');
        for (const [key, fp] of Object.entries(paths)) {
          if (fp === filePath) { originalNodeId = key.split(':')[0]; break; }
        }
      } catch {}
      const nodeIds = [effectiveNodeId];
      if (originalNodeId && originalNodeId !== effectiveNodeId) nodeIds.push(originalNodeId);
      try {
        const actions = JSON.parse(getUserItem('miniclaw_learning_actions') || '{}');
        const results = JSON.parse(getUserItem('miniclaw_learning_results') || '{}');
        for (const nid of nodeIds) {
          actions[nid] = { ...(actions[nid] || {}), flashcard: 'completed' };
          results[`${nid}:flashcard`] = {
            completed: true, score: progressPercent, total: cards.length,
            correct: masteredCount, completedAt: new Date().toISOString(), filePath: '',
          };
        }
        setUserItem('miniclaw_learning_actions', JSON.stringify(actions));
        setUserItem('miniclaw_learning_results', JSON.stringify(results));
      } catch {}
      saveLearningProgress({
        node_id: originalNodeId || effectiveNodeId,
        action: 'flashcard',
        phase: 'completed',
        score: progressPercent,
        total: cards.length,
        correct: masteredCount,
      }).catch(() => {});
    }
  }, [showCompletion, effectiveNodeId, data, progressPercent, cards.length, masteredCount]);

  // Early returns AFTER all hooks
  if (!currentCard) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">加载抽认卡中...</p>
      </div>
    );
  }

  if (parseError) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-red-500 text-sm">{parseError}</p>
      </div>
    );
  }

  if (!data || cards.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">加载抽认卡中...</p>
      </div>
    );
  }

  // ── Previously Completed Screen ──
  if (previousResult && Object.keys(mastered).length === 0) {
    const prevPct = previousResult.total > 0
      ? Math.round((previousResult.correct / previousResult.total) * 100) : 0;
    const radius = 40;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (prevPct / 100) * circumference;

    return (
      <div className="flex flex-col h-full items-center justify-center p-6">
        <div className="w-full max-w-md bg-white dark:bg-card rounded-2xl border border-gray-100 dark:border-border p-6 space-y-5 text-center">
          <div className="flex items-center justify-center gap-2 text-emerald-600 dark:text-emerald-400">
            <Check className="w-5 h-5" />
            <span className="text-lg font-bold">抽认卡已复习完成</span>
          </div>

          <div className="relative flex items-center justify-center">
            <svg width="120" height="120" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="12" />
              <circle
                cx="50" cy="50" r={radius} fill="none"
                stroke={prevPct >= 60 ? '#16a34a' : '#dc2626'}
                strokeWidth="12" strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                transform="rotate(-90 50 50)"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-gray-900 dark:text-zinc-200">
                {previousResult.correct}/{previousResult.total}
              </span>
              <span className="text-xs text-gray-500 dark:text-zinc-400">{prevPct}%</span>
            </div>
          </div>

          <p className="text-sm text-gray-500 dark:text-zinc-400">
            掌握 {previousResult.correct} 张 · 需复习 {previousResult.total - previousResult.correct} 张
          </p>

          <div className="flex gap-3 justify-center">
            <button
              onClick={handleRestart}
              className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-full hover:bg-blue-700 transition-colors"
            >
              重新复习
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Completion Screen (just finished)
  if (showCompletion) {
    const topics = data.covered_topics?.length
      ? data.covered_topics
      : cards.map(c => c.front).slice(0, 6);
    const recommendedTopics = data.recommended_topics?.length
      ? data.recommended_topics
      : ['深入理解', '实践练习', '扩展阅读'];

    return (
      <div className="flex flex-col h-full items-center justify-center p-6">
        <div className="w-full max-w-2xl bg-white dark:bg-zinc-900/50 dark:backdrop-blur-md rounded-2xl border border-gray-200 dark:border-white/10 p-6 space-y-4">
          {/* Score Stats */}
          <div className="bg-gray-50 dark:bg-zinc-800/30 rounded-2xl p-6">
            <h2 className="text-xl font-bold text-center text-gray-900 dark:text-zinc-200 mb-6">
              全部复习完成！
            </h2>

            <div className="flex items-center justify-center gap-12">
              {/* Ring chart */}
              <div className="relative flex items-center justify-center">
                <svg width="120" height="120" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="40" fill="none" stroke="#e5e7eb" strokeWidth="12" />
                  <circle
                    cx="50" cy="50" r="40" fill="none"
                    stroke={progressPercent >= 60 ? '#16a34a' : '#dc2626'}
                    strokeWidth="12" strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 40}`}
                    strokeDashoffset={`${2 * Math.PI * 40 * (1 - progressPercent / 100)}`}
                    transform="rotate(-90 50 50)"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-bold text-gray-900 dark:text-zinc-200">
                    {masteredCount}/{cards.length}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-zinc-400">{progressPercent}%</span>
                </div>
              </div>

              {/* Stats */}
              <div className="flex gap-10">
                <div className="text-center">
                  <div className="text-3xl font-bold text-green-500 dark:text-green-400">{masteredCount}</div>
                  <div className="text-sm text-gray-500 dark:text-zinc-400 mt-1">已掌握</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-gray-700 dark:text-zinc-300">{unmasteredCount}</div>
                  <div className="text-sm text-gray-500 dark:text-zinc-400 mt-1">需复习</div>
                </div>
              </div>
            </div>
          </div>

          {/* Topics */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 dark:bg-zinc-800/30 rounded-2xl p-5 flex flex-col">
              <h3 className="text-xs font-semibold text-gray-400 dark:text-zinc-400 uppercase tracking-wider mb-3">
                涵盖的知识点
              </h3>
              <ul className="space-y-2 flex-1">
                {topics.map((topic, i) => (
                  <li key={i} className="text-sm text-gray-600 dark:text-zinc-300 flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-zinc-500 mt-1.5 shrink-0" />
                    {topic}
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-gray-50 dark:bg-zinc-800/30 rounded-2xl p-5 flex flex-col">
              <h3 className="text-xs font-semibold text-gray-400 dark:text-zinc-400 uppercase tracking-wider mb-2">
                继续学习
              </h3>
              <p className="text-xs text-gray-400 dark:text-zinc-500 mb-3">选择后续主题，生成新的抽认卡。</p>
              <div className="flex flex-wrap gap-2 flex-1">
                {recommendedTopics.map((topic, i) => {
                  const isSelected = selectedTopics.includes(topic);
                  return (
                    <button
                      key={i}
                      onClick={() => toggleTopic(topic)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-full transition-all ${
                        isSelected
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'bg-blue-50 text-gray-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50'
                      }`}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5" />}
                      {topic}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={handleGenerateNew}
                disabled={selectedTopics.length === 0}
                className="mt-4 w-full py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                生成抽认卡
              </button>
            </div>
          </div>
        </div>

        {/* Bottom actions */}
        <div className="flex items-center justify-end gap-3 mt-4 w-full max-w-2xl">
          <button
            onClick={() => setCurrentIndex(0)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-700 dark:text-zinc-300 bg-gray-100 dark:bg-zinc-800/50 border border-gray-200 dark:border-white/10 rounded-lg hover:bg-gray-200 dark:hover:bg-zinc-800 transition-colors"
          >
            <Eye className="w-4 h-4" />
            回顾卡片
          </button>
          <button
            onClick={handleRestart}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-700 dark:text-zinc-300 bg-gray-100 dark:bg-zinc-800/50 border border-gray-200 dark:border-white/10 rounded-lg hover:bg-gray-200 dark:hover:bg-zinc-800 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            重新复习
          </button>
        </div>
      </div>
    );
  }

  // Card Screen
  const CategoryIcon = categoryIcons[currentCard.category] || Tag;
  const isCurrentMastered = mastered[currentCard.id];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-5 pb-3">
        <span className="text-sm text-gray-500 dark:text-zinc-400 font-medium">
          {currentIndex + 1} / {cards.length}
        </span>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${difficultyColors[currentCard.difficulty] || difficultyColors['基础']}`}>
            {currentCard.difficulty}
          </span>
          <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-300 flex items-center gap-1">
            <CategoryIcon className="w-3 h-3" />
            {currentCard.category}
          </span>
        </div>
      </div>

      {/* Card Area */}
      <div className="flex-1 flex items-center justify-center px-6 pb-4">
        <div className="w-full max-w-lg perspective-1000">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentCard.id}
              className="relative w-full cursor-pointer"
              style={{ transformStyle: 'preserve-3d' }}
              animate={{ rotateY: isFlipped ? 180 : 0 }}
              transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
              onClick={handleFlip}
            >
              {/* Front */}
              <motion.div
                className="w-full min-h-[280px] rounded-2xl shadow-xl p-8 flex flex-col items-center justify-center text-center bg-neutral-900 dark:bg-neutral-900 border border-neutral-700/50 text-white [&_*]:!text-white"
                style={{ backfaceVisibility: 'hidden' }}
              >
                <div className="absolute top-4 left-4 text-xs text-neutral-400 font-mono">
                  {currentIndex + 1}/{cards.length}
                </div>
                <div className="text-2xl leading-relaxed font-medium [&_*]:!text-2xl">
                  <MarkdownRenderer content={currentCard.front} />
                </div>
                <div className="absolute bottom-4 text-xs text-neutral-500">
                  点击翻转查看答案
                </div>
              </motion.div>

              {/* Back */}
              <motion.div
                className="w-full min-h-[280px] rounded-2xl shadow-xl p-8 flex flex-col items-center justify-center text-center bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700/50 absolute top-0 left-0"
                style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
              >
                <div className="absolute top-4 left-4 text-xs text-gray-400 dark:text-neutral-500 font-mono">
                  {currentIndex + 1}/{cards.length}
                </div>
                <div className="text-lg text-gray-800 dark:text-neutral-200 leading-relaxed [&_*]:!text-lg [&_*]:dark:!text-neutral-200">
                  <MarkdownRenderer content={currentCard.back} />
                </div>
                {currentCard.tags && currentCard.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-4">
                    {currentCard.tags.map((tag, i) => (
                      <span key={i} className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600 dark:bg-neutral-700/50 dark:text-neutral-300">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </motion.div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="px-6 pb-6 space-y-4">
        {/* Mastered / Unmastered */}
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => handleMarkUnmastered(currentCard.id)}
            className={`flex items-center gap-2 px-6 py-3 rounded-full text-sm font-medium transition-all ${
              isCurrentMastered === false
                ? 'bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400'
                : 'bg-gray-100 dark:bg-zinc-800/50 text-gray-500 dark:text-zinc-400 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-500 dark:hover:text-red-400'
            }`}
          >
            <X className="w-4 h-4" />
            没记住
          </button>
          <button
            onClick={() => handleMarkMastered(currentCard.id)}
            className={`flex items-center gap-2 px-6 py-3 rounded-full text-sm font-medium transition-all ${
              isCurrentMastered === true
                ? 'bg-green-100 dark:bg-green-500/20 text-green-600 dark:text-green-400'
                : 'bg-gray-100 dark:bg-zinc-800/50 text-gray-500 dark:text-zinc-400 hover:bg-green-50 dark:hover:bg-green-500/10 hover:text-green-500 dark:hover:text-green-400'
            }`}
          >
            <Check className="w-4 h-4" />
            已掌握
          </button>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <button
            onClick={handlePrev}
            disabled={currentIndex === 0}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-700 dark:text-zinc-300 bg-gray-100 dark:bg-zinc-800/50 border border-gray-200 dark:border-white/10 rounded-lg hover:bg-gray-200 dark:hover:bg-zinc-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" />
            上一个
          </button>
          <button
            onClick={handleFlip}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-700 dark:text-zinc-300 bg-gray-100 dark:bg-zinc-800/50 border border-gray-200 dark:border-white/10 rounded-lg hover:bg-gray-200 dark:hover:bg-zinc-800 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            翻转
          </button>
          <button
            onClick={handleNext}
            disabled={currentIndex === cards.length - 1}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-700 dark:text-zinc-300 bg-gray-100 dark:bg-zinc-800/50 border border-gray-200 dark:border-white/10 rounded-lg hover:bg-gray-200 dark:hover:bg-zinc-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            下一个
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
