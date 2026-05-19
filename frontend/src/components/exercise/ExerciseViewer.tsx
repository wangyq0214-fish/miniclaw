'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Check, X, ChevronRight, ChevronLeft, Sparkles, Send, RotateCcw, Eye } from 'lucide-react';
import { MarkdownRenderer } from '@/components/chat/MarkdownRenderer';
import { streamChat } from '@/lib/api';
import { addMistake } from '@/lib/mistakeBook';
import { logQuizAnswer, logQuizComplete } from '@/lib/learningEvents';

interface Option {
  id: string;
  is_correct: boolean;
  text_md: string;
  explanation_md: string;
}

interface Question {
  question_id: string;
  question_text_md: string;
  difficulty: string;
  options: Option[];
}

interface ExerciseData {
  topic: string;
  generated_at: string;
  total: number;
  difficulty_distribution: Record<string, number>;
  covered_topics?: string[];
  recommended_topics?: string[];
  questions: Question[];
}

interface ChatMessage {
  role: 'assistant' | 'user';
  content: string;
}

interface ExerciseViewerProps {
  content: string;
  onClose?: () => void;
  /** Called when "生成测验" is clicked with the topic-based prompt. NotesView handles streaming + note saving. */
  onGenerateFromTopics?: (prompt: string) => void;
}

export function ExerciseViewer({ content, onClose, onGenerateFromTopics }: ExerciseViewerProps) {
  const [data, setData] = useState<ExerciseData | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<string, string>>({});
  const [lockedQuestions, setLockedQuestions] = useState<Record<string, boolean>>({});
  const [parseError, setParseError] = useState<string | null>(null);

  const questions = data?.questions ?? [];
  const currentQuestion = questions[currentIndex];

  // ── Completion page interactive state ──
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);

  const toggleTopic = useCallback((topic: string) => {
    setSelectedTopics(prev =>
      prev.includes(topic) ? prev.filter(t => t !== topic) : [...prev, topic]
    );
  }, []);

  const handleGenerateNewQuiz = useCallback(async () => {
    if (selectedTopics.length === 0 || !onGenerateFromTopics) return;
    const dispatchPrompt = `请根据以下考点生成新的练习题：${selectedTopics.join('、')}`;
    onGenerateFromTopics(dispatchPrompt);
  }, [selectedTopics, onGenerateFromTopics]);

  // ── Tutor state (per-question, 测验会话级记忆) ──
  const [tutorSessions, setTutorSessions] = useState<Record<string, { isOpen: boolean; messages: ChatMessage[] }>>({});
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Derived: current question's tutor state
  const currentTutor = currentQuestion ? tutorSessions[currentQuestion.question_id] : undefined;
  const isTutorOpen = currentTutor?.isOpen ?? false;
  const chatMessages = currentTutor?.messages ?? [];

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isSending]);

  const sendMessage = useCallback(async (userMsg: string) => {
    if (!userMsg.trim() || isSending || !currentQuestion) return;

    const qid = currentQuestion.question_id;
    const userMsgObj: ChatMessage = { role: 'user', content: userMsg.trim() };
    const assistantPlaceholder: ChatMessage = { role: 'assistant', content: '' };

    // Append user message + assistant placeholder via functional update
    setTutorSessions(prev => {
      const existing = prev[qid]?.messages ?? [];
      return {
        ...prev,
        [qid]: {
          isOpen: true,
          messages: [...existing, userMsgObj, assistantPlaceholder],
        },
      };
    });
    setInputText('');
    setIsSending(true);

    const controller = new AbortController();
    abortRef.current = controller;

    // 注意：此处调用的后端智能体接口应为无状态接口（persist: false），严禁写入数据库以节省存储开销并实现阅后即焚。
    // 使用临时 session_id 以隔离对话，不会污染正式会话。
    const ephemeralSessionId = `tutor-ephemeral-${Date.now()}`;

    // Build context: question + options + user's selected answer
    const selectedId = userAnswers[qid];
    const optionsText = currentQuestion.options
      .map(o => `${o.id}. ${o.text_md}${o.id === selectedId ? ' (用户选择)' : ''}${o.is_correct ? ' (正确答案)' : ''}`)
      .join('\n');
    const contextPrompt = `你是一位耐心的辅导老师。以下是用户正在做的测验题，请基于题目上下文进行答疑。如果用户没有提出具体问题，请先给出简洁的引导性解析。

【题目】${currentQuestion.question_text_md}
【选项】
${optionsText}

用户说：${userMsg}`;

    let assistantContent = '';
    try {
      for await (const event of streamChat(
        { message: contextPrompt, session_id: ephemeralSessionId, stream: true },
        controller.signal,
      )) {
        const eventType = (event as Record<string, unknown>).type as string;
        if (eventType === 'token') {
          assistantContent += (event as Record<string, unknown>).content as string;
          const contentSnapshot = assistantContent;
          setTutorSessions(prev => {
            const msgs = [...(prev[qid]?.messages ?? [])];
            msgs[msgs.length - 1] = { role: 'assistant', content: contentSnapshot };
            return { ...prev, [qid]: { isOpen: true, messages: msgs } };
          });
        } else if (eventType === 'error') {
          assistantContent = (event as Record<string, unknown>).error as string || '发生错误';
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setTutorSessions(prev => {
          const msgs = [...(prev[qid]?.messages ?? [])];
          if (msgs.length > 0 && msgs[msgs.length - 1].role === 'assistant') {
            msgs[msgs.length - 1] = { role: 'assistant', content: '抱歉，请求失败，请稍后重试。' };
          }
          return { ...prev, [qid]: { isOpen: true, messages: msgs } };
        });
      }
    } finally {
      setIsSending(false);
      abortRef.current = null;
    }
  }, [isSending, currentQuestion, userAnswers]);

  const handleToggleTutor = () => {
    if (!currentQuestion) return;
    const qid = currentQuestion.question_id;
    const willOpen = !(tutorSessions[qid]?.isOpen ?? false);

    setTutorSessions(prev => ({
      ...prev,
      [qid]: {
        isOpen: willOpen,
        messages: prev[qid]?.messages ?? [],
      },
    }));

    // Auto-fetch first explanation when opening with no messages
    if (willOpen && (tutorSessions[qid]?.messages?.length ?? 0) === 0) {
      sendMessage('请帮我解析这道题');
    }
  };

  useEffect(() => {
    // Try to fix unescaped Chinese quotes (ASCII " used as Chinese 「」)
    function fixJsonQuotes(raw: string): string {
      // Inside JSON string values, replace "X" patterns where X contains CJK chars
      // with 「X」 to avoid breaking JSON parsing
      return raw.replace(
        /(?<=[一-鿿，。])"([^"]{1,20})"(?=[一-鿿，。])/g,
        '「$1」'
      );
    }

    let raw = content;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const parsed: ExerciseData = JSON.parse(raw);
        if (!parsed.questions || !Array.isArray(parsed.questions)) {
          setParseError('JSON 缺少 questions 数组');
          return;
        }
        setData(parsed);
        setUserAnswers({});
        setLockedQuestions({});
        setCurrentIndex(0);
        setParseError(null);
        return;
      } catch (e) {
        if (attempt === 0) {
          raw = fixJsonQuotes(raw);
          continue;
        }
        setParseError(`JSON 解析失败: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }, [content]);

  const handleSelectOption = (questionId: string, optionId: string) => {
    if (lockedQuestions[questionId]) return;
    setUserAnswers(prev => ({ ...prev, [questionId]: optionId }));
    setLockedQuestions(prev => ({ ...prev, [questionId]: true }));

    const question = questions.find(q => q.question_id === questionId);
    if (question) {
      const correctOption = question.options.find(o => o.is_correct);
      const isCorrect = correctOption ? optionId === correctOption.id : false;

      // Log learning event
      logQuizAnswer({
        questionId,
        isCorrect,
        difficulty: question.difficulty,
        topic: data?.topic ?? '',
      });

      // 答错时自动添加到错题本
      if (!isCorrect) {
        addMistake({
          question_id: question.question_id,
          question_text_md: question.question_text_md,
          difficulty: question.difficulty,
          options: question.options,
          user_selected_id: optionId,
          topic: data?.topic ?? '',
          added_at: new Date().toISOString(),
        });
      }
    }
  };

  const { correctCount, wrongCount, scorePercent } = useMemo(() => {
    let correct = 0;
    questions.forEach(q => {
      const selected = userAnswers[q.question_id];
      const correctOption = q.options.find(o => o.is_correct);
      if (selected && correctOption && selected === correctOption.id) correct++;
    });
    const wrong = questions.length - correct;
    const pct = questions.length > 0 ? Math.round((correct / questions.length) * 100) : 0;
    return { correctCount: correct, wrongCount: wrong, scorePercent: pct };
  }, [questions, userAnswers]);

  const allAnswered = questions.length > 0 && questions.every(q => lockedQuestions[q.question_id]);
  const isLastQuestion = currentIndex === questions.length - 1;
  const showCompletion = allAnswered && isLastQuestion && lockedQuestions[currentQuestion?.question_id];

  // Log quiz completion event when all questions are answered
  useEffect(() => {
    if (showCompletion && data) {
      logQuizComplete({
        score: correctCount,
        total: questions.length,
        topic: data.topic,
      });
    }
  }, [showCompletion, data, correctCount, questions.length]);

  const handleRestart = () => {
    setUserAnswers({});
    setLockedQuestions({});
    setTutorSessions({});
    setCurrentIndex(0);
  };

  if (parseError) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-red-500 text-sm">{parseError}</p>
      </div>
    );
  }

  if (!data || questions.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">加载测验中...</p>
      </div>
    );
  }

  // ── Completion Screen ──
  if (showCompletion) {
    const radius = 40;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (scorePercent / 100) * circumference;
    const topics = data.covered_topics?.length
      ? data.covered_topics
      : questions
          .map(q => q.question_text_md.replace(/^[【\[][^】\]]*[】\]]\s*/, '').trim())
          .filter(Boolean)
          .slice(0, 6);
    const recommendedTopics = data.recommended_topics?.length
      ? data.recommended_topics
      : ['深入理解', '实践练习', '扩展阅读', '相关概念'];

    return (
      <div className="flex flex-col h-full items-center justify-center p-6">
        {/* Main white card */}
        <div className="w-full max-w-2xl bg-white dark:bg-card rounded-2xl border border-gray-100 dark:border-border p-6 space-y-4">

          {/* ── Top: Score Stats ── */}
          <div className="bg-white dark:bg-card rounded-2xl border border-gray-100 dark:border-border p-6">
            <h2 className="text-xl font-bold text-center text-gray-900 dark:text-zinc-200 mb-6">
              大功告成！测验完成。
            </h2>

            <div className="flex items-center justify-center gap-12">
              {/* Ring chart */}
              <div className="relative flex items-center justify-center">
                <svg width="120" height="120" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="12" />
                  <circle
                    cx="50" cy="50" r={radius} fill="none"
                    stroke={scorePercent >= 60 ? '#16a34a' : '#dc2626'}
                    strokeWidth="12" strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    transform="rotate(-90 50 50)"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-bold text-gray-900 dark:text-zinc-200">{correctCount}/{questions.length}</span>
                  <span className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">{scorePercent}%</span>
                </div>
              </div>

              {/* Stats */}
              <div className="flex gap-10">
                <div className="text-center">
                  <div className="text-3xl font-bold text-green-500 dark:text-green-400">{correctCount}</div>
                  <div className="text-sm text-gray-500 dark:text-zinc-400 mt-1">答对</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-gray-700 dark:text-zinc-300">{wrongCount}</div>
                  <div className="text-sm text-gray-500 dark:text-zinc-400 mt-1">答错</div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Bottom: Dual Column ── */}
          <div className="grid grid-cols-2 gap-4">
            {/* Left: Topics */}
            <div className="bg-white dark:bg-card rounded-2xl border border-gray-100 dark:border-border p-5 flex flex-col">
              <h3 className="text-xs font-semibold text-gray-400 dark:text-zinc-400 uppercase tracking-wider mb-3">
                涵盖的主题
              </h3>
              <ul className="space-y-2 flex-1">
                {topics.map((topic, i) => (
                  <li key={i} className="text-sm text-gray-600 dark:text-zinc-300 flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-zinc-500 mt-1.5 shrink-0" />
                    {topic}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-gray-400 dark:text-zinc-500 mt-3">需要更多主题吗？</p>
            </div>

            {/* Right: Continue Learning */}
            <div className="bg-white dark:bg-card rounded-2xl border border-gray-100 dark:border-border p-5 flex flex-col">
              <h3 className="text-xs font-semibold text-gray-400 dark:text-zinc-400 uppercase tracking-wider mb-2">
                继续学习
              </h3>
              <p className="text-xs text-gray-400 dark:text-zinc-500 mb-3">请在下方选择后续主题，生成专项测验。</p>
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
                onClick={handleGenerateNewQuiz}
                disabled={selectedTopics.length === 0 || !onGenerateFromTopics}
                className="mt-4 w-full py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                生成测验
              </button>
            </div>
          </div>
        </div>

        {/* Bottom action bar (outside card) */}
        <div className="flex items-center justify-end gap-3 mt-4 w-full max-w-2xl">
          <button
            onClick={() => setCurrentIndex(0)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-700 dark:text-zinc-300 bg-white dark:bg-card border border-gray-200 dark:border-border rounded-lg hover:bg-gray-50 dark:hover:bg-accent transition-colors"
          >
            <Eye className="w-4 h-4" />
            回顾测验
          </button>
          <button
            onClick={handleRestart}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-700 dark:text-zinc-300 bg-white dark:bg-card border border-gray-200 dark:border-border rounded-lg hover:bg-gray-50 dark:hover:bg-accent transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            重新测验
          </button>
        </div>
      </div>
    );
  }

  // ── Question Screen ──
  const isLocked = !!lockedQuestions[currentQuestion.question_id];
  const selectedOptionId = userAnswers[currentQuestion.question_id];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-5 pb-3">
        <span className="text-sm text-gray-500 dark:text-zinc-400 font-medium">
          {currentIndex + 1} / {questions.length}
        </span>
      </div>

      {/* Question */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        <div className="max-w-2xl mx-auto space-y-6">
          <div>
            <h3 className="text-lg font-semibold mb-3">
              <MarkdownRenderer content={currentQuestion.question_text_md} />
            </h3>
          </div>

          {/* Options — each with its own explanation */}
          <div className="space-y-3">
            {currentQuestion.options.map((option) => {
              const isSelected = selectedOptionId === option.id;
              const showCorrect = isLocked && option.is_correct;
              const showWrong = isLocked && isSelected && !option.is_correct;

              let bgClass = 'bg-white dark:bg-card border border-gray-200 dark:border-border hover:bg-gray-50 dark:hover:bg-accent';
              if (showCorrect) bgClass = 'bg-green-50 dark:bg-emerald-500/10 border border-green-200 dark:border-emerald-500/30';
              else if (showWrong) bgClass = 'bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30';

              return (
                <div key={option.id}>
                  <button
                    onClick={() => handleSelectOption(currentQuestion.question_id, option.id)}
                    disabled={isLocked}
                    className={`w-full text-left rounded-2xl p-5 transition-all ${bgClass} ${
                      isLocked ? 'cursor-default' : 'cursor-pointer'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span className={`text-sm font-medium shrink-0 w-5 ${
                        showCorrect ? 'text-green-500 dark:text-emerald-400' :
                        showWrong ? 'text-red-500 dark:text-red-400' :
                        'text-gray-400 dark:text-zinc-400'
                      }`}>
                        {option.id}
                      </span>
                      <span className={`flex-1 text-[15px] ${
                        showCorrect ? 'text-green-800 dark:text-emerald-300' :
                        showWrong ? 'text-red-800 dark:text-red-300' :
                        'text-gray-800 dark:text-zinc-200'
                      }`}>
                        <MarkdownRenderer content={option.text_md} />
                      </span>
                    </div>
                  </button>

                  {/* Per-option explanation: wrong selection */}
                  {showWrong && (
                    <div className="mt-2 ml-5 space-y-2">
                      <div className="flex items-center gap-1.5">
                        <X className="w-4 h-4 text-red-500 dark:text-red-400" />
                        <span className="text-sm font-semibold text-red-600 dark:text-red-400">不太对</span>
                      </div>
                      <div className="text-sm text-gray-600 dark:text-zinc-400 prose prose-sm max-w-none">
                        <MarkdownRenderer content={option.explanation_md} />
                      </div>
                    </div>
                  )}

                  {/* Per-option explanation: correct answer (not selected by user) */}
                  {showCorrect && !isSelected && (
                    <div className="mt-2 ml-5 space-y-2">
                      <div className="flex items-center gap-1.5">
                        <Check className="w-4 h-4 text-green-600 dark:text-emerald-400" />
                        <span className="text-sm font-semibold text-green-700 dark:text-emerald-400">正确答案</span>
                      </div>
                      <div className="text-sm text-gray-600 dark:text-zinc-400 prose prose-sm max-w-none">
                        <MarkdownRenderer content={option.explanation_md} />
                      </div>
                    </div>
                  )}

                  {/* Per-option explanation: correct answer (selected by user) */}
                  {showCorrect && isSelected && (
                    <div className="mt-2 ml-5 space-y-2">
                      <div className="flex items-center gap-1.5">
                        <Check className="w-4 h-4 text-green-600 dark:text-emerald-400" />
                        <span className="text-sm font-semibold text-green-700 dark:text-emerald-400">回答正确</span>
                      </div>
                      <div className="text-sm text-gray-600 dark:text-zinc-400 prose prose-sm max-w-none">
                        <MarkdownRenderer content={option.explanation_md} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── Inline Agent Tutor (答疑区) ── */}
          <div
            className={`grid transition-all duration-300 ease-in-out ${
              isTutorOpen ? 'grid-rows-[1fr] opacity-100 mb-6' : 'grid-rows-[0fr] opacity-0 mb-0'
            }`}
          >
            <div className="overflow-hidden">
              <div className="bg-indigo-50/40 rounded-2xl border border-indigo-100 dark:bg-indigo-900/20 dark:border-indigo-800/50 p-5">
                {/* Chat history */}
                <div className="max-h-[40vh] overflow-y-auto pr-2 space-y-3 mb-4">
                  {chatMessages.map((msg, i) => (
                    <div
                      key={i}
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      {msg.role === 'user' ? (
                        <div className="bg-gray-100 dark:bg-secondary rounded-xl px-3 py-2 max-w-[80%] text-sm text-gray-800 dark:text-zinc-200">
                          {msg.content}
                        </div>
                      ) : (
                        <div className="max-w-[85%] text-sm text-gray-700 dark:text-zinc-300 leading-relaxed">
                          <MarkdownRenderer content={msg.content} />
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Typing indicator */}
                  {isSending && chatMessages[chatMessages.length - 1]?.content === '' && (
                    <div className="flex justify-start">
                      <div className="flex items-center gap-1 px-3 py-2">
                        <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:0ms]" />
                        <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:150ms]" />
                        <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:300ms]" />
                      </div>
                    </div>
                  )}

                  <div ref={chatEndRef} />
                </div>

                {/* Input area */}
                <div className="flex items-center gap-2">
                  <input
                    value={inputText}
                    onChange={e => setInputText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(inputText); } }}
                    placeholder="继续追问..."
                    disabled={isSending}
                    className="flex-1 bg-gray-50 dark:bg-secondary border border-gray-200 dark:border-border focus:ring-1 focus:ring-indigo-300/30 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-zinc-200 outline-none placeholder:text-gray-400 dark:placeholder:text-zinc-500 disabled:opacity-50"
                  />
                  <button
                    onClick={() => sendMessage(inputText)}
                    disabled={!inputText.trim() || isSending}
                    className="p-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 dark:border-white/5">
        <button
          onClick={handleToggleTutor}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all ${
            isTutorOpen
              ? 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300'
              : 'bg-gray-100 dark:bg-zinc-800/50 text-gray-600 dark:text-zinc-400 hover:bg-gray-200 dark:hover:bg-zinc-800 border border-gray-200 dark:border-white/10'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          {isTutorOpen ? '收起解释' : '解释'}
        </button>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
            disabled={currentIndex === 0}
            className="flex items-center gap-1.5 px-5 py-2.5 bg-blue-600 text-white rounded-full text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" />
            上一个
          </button>
          <button
            onClick={() => setCurrentIndex(prev => Math.min(questions.length - 1, prev + 1))}
            disabled={currentIndex === questions.length - 1}
            className="flex items-center gap-1.5 px-5 py-2.5 bg-blue-600 text-white rounded-full text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            下一个
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
