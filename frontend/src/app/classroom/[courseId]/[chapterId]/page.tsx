'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Mic, Play, Pause, Volume2, ChevronLeft, ChevronRight, ChevronUp, Send, X, RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { useImmersiveLecture } from '@/hooks/useImmersiveLecture';
import { useTTS } from '@/hooks/useTTS';
import { useTTSPreload } from '@/hooks/useTTSPreload';
import { useImmersiveChat } from '@/hooks/useImmersiveChat';
import ChatPanel, { ChatMode } from '@/components/classroom/ChatPanel';

export default function ImmersiveClassroomPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const courseId = params.courseId as string;
  const chapterId = params.chapterId as string;
  const pageIndex = parseInt(searchParams.get('page') || '0');

  // Get markdown content from sessionStorage
  const [markdownContent, setMarkdownContent] = useState<string>('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const content = sessionStorage.getItem('classroom_content');
      if (content) {
        setMarkdownContent(content);
      }
    }
  }, []);

  const userId = 2;

  const [forceRegenerate, setForceRegenerate] = useState(false);

  // Use real lecture data
  const {
    blocks,
    isStreaming,
    error,
    currentSection,
    totalSections,
    pause,
    resume,
    restart,
    goToBlock,
    addBlocks,
    saveProgress
  } = useImmersiveLecture({
    courseId: decodeURIComponent(courseId),
    chapterId,
    pageIndex,
    userId,
    markdownContent,
    autoStart: markdownContent.length > 0,
    forceRegenerate
  });

  const [isPaused, setIsPaused] = useState(false);
  const [isStarted, setIsStarted] = useState(false);
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const [currentBlockInSceneIndex, setCurrentBlockInSceneIndex] = useState(0);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatInputValue, setChatInputValue] = useState('');
  const [chatMode, setChatMode] = useState<ChatMode>('chat');

  // Chat functionality
  const {
    messages: chatMessages,
    isStreaming: isChatStreaming,
    sendMessage
  } = useImmersiveChat({
    courseId: decodeURIComponent(courseId),
    chapterId,
    pageIndex,
    userId,
    mode: chatMode,
    onNewContent: (newBlocks) => {
      // Add new blocks to existing blocks
      console.log('📦 New blocks received:', newBlocks.length);
      addBlocks(newBlocks);
    }
  });

  // Group blocks by section (scene)
  const scenes = blocks.reduce((acc, block) => {
    const section = block.metadata?.section || 0;
    if (!acc[section]) {
      acc[section] = [];
    }
    acc[section].push(block);
    return acc;
  }, {} as Record<number, typeof blocks>);

  const sceneKeys = Object.keys(scenes).map(Number).sort((a, b) => a - b);
  const currentScene = scenes[sceneKeys[currentSceneIndex]] || [];
  const totalScenes = sceneKeys.length;

  // Get current block within the scene
  const currentBlock = currentScene[currentBlockInSceneIndex];
  const currentSpeech = currentBlock?.metadata?.speech || '';

  // Debug logging
  useEffect(() => {
    console.log('🎬 Scene Debug:', {
      currentSceneIndex,
      totalScenes,
      currentBlockInSceneIndex,
      totalBlocksInScene: currentScene.length,
      blockType: currentBlock?.type,
      speechLength: currentSpeech.length,
      isStarted,
      isPaused,
      enabled: isStarted && !isPaused && currentSpeech.length > 0
    });
  }, [currentSceneIndex, totalScenes, currentBlockInSceneIndex, currentScene.length, currentBlock, currentSpeech, isStarted, isPaused]);

  // Log blocks and scenes for debugging
  useEffect(() => {
    console.log('📦 Blocks:', blocks.length, 'Scenes:', totalScenes);
    console.log('📋 Scene keys:', sceneKeys);
    console.log('🎭 Scenes distribution:', Object.entries(scenes).map(([k, v]) => `Scene ${k}: ${v.length} blocks`));
  }, [blocks, scenes, sceneKeys, totalScenes]);

  // Calculate global block index for preloading
  const globalBlockIndex = blocks.findIndex(b => b.id === currentBlock?.id);

  // TTS Preload - generate audio for upcoming blocks in background
  useTTSPreload(blocks, globalBlockIndex, isStarted && !isPaused, 3);

  // Save progress when scene/block changes
  useEffect(() => {
    if (isStarted && blocks.length > 0) {
      const isLastScene = currentSceneIndex === totalScenes - 1;
      const isLastBlock = currentBlockInSceneIndex === currentScene.length - 1;
      const completed = isLastScene && isLastBlock && !isStreaming;

      saveProgress(globalBlockIndex, currentSceneIndex, completed);
    }
  }, [currentSceneIndex, currentBlockInSceneIndex, isStarted]);

  // TTS for current block
  const { isSpeaking } = useTTS({
    text: currentSpeech,
    enabled: isStarted && !isPaused && currentSpeech.length > 0,
    onEnd: () => {
      // Check if there are more blocks in current scene
      if (currentBlockInSceneIndex < currentScene.length - 1) {
        // Move to next block in same scene
        setCurrentBlockInSceneIndex(prev => prev + 1);
      } else if (currentSceneIndex < totalScenes - 1) {
        // Move to next scene
        setCurrentSceneIndex(prev => prev + 1);
        setCurrentBlockInSceneIndex(0);
      }
    }
  });

  const handlePlayPause = () => {
    // Don't allow starting if still generating and no blocks yet
    if (!isStarted && isStreaming && blocks.length === 0) {
      return;
    }

    if (!isStarted) {
      setIsStarted(true);
      setIsPaused(false);
    } else if (isPaused) {
      resume();
      setIsPaused(false);
    } else {
      pause();
      setIsPaused(true);
    }
  };

  const handleSendMessage = () => {
    if (chatInputValue.trim()) {
      sendMessage(chatInputValue);
      setChatInputValue('');
    }
  };

  const handlePrevBlock = () => {
    if (currentBlockInSceneIndex > 0) {
      // Go to previous block in same scene
      setCurrentBlockInSceneIndex(prev => prev - 1);
    } else if (currentSceneIndex > 0) {
      // Go to previous scene
      setCurrentSceneIndex(prev => prev - 1);
      const prevScene = scenes[sceneKeys[currentSceneIndex - 1]] || [];
      setCurrentBlockInSceneIndex(prevScene.length - 1);
    }
  };

  const handleNextBlock = () => {
    if (currentBlockInSceneIndex < currentScene.length - 1) {
      // Go to next block in same scene
      setCurrentBlockInSceneIndex(prev => prev + 1);
    } else if (currentSceneIndex < totalScenes - 1) {
      // Go to next scene
      setCurrentSceneIndex(prev => prev + 1);
      setCurrentBlockInSceneIndex(0);
    }
  };

  // Render a single block
  const renderBlock = (block: any, index: number) => {
    const { type, content, metadata } = block;

    switch (type) {
      case 'title':
        return (
          <motion.h1
            key={block.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: index * 0.1 }}
            className="text-5xl md:text-6xl font-bold text-slate-900 tracking-tight mb-12"
          >
            {content}
          </motion.h1>
        );

      case 'insight':
        return (
          <motion.div
            key={block.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: index * 0.1 }}
            className="bg-indigo-50/50 backdrop-blur-sm border border-indigo-100 rounded-2xl p-8 shadow-sm mb-8"
          >
            <h3 className="text-indigo-600 font-semibold text-lg mb-3 flex items-center gap-2">
              💡 Key Insight
            </h3>
            <p className="text-slate-700 text-lg leading-relaxed">
              {content}
            </p>
          </motion.div>
        );

      case 'text':
        return (
          <motion.p
            key={block.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: index * 0.1 }}
            className="text-slate-700 text-lg leading-[1.8] mb-8"
          >
            {content}
          </motion.p>
        );

      case 'list':
        const items = Array.isArray(content) ? content : [content];
        return (
          <motion.ul
            key={block.id}
            initial="hidden"
            animate="visible"
            variants={{
              visible: {
                transition: {
                  staggerChildren: 0.1,
                  delayChildren: index * 0.1
                }
              }
            }}
            className="space-y-4 mb-8"
          >
            {items.map((item, idx) => (
              <motion.li
                key={idx}
                variants={{
                  hidden: { opacity: 0, x: -20 },
                  visible: { opacity: 1, x: 0 }
                }}
                className="flex items-start gap-3 text-slate-700 text-lg leading-relaxed"
              >
                <span className="w-2 h-2 rounded-full bg-indigo-400 mt-3 flex-shrink-0" />
                <span>{item}</span>
              </motion.li>
            ))}
          </motion.ul>
        );

      case 'code':
        return (
          <motion.pre
            key={block.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: index * 0.1 }}
            className="bg-slate-900 text-slate-100 rounded-2xl p-6 overflow-x-auto mb-8 text-sm leading-relaxed"
          >
            <code>{content}</code>
          </motion.pre>
        );

      case 'formula':
        // Render LaTeX formula using KaTeX
        const formulaContent = typeof content === 'string' ? content : '';
        // Remove $$ delimiters if present
        const cleanFormula = formulaContent.replace(/^\$\$|\$\$$/g, '').trim();
        let renderedFormula = '';
        try {
          renderedFormula = katex.renderToString(cleanFormula, {
            throwOnError: false,
            displayMode: true,
            trust: true
          });
        } catch (e) {
          renderedFormula = cleanFormula;
        }
        return (
          <motion.div
            key={block.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: index * 0.1 }}
            className="bg-slate-50 border border-slate-200 rounded-2xl p-8 mb-8 text-center"
          >
            <div
              className="text-2xl text-slate-800"
              dangerouslySetInnerHTML={{ __html: renderedFormula }}
            />
          </motion.div>
        );

      default:
        return null;
    }
  };

  // Render current scene with only blocks up to current speaking block
  const renderCurrentScene = () => {
    if (currentScene.length === 0) return null;

    // Only show blocks up to and including the current speaking block
    const visibleBlocks = currentScene.slice(0, currentBlockInSceneIndex + 1);

    return (
      <motion.div
        key={currentSceneIndex}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.4 }}
      >
        {visibleBlocks.map((block, index) => (
          <motion.div
            key={block.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{
              opacity: 1,
              y: 0
            }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: index * 0.1 }}
          >
            {renderBlock(block, index)}
          </motion.div>
        ))}
      </motion.div>
    );
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-indigo-50/30 to-slate-50 relative overflow-hidden">
      {/* Subtle glow effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-200/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 right-1/4 w-80 h-80 bg-blue-200/10 rounded-full blur-3xl" />
      </div>

      {/* Top Header */}
      <header className="absolute top-0 left-0 right-0 h-16 px-8 flex items-center gap-4 z-10">
        <button
          onClick={() => {
            // Return to main app and select the course file
            const returnPath = sessionStorage.getItem('classroom_return_path');
            if (returnPath) {
              // Navigate to app with file selection
              router.push(`/app?file=${encodeURIComponent(returnPath)}`);
            } else {
              router.push('/app');
            }
          }}
          className="p-2 text-slate-400 hover:text-slate-700 transition-colors rounded-full hover:bg-slate-100"
          aria-label="返回"
        >
          <ArrowLeft size={20} />
        </button>
        <span className="text-sm text-slate-500 tracking-wide">
          第 {chapterId} 章
        </span>
      </header>

      {/* Center Canvas */}
      <main className="absolute inset-0 top-16 bottom-32 overflow-y-auto">
        <div className="min-h-full flex items-center justify-center px-8 py-16">
          <div className="w-full max-w-3xl">
            {isStreaming && blocks.length === 0 ? (
              // Loading state when generating content
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center gap-4"
              >
                <div className="flex gap-1">
                  <motion.span
                    className="w-3 h-3 bg-indigo-400 rounded-full"
                    animate={{ y: [0, -8, 0] }}
                    transition={{ duration: 0.6, repeat: Infinity, delay: 0 }}
                  />
                  <motion.span
                    className="w-3 h-3 bg-indigo-400 rounded-full"
                    animate={{ y: [0, -8, 0] }}
                    transition={{ duration: 0.6, repeat: Infinity, delay: 0.15 }}
                  />
                  <motion.span
                    className="w-3 h-3 bg-indigo-400 rounded-full"
                    animate={{ y: [0, -8, 0] }}
                    transition={{ duration: 0.6, repeat: Infinity, delay: 0.3 }}
                  />
                </div>
                <p className="text-slate-500 text-lg">正在准备课程...</p>
              </motion.div>
            ) : (
              <AnimatePresence mode="wait">
                {renderCurrentScene()}
              </AnimatePresence>
            )}
          </div>
        </div>
      </main>

      {/* Pet Agent with Chat Toggle (Collapsed State) */}
      {!isChatOpen && (
        <div className="absolute bottom-32 left-12 z-10">
          {/* Open Chat Button */}
          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => setIsChatOpen(true)}
            className="absolute -top-14 left-1/2 -translate-x-1/2 px-4 py-2 bg-white/80 backdrop-blur-md border border-indigo-100/50 rounded-full shadow-lg text-sm text-slate-700 hover:bg-white transition-all flex items-center gap-2"
          >
            <span>Open chat</span>
            <ChevronUp size={14} />
          </motion.button>

          {/* Pet Agent */}
          <motion.div
            className="w-48 h-48 bg-white rounded-3xl shadow-xl flex items-center justify-center"
            animate={{
              y: [0, -8, 0],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          >
            <span className="text-6xl">🤖</span>
          </motion.div>
        </div>
      )}

      {/* Chat Panel (Expanded State) */}
      <ChatPanel
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        messages={chatMessages}
        isStreaming={isChatStreaming}
        mode={chatMode}
        onModeChange={setChatMode}
      />

      {/* Bottom Bar - Mutually Exclusive: Control Bar OR Input Bar */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30">
        <AnimatePresence mode="wait">
          {!isChatOpen ? (
            // Control Bar (Course Controls)
            <motion.div
              key="control-bar"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="flex items-center gap-6 px-8 py-4 bg-white/80 backdrop-blur-md rounded-full shadow-lg border border-slate-100">
                {/* Previous */}
                <button
                  onClick={handlePrevBlock}
                  disabled={currentSceneIndex === 0 && currentBlockInSceneIndex === 0}
                  className="text-slate-500 hover:text-slate-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="上一个"
                >
                  <ChevronLeft size={20} />
                </button>

                {/* Main Action Button */}
                <button
                  onClick={handlePlayPause}
                  disabled={isStreaming && blocks.length === 0}
                  className="flex items-center gap-3 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full font-medium transition-all shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {!isStarted ? (
                    isStreaming && blocks.length === 0 ? (
                      <>
                        <motion.div
                          className="w-4 h-4 border-2 border-white border-t-transparent rounded-full"
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        />
                        <span>准备中...</span>
                      </>
                    ) : (
                      <>
                        <Play size={18} />
                        <span>Start</span>
                      </>
                    )
                  ) : isPaused ? (
                    <Play size={18} />
                  ) : (
                    <Pause size={18} />
                  )}
                </button>

                {/* Next */}
                <button
                  onClick={handleNextBlock}
                  disabled={currentSceneIndex === totalScenes - 1 && currentBlockInSceneIndex === currentScene.length - 1}
                  className="text-slate-500 hover:text-slate-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="下一个"
                >
                  <ChevronRight size={20} />
                </button>

                <div className="w-px h-6 bg-slate-200 mx-2"></div>

                {/* Progress Indicators - Show scenes */}
                <div className="flex gap-2">
                  {Array.from({ length: totalScenes || 3 }, (_, i) => (
                    <div
                      key={i}
                      className={`h-1 rounded-full transition-all ${
                        i < currentSceneIndex
                          ? 'bg-indigo-500 w-8'
                          : i === currentSceneIndex
                          ? 'bg-indigo-400 w-12'
                          : 'bg-slate-200 w-8'
                      }`}
                    />
                  ))}
                </div>

                <div className="w-px h-6 bg-slate-200 mx-2"></div>

                {/* Regenerate */}
                <button
                  onClick={() => {
                    setForceRegenerate(true);
                    restart();
                  }}
                  className="text-slate-500 hover:text-slate-800 transition-colors"
                  aria-label="重新生成"
                  title="重新生成内容"
                >
                  <RotateCcw size={18} />
                </button>

                {/* Volume */}
                <button
                  className="text-slate-500 hover:text-slate-800 transition-colors"
                  aria-label="音量"
                >
                  <Volume2 size={20} />
                </button>
              </div>
            </motion.div>
          ) : (
            // Input Bar (Chat Input)
            <motion.div
              key="input-bar"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="flex items-center gap-3 px-6 py-3 bg-white/80 backdrop-blur-md rounded-full shadow-2xl border border-slate-200/50">
                {/* Close Button */}
                <button
                  onClick={() => setIsChatOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-700 transition-colors rounded-full hover:bg-slate-100/50"
                  aria-label="关闭输入框"
                >
                  <X size={18} />
                </button>

                {/* Input Field */}
                <input
                  type="text"
                  value={chatInputValue}
                  onChange={(e) => setChatInputValue(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder={chatMode === 'chat' ? "输入问题..." : "输入主题生成讲解..."}
                  className="w-[600px] px-5 py-2.5 bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
                />

                {/* Send Button */}
                <button
                  onClick={handleSendMessage}
                  disabled={!chatInputValue.trim()}
                  className="p-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full transition-colors disabled:opacity-30 disabled:cursor-not-allowed shadow-lg shadow-indigo-500/20"
                  aria-label="发送消息"
                >
                  <Send size={18} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Error Display */}
      {error && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 bg-red-50 border border-red-200 text-red-700 px-6 py-3 rounded-lg shadow-lg z-50">
          <p className="font-medium">加载失败</p>
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Loading */}
      {!markdownContent && !error && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-slate-600">正在加载课程内容...</p>
        </div>
      )}
    </div>
  );
}
