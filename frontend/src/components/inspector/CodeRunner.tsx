'use client';

import { useState, useEffect } from 'react';
import { Play, Loader2, Terminal, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MonacoEditor } from '@/components/editor/MonacoEditor';
import { usePyodide } from '@/lib/usePyodide';

interface CodeRunnerProps {
  code: string;
  filename?: string;
  readOnly?: boolean;
}

export function CodeRunner({ code: initialCode, filename, readOnly = false }: CodeRunnerProps) {
  const [code, setCode] = useState(initialCode);

  // Sync when external code changes (e.g. from subagent streaming)
  useEffect(() => {
    setCode(initialCode);
  }, [initialCode]);
  const [output, setOutput] = useState('');
  const [hasError, setHasError] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const { status, error: pyodideError, runCode } = usePyodide();

  const handleRun = async () => {
    setIsRunning(true);
    setOutput('');
    setHasError(false);

    const result = await runCode(code);

    if (result.error) {
      setOutput(result.error);
      setHasError(true);
    } else {
      setOutput(result.output || '(无输出)');
    }
    setIsRunning(false);
  };

  const handleReset = () => {
    setCode(initialCode);
    setOutput('');
    setHasError(false);
  };

  const isLoading = status === 'loading';
  const loadError = status === 'error';

  return (
    <div className="h-full flex flex-col bg-card rounded-lg border border-border overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/40">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded">
            Python
          </span>
          {filename && (
            <span className="text-sm font-medium text-foreground truncate">{filename}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {!readOnly && (
            <Button
              size="sm"
              variant="ghost"
              onClick={handleReset}
              className="h-7 px-2"
              title="重置代码"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </Button>
          )}
          <Button
            size="sm"
            onClick={handleRun}
            disabled={isRunning || isLoading || loadError}
            className="h-7"
          >
            {isRunning ? (
              <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5 mr-1" />
            )}
            {isRunning ? '运行中...' : '运行'}
          </Button>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 min-h-0" style={{ flexBasis: '60%' }}>
        <MonacoEditor
          value={code}
          onChange={readOnly ? undefined : setCode}
          language="python"
          readOnly={readOnly}
          title={filename}
        />
      </div>

      {/* Output */}
      <div className="border-t border-border flex flex-col" style={{ flexBasis: '40%' }}>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/40 border-b border-border">
          <Terminal className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">输出</span>
        </div>
        <div className="flex-1 overflow-auto p-3">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>正在加载 Pyodide 运行时...</span>
            </div>
          ) : loadError ? (
            <pre className="text-sm text-red-500 whitespace-pre-wrap">
              Pyodide 加载失败: {pyodideError}
            </pre>
          ) : output ? (
            <pre
              className={`text-sm whitespace-pre-wrap font-mono ${
                hasError ? 'text-red-500' : 'text-foreground'
              }`}
            >
              {output}
            </pre>
          ) : (
            <span className="text-sm text-muted-foreground">点击 &quot;运行&quot; 执行代码</span>
          )}
        </div>
      </div>
    </div>
  );
}
