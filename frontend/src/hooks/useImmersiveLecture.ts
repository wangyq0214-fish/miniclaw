import { useState, useEffect, useCallback, useRef } from 'react';

interface ContentBlock {
  id: string;
  type: 'title' | 'insight' | 'formula' | 'list' | 'code' | 'text';
  content: string | string[];
  metadata?: Record<string, any>;
}

interface UseImmersiveLectureProps {
  courseId: string;
  chapterId: string;
  pageIndex: number;
  userId: number;
  markdownContent: string;
  autoStart?: boolean;
  forceRegenerate?: boolean;
}

interface UseImmersiveLectureReturn {
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
  goToBlock: (index: number) => void;
  addBlocks: (newBlocks: ContentBlock[]) => void;
  saveProgress: (blockIndex: number, section: number, completed?: boolean) => Promise<void>;
}

export function useImmersiveLecture({
  courseId,
  chapterId,
  pageIndex,
  userId,
  markdownContent,
  autoStart = true,
  forceRegenerate = false
}: UseImmersiveLectureProps): UseImmersiveLectureReturn {
  const [blocks, setBlocks] = useState<ContentBlock[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentSection, setCurrentSection] = useState(0);
  const [totalSections, setTotalSections] = useState(0);
  const [currentBlockIndex, setCurrentBlockIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef<boolean>(true);

  const start = useCallback(async () => {
    if (isStreaming) return;
    if (!markdownContent) {
      setError('No content available');
      return;
    }

    setBlocks([]);
    setError(null);
    setIsStreaming(true);
    setCurrentSection(0);
    setCurrentBlockIndex(0);
    setIsPaused(false);

    try {
      abortControllerRef.current = new AbortController();

      const token = localStorage.getItem('token');
      const apiBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8002';

      const response = await fetch(`${apiBase}/api/immersive-lecture/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        body: JSON.stringify({
          course_id: courseId,
          chapter_id: parseInt(chapterId),
          page_index: pageIndex,
          user_id: userId,
          markdown_content: markdownContent,
          force_regenerate: forceRegenerate
        }),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No reader available');
      }

      readerRef.current = reader;
      const decoder = new TextDecoder();
      let buffer = '';

      while (isMountedRef.current) {
        let done, value;
        try {
          ({ done, value } = await reader.read());
        } catch (readError: any) {
          // Handle abort during read - just exit silently
          if (readError.name === 'AbortError' || !isMountedRef.current) {
            break;
          }
          throw readError;
        }

        if (done || !isMountedRef.current) {
          if (isMountedRef.current) setIsStreaming(false);
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.type === 'content_block') {
                const newBlock: ContentBlock = {
                  id: data.metadata?.id || `block-${Date.now()}-${Math.random()}`,
                  type: data.block_type,
                  content: data.content,
                  metadata: data.metadata
                };

                if (!isPaused) {
                  setBlocks(prev => {
                    const newBlocks = [...prev, newBlock];
                    setCurrentBlockIndex(newBlocks.length - 1);
                    return newBlocks;
                  });
                }
              } else if (data.type === 'progress') {
                setCurrentSection(data.current_section);
                setTotalSections(data.total_sections);
              } else if (data.type === 'done') {
                setTotalSections(data.total_sections);
                setIsStreaming(false);
              } else if (data.type === 'error') {
                setError(data.error);
                setIsStreaming(false);
              }
            } catch (e) {
              console.error('Error parsing SSE data:', e);
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError' && isMountedRef.current) {
        console.error('Error in useImmersiveLecture:', err);
        setError(err.message || 'Failed to load lecture');
      }
      if (isMountedRef.current) setIsStreaming(false);
    }
  }, [courseId, chapterId, pageIndex, userId, markdownContent, isPaused]);

  const pause = useCallback(() => {
    setIsPaused(true);
  }, []);

  const resume = useCallback(() => {
    setIsPaused(false);
  }, []);

  const restart = useCallback(() => {
    try { abortControllerRef.current?.abort(); } catch (e) {}
    try { readerRef.current?.cancel(); } catch (e) {}
    abortControllerRef.current = null;
    readerRef.current = null;
    setBlocks([]);
    setCurrentSection(0);
    setCurrentBlockIndex(0);
    setError(null);
    setTimeout(() => start(), 100);
  }, [start]);

  const goToBlock = useCallback((index: number) => {
    if (index >= 0 && index < blocks.length) {
      setCurrentBlockIndex(index);
      // Update current section based on the block
      const block = blocks[index];
      if (block?.metadata?.section) {
        setCurrentSection(block.metadata.section);
      }
    }
  }, [blocks]);

  // Save progress to backend
  const saveProgress = useCallback(async (blockIndex: number, section: number, completed: boolean = false) => {
    try {
      const token = localStorage.getItem('token');
      const apiBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8002';

      await fetch(`${apiBase}/api/immersive-lecture/progress`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        body: JSON.stringify({
          user_id: userId,
          course_id: courseId,
          chapter_id: parseInt(chapterId),
          page_index: pageIndex,
          current_block_index: blockIndex,
          current_section: section,
          total_sections: totalSections,
          completed
        })
      });
    } catch (err) {
      console.error('Failed to save progress:', err);
    }
  }, [courseId, chapterId, pageIndex, userId, totalSections]);

  const addBlocks = useCallback((newBlocks: ContentBlock[]) => {
    setBlocks(prev => {
      // Calculate the next section number
      const maxSection = prev.reduce((max, block) => {
        const section = block.metadata?.section || 0;
        return Math.max(max, section);
      }, 0);

      // Update section numbers for new blocks
      const updatedNewBlocks = newBlocks.map((block, index) => ({
        ...block,
        metadata: {
          ...block.metadata,
          section: maxSection + 1 + (block.metadata?.section || 0)
        }
      }));

      const updatedBlocks = [...prev, ...updatedNewBlocks];
      setCurrentBlockIndex(updatedBlocks.length - 1);
      return updatedBlocks;
    });
  }, []);

  useEffect(() => {
    isMountedRef.current = true;

    if (autoStart && markdownContent) {
      start();
    }

    return () => {
      // Signal the reader loop to stop — it checks this on every iteration
      isMountedRef.current = false;
      // Clear refs so any in-flight reads find nothing to act on
      abortControllerRef.current = null;
      readerRef.current = null;
      // Do NOT call abort() or cancel() here — the reader loop exits
      // naturally when isMountedRef becomes null, avoiding AbortError noise.
    };
  }, [autoStart, markdownContent]);

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
    restart,
    goToBlock,
    addBlocks,
    saveProgress
  };
}
