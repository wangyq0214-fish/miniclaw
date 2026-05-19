import { useCallback, useRef, useState } from 'react';
import { streamSubagent, type SubAgentRequest } from '@/lib/api';
import { useApp } from '@/lib/store';

interface UseSubagentOptions {
  /** Optional setter for a global loading indicator (e.g. isGeneratingQuiz in store) */
  onBeforeStart?: () => void;
  /** Called after stream completes (success or error), before filesVersion increment */
  onAfterComplete?: () => void;
}

/**
 * Universal hook for invoking sub-agents.
 * Handles streaming, loading state, and auto-refreshes resource list on completion.
 */
export function useSubagent(options?: UseSubagentOptions) {
  const { actions } = useApp();
  const [isRunning, setIsRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const invoke = useCallback(async (request: SubAgentRequest): Promise<string> => {
    const controller = new AbortController();
    abortRef.current = controller;
    setIsRunning(true);
    optionsRef.current?.onBeforeStart?.();

    let result = '';
    try {
      for await (const event of streamSubagent(request, controller.signal)) {
        const type = (event as Record<string, unknown>).type as string;
        if (type === 'token') {
          result += (event as Record<string, unknown>).content as string;
        }
      }
      return result;
    } finally {
      setIsRunning(false);
      abortRef.current = null;
      optionsRef.current?.onAfterComplete?.();
      actions.incrementFilesVersion();
    }
  }, [actions]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { invoke, isRunning, cancel };
}
