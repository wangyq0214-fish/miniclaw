import { useEffect, useRef } from 'react';

interface ContentBlock {
  id: string;
  type: string;
  content: string | string[];
  metadata?: Record<string, any>;
}

/**
 * TTS Preload Hook
 * Pre-generates audio for upcoming blocks while user is listening to current block
 * Backend caches audio files based on text hash, so repeated requests are instant
 */
export function useTTSPreload(
  blocks: ContentBlock[],
  currentBlockIndex: number,
  enabled: boolean,
  preloadCount: number = 3
) {
  const preloadedRef = useRef<Set<string>>(new Set());
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled || blocks.length === 0) return;

    // Cancel any ongoing preload requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    const preloadUpcoming = async () => {
      const apiBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8002';

      // Preload next N blocks
      for (let i = 1; i <= preloadCount; i++) {
        const targetIndex = currentBlockIndex + i;
        if (targetIndex >= blocks.length) break;

        const block = blocks[targetIndex];
        const speech = block?.metadata?.speech;

        if (!speech || preloadedRef.current.has(speech)) continue;

        // Mark as preloading
        preloadedRef.current.add(speech);

        try {
          const response = await fetch(`${apiBase}/api/tts/generate`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              text: speech,
              voice: '冰糖',
            }),
            signal: abortControllerRef.current?.signal
          });

          if (response.ok) {
            console.log(`🔊 TTS preloaded for block ${targetIndex}`);
          }
        } catch (error: any) {
          if (error.name !== 'AbortError') {
            console.warn(`TTS preload failed for block ${targetIndex}:`, error);
          }
          // Remove from preloaded set so it can be retried
          preloadedRef.current.delete(speech);
        }
      }
    };

    // Small delay before starting preload to avoid blocking current playback
    const timer = setTimeout(preloadUpcoming, 1000);

    return () => {
      clearTimeout(timer);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [blocks, currentBlockIndex, enabled, preloadCount]);

  // Reset preloaded set when blocks change significantly
  useEffect(() => {
    const blockIds = blocks.map(b => b.id).join(',');
    return () => {
      // Cleanup when component unmounts
      preloadedRef.current.clear();
    };
  }, [blocks]);
}
