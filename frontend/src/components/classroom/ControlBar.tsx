'use client';

import { Pause, Play, RotateCcw, ChevronLeft, ChevronRight } from 'lucide-react';

interface ControlBarProps {
  isPlaying: boolean;
  currentSection: number;
  totalSections: number;
  currentBlockIndex: number;
  totalBlocks: number;
  onPlayPause: () => void;
  onRestart: () => void;
  onSectionClick: (section: number) => void;
  onPrevBlock: () => void;
  onNextBlock: () => void;
}

export default function ControlBar({
  isPlaying,
  currentSection,
  totalSections,
  currentBlockIndex,
  totalBlocks,
  onPlayPause,
  onRestart,
  onSectionClick,
  onPrevBlock,
  onNextBlock
}: ControlBarProps) {
  return (
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20">
      <div className="flex items-center gap-6 px-8 py-3 bg-white/80 backdrop-blur-md rounded-full shadow-lg border border-slate-100">

        {/* Previous Block Button */}
        <button
          onClick={onPrevBlock}
          disabled={currentBlockIndex <= 0}
          className="text-slate-500 hover:text-slate-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="上一个"
        >
          <ChevronLeft size={20} />
        </button>

        {/* Play/Pause Button */}
        <button
          onClick={onPlayPause}
          className="text-slate-500 hover:text-slate-800 transition-colors"
          aria-label={isPlaying ? '暂停' : '播放'}
        >
          {isPlaying ? <Pause size={20} /> : <Play size={20} />}
        </button>

        {/* Next Block Button */}
        <button
          onClick={onNextBlock}
          disabled={currentBlockIndex >= totalBlocks - 1}
          className="text-slate-500 hover:text-slate-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="下一个"
        >
          <ChevronRight size={20} />
        </button>

        <div className="w-px h-6 bg-slate-200 mx-2"></div>

        {/* Progress Dots */}
        <div className="flex gap-2">
          {Array.from({ length: totalSections || 5 }, (_, i) => (
            <button
              key={i}
              onClick={() => onSectionClick(i + 1)}
              className={`h-2 rounded-full transition-all ${
                i + 1 <= currentSection
                  ? 'bg-indigo-500 w-8'
                  : 'bg-slate-200 w-2'
              }`}
              aria-label={`跳转到第 ${i + 1} 段`}
            />
          ))}
        </div>

        <div className="w-px h-6 bg-slate-200 mx-2"></div>

        {/* Restart Button */}
        <button
          onClick={onRestart}
          className="text-slate-500 hover:text-slate-800 transition-colors"
          aria-label="重新开始"
        >
          <RotateCcw size={20} />
        </button>
      </div>
    </div>
  );
}
