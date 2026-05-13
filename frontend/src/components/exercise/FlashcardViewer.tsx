'use client';

import { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, ChevronRight, RotateCcw, Check, X,
  Sparkles, Eye, Lightbulb, Tag,
} from 'lucide-react';
import { MarkdownRenderer } from '@/components/chat/MarkdownRenderer';
import { logFlashcardReview } from '@/lib/learningEvents';

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
  onGenerateFromTopics?: (prompt: string) => void;
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

export function FlashcardViewer({ content, onClose, onGenerateFromTopics }: FlashcardViewerProps) {
  const [data, setData] = useState<FlashcardData | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [mastered, setMastered] = useState<Record<string, boolean>>({});
  const [parseError, setParseError] = useState<string | null>(null);

  // Completion page state
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);

  const toggleTopic = useCallback((topic: string) => {
    setSelectedTopics(prev =>
      prev.includes(topic) ? prev.filter(t => t !== topic) : [...prev, topic]
    );
  }, []);

  const handleGenerateNew = useCallback(async () => {
    if (selectedTopics.length === 0 || !onGenerateFromTopics) return;
    const dispatchPrompt = `请根据以下考点生成新的抽认卡：${selectedTopics.join('、')}`;
    onGenerateFromTopics(dispatchPrompt);
  }, [selectedTopics, onGenerateFromTopics]);

  // Parse content
  useMemo(() => {
    try {
      const parsed: FlashcardData = JSON.parse(content);
      if (!parsed.cards || !Array.isArray(parsed.cards)) {
        setParseError('JSON 缺少 cards 数组');
        return;
      }
      setData(parsed);
      setCurrentIndex(0);
      setIsFlipped(false);
      setMastered({});
      setParseError(null);
    } catch (e) {
      setParseError(`JSON 解析失败: ${e instanceof Error ? e.message : String(e)}`);
    }
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
    // Auto advance
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
    // Auto advance
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

  // Completion Screen
  if (showCompletion) {
    const topics = data.covered_topics?.length
      ? data.covered_topics
      : cards.map(c => c.front).slice(0, 6);
    const recommendedTopics = data.recommended_topics?.length
      ? data.recommended_topics
      : ['深入理解', '实践练习', '扩展阅读'];

    return (
      <div className="flex flex-col h-full items-center justify-center p-6">
        <div className="w-full max-w-2xl bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4 dark:bg-gray-800 dark:border-gray-700">
          {/* Score Stats */}
          <div className="bg-[#f9fafb] rounded-2xl p-6 dark:bg-gray-700/50">
            <h2 className="text-xl font-bold text-center text-gray-900 dark:text-gray-100 mb-6">
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
                  <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {masteredCount}/{cards.length}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">{progressPercent}%</span>
                </div>
              </div>

              {/* Stats */}
              <div className="flex gap-10">
                <div className="text-center">
                  <div className="text-3xl font-bold text-green-600">{masteredCount}</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">已掌握</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-gray-700 dark:text-gray-300">{unmasteredCount}</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">需复习</div>
                </div>
              </div>
            </div>
          </div>

          {/* Topics */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-[#f9fafb] rounded-2xl p-5 flex flex-col dark:bg-gray-700/50">
              <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                涵盖的知识点
              </h3>
              <ul className="space-y-2 flex-1">
                {topics.map((topic, i) => (
                  <li key={i} className="text-sm text-gray-700 dark:text-gray-300 flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-gray-500 mt-1.5 shrink-0" />
                    {topic}
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-[#f9fafb] rounded-2xl p-5 flex flex-col dark:bg-gray-700/50">
              <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                继续学习
              </h3>
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">选择后续主题，生成新的抽认卡。</p>
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
                disabled={selectedTopics.length === 0 || !onGenerateFromTopics}
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
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors dark:text-gray-300 dark:bg-gray-800 dark:border-gray-700 dark:hover:bg-gray-700"
          >
            <Eye className="w-4 h-4" />
            回顾卡片
          </button>
          <button
            onClick={handleRestart}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors dark:text-gray-300 dark:bg-gray-800 dark:border-gray-700 dark:hover:bg-gray-700"
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
        <span className="text-sm text-gray-400 dark:text-gray-500 font-medium">
          {currentIndex + 1} / {cards.length}
        </span>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${difficultyColors[currentCard.difficulty] || difficultyColors['基础']}`}>
            {currentCard.difficulty}
          </span>
          <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 flex items-center gap-1">
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
                className="w-full min-h-[280px] rounded-2xl shadow-xl p-8 flex flex-col items-center justify-center text-center backface-hidden"
                style={{
                  backgroundColor: '#2c2c2c',
                  backfaceVisibility: 'hidden',
                  color: '#ffffff',
                }}
              >
                <div className="absolute top-4 left-4 text-xs text-gray-400 font-mono">
                  {currentIndex + 1}/{cards.length}
                </div>
                <div className="text-2xl leading-relaxed font-medium [&_*]:!text-white [&_*]:!text-2xl">
                  <MarkdownRenderer content={currentCard.front} />
                </div>
                <div className="absolute bottom-4 text-xs text-gray-500">
                  点击翻转查看答案
                </div>
              </motion.div>

              {/* Back */}
              <motion.div
                className="w-full min-h-[280px] rounded-2xl shadow-xl p-8 flex flex-col items-center justify-center text-center backface-hidden absolute top-0 left-0"
                style={{
                  backgroundColor: '#f8f9fa',
                  backfaceVisibility: 'hidden',
                  transform: 'rotateY(180deg)',
                }}
              >
                <div className="absolute top-4 left-4 text-xs text-gray-400 font-mono">
                  {currentIndex + 1}/{cards.length}
                </div>
                <div className="text-lg text-gray-800 dark:text-gray-200 leading-relaxed [&_*]:!text-lg">
                  <MarkdownRenderer content={currentCard.back} />
                </div>
                {currentCard.tags && currentCard.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-4">
                    {currentCard.tags.map((tag, i) => (
                      <span key={i} className="px-2 py-0.5 text-xs rounded-full bg-gray-200 text-gray-600">
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
                ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                : 'bg-gray-100 text-gray-600 hover:bg-red-50 hover:text-red-500 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-red-900/20 dark:hover:text-red-400'
            }`}
          >
            <X className="w-4 h-4" />
            没记住
          </button>
          <button
            onClick={() => handleMarkMastered(currentCard.id)}
            className={`flex items-center gap-2 px-6 py-3 rounded-full text-sm font-medium transition-all ${
              isCurrentMastered === true
                ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
                : 'bg-gray-100 text-gray-600 hover:bg-green-50 hover:text-green-500 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-green-900/20 dark:hover:text-green-400'
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
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed dark:text-gray-300 dark:bg-gray-800 dark:border-gray-700 dark:hover:bg-gray-700"
          >
            <ChevronLeft className="w-4 h-4" />
            上一个
          </button>
          <button
            onClick={handleFlip}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors dark:text-gray-300 dark:bg-gray-800 dark:border-gray-700 dark:hover:bg-gray-700"
          >
            <RotateCcw className="w-4 h-4" />
            翻转
          </button>
          <button
            onClick={handleNext}
            disabled={currentIndex === cards.length - 1}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed dark:text-gray-300 dark:bg-gray-800 dark:border-gray-700 dark:hover:bg-gray-700"
          >
            下一个
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
