'use client';

import { useRef, useCallback, useEffect, useState } from 'react';
import Editor, { OnMount, OnChange } from '@monaco-editor/react';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface MonacoEditorProps {
  value: string;
  onChange?: (value: string) => void;
  onSave?: (value: string) => void;
  language?: string;
  readOnly?: boolean;
  title?: string;
}

function useIsDark() {
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const update = () => setIsDark(document.documentElement.classList.contains('dark'));
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return isDark;
}

export function MonacoEditor({
  value,
  onChange,
  onSave,
  language = 'markdown',
  readOnly = false,
  title,
}: MonacoEditorProps) {
  const editorRef = useRef<unknown>(null);
  const isDark = useIsDark();

  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor;
  };

  const handleChange: OnChange = (value) => {
    if (onChange && value !== undefined) {
      onChange(value);
    }
  };

  const handleSave = useCallback(() => {
    if (onSave) {
      onSave(value);
    }
  }, [onSave, value]);

  return (
    <div className="h-full flex flex-col bg-card rounded-lg border border-border overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/40">
        <span className="text-sm font-medium text-muted-foreground truncate">
          {title || '编辑器'}
        </span>
        {!readOnly && onSave && (
          <Button size="sm" onClick={handleSave} className="h-7">
            <Save className="w-3 h-3 mr-1" />
            保存
          </Button>
        )}
      </div>

      <div className="flex-1">
        <Editor
          height="100%"
          language={language}
          value={value}
          onChange={handleChange}
          onMount={handleEditorMount}
          theme={isDark ? 'vs-dark' : 'vs'}
          options={{
            readOnly,
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: 'on',
            wordWrap: 'on',
            scrollBeyondLastLine: false,
            padding: { top: 10 },
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          }}
        />
      </div>
    </div>
  );
}
