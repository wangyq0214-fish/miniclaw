'use client';

import { useEffect } from 'react';

interface HotkeyConfig {
  onNewSession?: () => void;
  onFocusComposer?: () => void;
  onStopStreaming?: () => void;
}

export function useGlobalHotkeys({
  onNewSession,
  onFocusComposer,
  onStopStreaming,
}: HotkeyConfig) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);

      const ctrlOrMeta = e.ctrlKey || e.metaKey;

      // Ctrl/Cmd + N — new session (avoid browser shortcut override when possible)
      if (ctrlOrMeta && (e.key === 'n' || e.key === 'N')) {
        // Skip when typing to avoid interfering
        if (!isTyping && onNewSession) {
          e.preventDefault();
          onNewSession();
          return;
        }
      }

      // Ctrl/Cmd + L — focus composer
      if (ctrlOrMeta && (e.key === 'l' || e.key === 'L')) {
        if (onFocusComposer) {
          e.preventDefault();
          onFocusComposer();
          return;
        }
      }

      // Esc — stop streaming (only when not in input/textarea where Esc has native meaning)
      if (e.key === 'Escape' && onStopStreaming) {
        onStopStreaming();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onNewSession, onFocusComposer, onStopStreaming]);
}
