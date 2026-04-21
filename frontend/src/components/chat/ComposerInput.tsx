'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Send, Square, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ComposerInputProps {
  onSend: (message: string) => void;
  onStop: () => void;
  isLoading: boolean;
  disabled?: boolean;
  placeholder?: string;
}

const MAX_ROWS = 8;
const MIN_HEIGHT = 44;

export function ComposerInput({
  onSend,
  onStop,
  isLoading,
  disabled,
  placeholder = '输入消息…  Enter 发送 / Shift+Enter 换行',
}: ComposerInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState('');
  const composingRef = useRef(false);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const lineHeight = parseFloat(getComputedStyle(ta).lineHeight || '20');
    const maxHeight = lineHeight * MAX_ROWS + 20;
    ta.style.height = Math.min(Math.max(ta.scrollHeight, MIN_HEIGHT), maxHeight) + 'px';
    ta.style.overflowY = ta.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [value]);

  useEffect(() => {
    const handler = () => textareaRef.current?.focus();
    window.addEventListener('miniclaw:focus-composer', handler);
    return () => window.removeEventListener('miniclaw:focus-composer', handler);
  }, []);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || isLoading || disabled) return;
    onSend(trimmed);
    setValue('');
  };

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !composingRef.current) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex gap-2 items-end"
    >
      <div className="flex-1 relative">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKey}
          onCompositionStart={() => { composingRef.current = true; }}
          onCompositionEnd={() => { composingRef.current = false; }}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className="w-full resize-none px-4 py-3 bg-muted rounded-xl border border-transparent text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring placeholder:text-muted-foreground/70 disabled:opacity-60"
          style={{ minHeight: MIN_HEIGHT }}
        />
      </div>
      {isLoading ? (
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          onClick={onStop}
          aria-label="停止生成"
          className="self-stretch h-auto min-h-[44px]"
        >
          <Square className="w-4 h-4" />
        </Button>
      ) : (
        <Button
          type="submit"
          size="icon-lg"
          disabled={!value.trim() || disabled}
          aria-label="发送"
          className="self-stretch h-auto min-h-[44px]"
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      )}
    </form>
  );
}
