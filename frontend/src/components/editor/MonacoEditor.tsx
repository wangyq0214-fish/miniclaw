'use client';

import { useRef, useCallback } from 'react';
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

export function MonacoEditor({
  value,
  onChange,
  onSave,
  language = 'markdown',
  readOnly = false,
  title,
}: MonacoEditorProps) {
  const editorRef = useRef<unknown>(null);

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
    <div className="h-full flex flex-col bg-white rounded-lg border border-gray-200/50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200/50 bg-gray-50/80">
        <span className="text-sm font-medium text-gray-600">
          {title || '编辑器'}
        </span>
        {!readOnly && onSave && (
          <Button size="sm" onClick={handleSave} className="h-7">
            <Save className="w-3 h-3 mr-1" />
            保存
          </Button>
        )}
      </div>

      {/* Editor */}
      <div className="flex-1">
        <Editor
          height="100%"
          language={language}
          value={value}
          onChange={handleChange}
          onMount={handleEditorMount}
          theme="vs"
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