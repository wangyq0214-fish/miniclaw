'use client';

import { useState, useEffect } from 'react';
import { mockLectureBlocks } from '@/lib/mockLectureData';

interface ContentBlock {
  id: string;
  type: 'title' | 'insight' | 'formula' | 'list' | 'code' | 'text';
  content: string | string[];
  metadata?: Record<string, any>;
}

interface UseMockLectureProps {
  enabled?: boolean;
  delay?: number;
}

interface UseMockLectureReturn {
  blocks: ContentBlock[];
  isStreaming: boolean;
  error: string | null;
  currentSection: number;
  totalSections: number;
  currentBlockIndex: number;
  start: () => void;
  pause: () => void;
  resume: () => void;
  restart: () => void;
}

export function useMockLecture({
  enabled = true,
  delay = 800
}: UseMockLectureProps = {}): UseMockLectureReturn {
  const [blocks, setBlocks] = useState<ContentBlock[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentSection, setCurrentSection] = useState(0);
  const [currentBlockIndex, setCurrentBlockIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const totalSections = 6;

  const start = () => {
    if (!enabled) return;

    setBlocks([]);
    setError(null);
    setIsStreaming(true);
    setCurrentSection(0);
    setCurrentBlockIndex(0);
    setIsPaused(false);

    let index = 0;
    const interval = setInterval(() => {
      if (index >= mockLectureBlocks.length) {
        clearInterval(interval);
        setIsStreaming(false);
        return;
      }

      if (!isPaused) {
        const block = mockLectureBlocks[index];
        setBlocks(prev => [...prev, block]);
        setCurrentBlockIndex(index);

        // Update section
        const blockSection = block.metadata?.section || 0;
        setCurrentSection(blockSection);

        index++;
      }
    }, delay);

    return () => clearInterval(interval);
  };

  const pause = () => {
    setIsPaused(true);
  };

  const resume = () => {
    setIsPaused(false);
  };

  const restart = () => {
    setBlocks([]);
    setCurrentSection(0);
    setCurrentBlockIndex(0);
    setError(null);
    setIsPaused(false);
    setTimeout(() => start(), 100);
  };

  useEffect(() => {
    if (enabled) {
      start();
    }
  }, [enabled]);

  return {
    blocks,
    isStreaming,
    error,
    currentSection,
    totalSections,
    currentBlockIndex,
    start,
    pause,
    resume,
    restart
  };
}
