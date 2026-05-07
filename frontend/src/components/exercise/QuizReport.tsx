'use client';

import { useState, useCallback } from 'react';
import { Check, RotateCcw, Eye, Loader2 } from 'lucide-react';

interface QuizData {
  score: number;
  total: number;
  covered_topics: string[];
  recommended_topics: string[];
}

interface QuizReportProps {
  quizData: QuizData;
  onReview?: () => void;
  onRestart?: () => void;
}

export function QuizReport({ quizData, onReview, onRestart }: QuizReportProps) {
  const { score, total, covered_topics, recommended_topics } = quizData;
  const scorePercent = total > 0 ? Math.round((score / total) * 100) : 0;
  const wrongCount = total - score;

  // ── State ──
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [isDispatching, setIsDispatching] = useState(false);

  const toggleTopic = useCallback((topic: string) => {
    setSelectedTopics(prev =>
      prev.includes(topic) ? prev.filter(t => t !== topic) : [...prev, topic]
    );
  }, []);

  // ── Sub-Agent Dispatch (Nanobots @Agent Selector) ──
  const handleGenerateNewQuiz = useCallback(async () => {
    if (selectedTopics.length === 0 || isDispatching) return;

    setIsDispatching(true);

    const dispatchPrompt =
      `[Dispatch Payload] @Quiz Master 请根据以下薄弱环节生成新的测验：[${selectedTopics.join(', ')}]`;
    console.log(dispatchPrompt);

    // 模拟后端调度请求
    setTimeout(() => {
      console.log('[Dispatch Payload] 请求已发送，等待子智能体响应...');
      setIsDispatching(false);
    }, 1500);
  }, [selectedTopics, isDispatching]);

  // ── Ring chart math ──
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (scorePercent / 100) * circumference;

  return (
    <div className="flex flex-col h-full items-center justify-center p-6">
      {/* Main white card */}
      <div className="w-full max-w-2xl bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">

        {/* ── Top: Score Stats ── */}
        <div className="bg-gray-50/50 rounded-2xl p-6">
          <h2 className="text-xl font-bold text-center text-gray-900 mb-6">
            大功告成！测验完成。
          </h2>

          <div className="flex items-center justify-center gap-12">
            {/* Ring chart */}
            <div className="relative flex items-center justify-center">
              <svg width="120" height="120" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="10" />
                <circle
                  cx="50" cy="50" r={radius} fill="none"
                  stroke={scorePercent >= 60 ? '#16a34a' : '#dc2626'}
                  strokeWidth="10" strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={offset}
                  transform="rotate(-90 50 50)"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-gray-900">{score}/{total}</span>
                <span className="text-xs text-gray-500 mt-0.5">{scorePercent}%</span>
              </div>
            </div>

            {/* Stats */}
            <div className="flex gap-10">
              <div className="text-center">
                <div className="text-3xl font-bold text-green-600">{score}</div>
                <div className="text-sm text-gray-500 mt-1">答对</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-gray-700">{wrongCount}</div>
                <div className="text-sm text-gray-500 mt-1">答错</div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Bottom: Dual Column ── */}
        <div className="grid grid-cols-2 gap-6">
          {/* Left: Covered Topics */}
          <div className="bg-gray-50/50 rounded-2xl p-5 flex flex-col">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              涵盖的主题
            </h3>
            <ul className="space-y-2 flex-1">
              {covered_topics.map((topic, i) => (
                <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400 mt-1.5 shrink-0" />
                  {topic}
                </li>
              ))}
            </ul>
          </div>

          {/* Right: Continue Learning */}
          <div className="bg-gray-50/50 rounded-2xl p-5 flex flex-col">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              继续学习
            </h3>
            <p className="text-xs text-gray-400 mb-3">请在下方选择后续主题，生成专项测验。</p>

            <div className="flex flex-wrap gap-2 flex-1">
              {recommended_topics.map((topic, i) => {
                const isSelected = selectedTopics.includes(topic);
                return (
                  <button
                    key={i}
                    onClick={() => toggleTopic(topic)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-full transition-all ${
                      isSelected
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                    }`}
                  >
                    {isSelected && <Check className="w-3.5 h-3.5" />}
                    {topic}
                  </button>
                );
              })}
            </div>

            <button
              onClick={handleGenerateNewQuiz}
              disabled={selectedTopics.length === 0 || isDispatching}
              className="mt-4 w-full py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isDispatching ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  生成中...
                </>
              ) : (
                '生成测验'
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Bottom action bar (outside card) */}
      <div className="flex items-center justify-end gap-3 mt-4 w-full max-w-2xl">
        <button
          onClick={onReview}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <Eye className="w-4 h-4" />
          回顾测验
        </button>
        <button
          onClick={onRestart}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
          重新测验
        </button>
      </div>
    </div>
  );
}
