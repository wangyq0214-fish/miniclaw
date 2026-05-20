'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { GraduationCap, Target, BookOpen, Loader2 } from 'lucide-react';

interface ColdStartFormProps {
  onSubmit: (major: string, goal: string, grade?: string) => Promise<void>;
}

const COMMON_MAJORS = [
  '计算机科学与技术',
  '软件工程',
  '人工智能',
  '数据科学',
  '电子信息工程',
  '数学与应用数学',
  '物理学',
  '其他',
];

const GRADES = ['大一', '大二', '大三', '大四', '研一', '研二', '研三', '其他'];

export function ColdStartForm({ onSubmit }: ColdStartFormProps) {
  const [major, setMajor] = useState('');
  const [goal, setGoal] = useState('');
  const [grade, setGrade] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showMajorSuggestions, setShowMajorSuggestions] = useState(false);

  const canSubmit = major.trim() && goal.trim();

  const handleSubmit = async () => {
    if (!canSubmit || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onSubmit(major.trim(), goal.trim(), grade || undefined);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-lg mx-auto w-full"
    >
      <div className="bg-white dark:bg-zinc-900/50 dark:backdrop-blur-md rounded-2xl p-8 border border-gray-100 dark:border-white/10">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-full bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center mx-auto mb-4">
            <GraduationCap className="w-7 h-7 text-blue-500" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-zinc-100 mb-2">
            创建你的学习画像
          </h2>
          <p className="text-sm text-gray-500 dark:text-zinc-400">
            告诉我一些基本信息，我将为你生成个性化的学习分析
          </p>
        </div>

        <div className="space-y-5">
          {/* Major */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-zinc-300 mb-2">
              <BookOpen className="w-4 h-4" />
              专业
            </label>
            <div className="relative">
              <input
                type="text"
                value={major}
                onChange={(e) => setMajor(e.target.value)}
                onFocus={() => setShowMajorSuggestions(true)}
                onBlur={() => setTimeout(() => setShowMajorSuggestions(false), 200)}
                placeholder="如：计算机科学与技术"
                className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 placeholder:text-gray-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 text-sm"
              />
              {showMajorSuggestions && !major && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg shadow-lg z-10 max-h-40 overflow-y-auto">
                  {COMMON_MAJORS.map((m) => (
                    <button
                      key={m}
                      onMouseDown={() => {
                        setMajor(m);
                        setShowMajorSuggestions(false);
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-700 transition-colors"
                    >
                      {m}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Grade */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-zinc-300 mb-2">
              <GraduationCap className="w-4 h-4" />
              年级 <span className="text-gray-400 dark:text-zinc-500 font-normal">(可选)</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {GRADES.map((g) => (
                <button
                  key={g}
                  onClick={() => setGrade(grade === g ? '' : g)}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                    grade === g
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-400 hover:bg-gray-200 dark:hover:bg-zinc-700'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          {/* Goal */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-zinc-300 mb-2">
              <Target className="w-4 h-4" />
              学习目标
            </label>
            <textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="如：系统学习深度学习，准备考研/保研..."
              rows={3}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 placeholder:text-gray-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 text-sm resize-none"
            />
          </div>
        </div>

        <button
          onClick={handleSubmit}
          disabled={!canSubmit || isSubmitting}
          className="mt-6 w-full py-2.5 rounded-lg bg-blue-600 text-white font-medium text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              正在生成画像...
            </>
          ) : (
            '开始分析'
          )}
        </button>
      </div>
    </motion.div>
  );
}
