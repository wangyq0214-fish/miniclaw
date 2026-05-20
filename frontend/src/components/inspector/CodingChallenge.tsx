'use client';

import { useState, useCallback } from 'react';
import {
  Play,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Code2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MonacoEditor } from '@/components/editor/MonacoEditor';
import { MarkdownRenderer } from '@/components/chat/MarkdownRenderer';

// ---- Data Types ----

interface TestCase {
  input: string;
  expected: string;
  isHidden: boolean;
}

export interface CodingChallengeData {
  title: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  description: string;
  boilerplate: string;
  testCases: TestCase[];
}

interface TestResult {
  passed: boolean;
  actual: string;
  error: string | null;
}

// ---- Difficulty Badge ----

const difficultyStyles: Record<string, string> = {
  Easy: 'bg-emerald-500/10 text-emerald-500 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-500/20 dark:border-emerald-500/30',
  Medium: 'bg-amber-500/10 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400 border border-amber-500/20 dark:border-amber-500/30',
  Hard: 'bg-red-500/10 text-red-500 dark:bg-red-500/10 dark:text-red-400 border border-red-500/20 dark:border-red-500/30',
};

function DifficultyBadge({ level }: { level: string }) {
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded ${difficultyStyles[level] || ''}`}>
      {level}
    </span>
  );
}

// ---- API Call ----

async function executeCode(code: string, input: string): Promise<{ output: string; error: string | null }> {
  const res = await fetch('/api/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, input, timeout: 5 }),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const data = await res.json();
  return { output: data.output || '', error: data.error || null };
}

// ---- Main Component ----

interface CodingChallengeProps {
  data: CodingChallengeData;
  onCodeChange?: (code: string) => void;
}

export function CodingChallenge({ data, onCodeChange }: CodingChallengeProps) {
  const { title, difficulty, description, boilerplate, testCases } = data;

  const [code, setCode] = useState(boilerplate);
  const [results, setResults] = useState<(TestResult | null)[]>(
    new Array(testCases.length).fill(null)
  );
  const [isRunning, setIsRunning] = useState(false);
  const [consoleExpanded, setConsoleExpanded] = useState(false);
  const [showHidden, setShowHidden] = useState(false);

  const handleCodeChange = useCallback(
    (val: string) => {
      setCode(val);
      onCodeChange?.(val);
    },
    [onCodeChange]
  );

  const handleReset = useCallback(() => {
    setCode(boilerplate);
    setResults(new Array(testCases.length).fill(null));
    onCodeChange?.(boilerplate);
  }, [boilerplate, testCases.length, onCodeChange]);

  // ---- Run Tests ----

  const handleRunTests = useCallback(async () => {
    setIsRunning(true);
    setConsoleExpanded(true);
    setResults(new Array(testCases.length).fill(null));

    const newResults: (TestResult | null)[] = [];

    for (let i = 0; i < testCases.length; i++) {
      const tc = testCases[i];

      // Build test harness: user code + test driver
      const testScript = `
${code}

import json, sys

_input = json.loads('[${escapePy(tc.input)}]')

# Find first user-defined function
import types
_func = None
for _name, _obj in list(locals().items()):
    if callable(_obj) and not _name.startswith('_') and isinstance(_obj, types.FunctionType):
        _func = _obj
        break

if _func is None:
    print("ERROR: No function defined", file=sys.stderr)
    sys.exit(1)

if isinstance(_input, (list, tuple)):
    _result = _func(*_input)
else:
    _result = _func(_input)

print(json.dumps(_result, ensure_ascii=False, default=str))
`;

      try {
        const result = await executeCode(testScript, '');
        const actual = (result.output || '').trim();
        const err = result.error || null;

        if (err) {
          newResults.push({ passed: false, actual: '', error: err });
        } else {
          const passed = actual === tc.expected.trim();
          newResults.push({ passed, actual, error: null });
        }
      } catch (e) {
        newResults.push({
          passed: false,
          actual: '',
          error: e instanceof Error ? e.message : String(e),
        });
      }

      // Update results incrementally
      setResults([...newResults]);
    }

    setIsRunning(false);
  }, [code, testCases]);

  const passedCount = results.filter((r) => r?.passed).length;
  const allPassed = results.every((r) => r?.passed);

  return (
    <div className="h-full flex flex-col bg-card overflow-hidden">
      {/* ---- Header ---- */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2.5 min-w-0">
          <Code2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <h3 className="text-sm font-medium text-foreground truncate">{title}</h3>
          <DifficultyBadge level={difficulty} />
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            onClick={handleReset}
            className="h-7 px-2"
            title="重置代码"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="sm"
            onClick={handleRunTests}
            disabled={isRunning}
            className="h-7"
          >
            {isRunning ? (
              <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5 mr-1" />
            )}
            {isRunning ? '判题中...' : '运行测试'}
          </Button>
        </div>
      </div>

      {/* ---- Body: vertical stack ---- */}
      <div className="flex-1 flex flex-col min-h-0 overflow-auto">
        {/* Description */}
        <div className="px-4 py-3 border-b border-border">
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <MarkdownRenderer content={description} />
          </div>
        </div>

        {/* Code Editor */}
        <div className="border-b border-border" style={{ minHeight: 260 }}>
          <MonacoEditor
            value={code}
            onChange={handleCodeChange}
            language="python"
            title="solution.py"
          />
        </div>

        {/* Console / Results */}
        <div className="flex flex-col">
          {/* Console Header */}
          <button
            onClick={() => setConsoleExpanded(!consoleExpanded)}
            className="flex items-center justify-between px-4 py-2 bg-neutral-900 dark:bg-neutral-950 text-muted-foreground hover:text-foreground transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium">测试结果</span>
              {results.some((r) => r !== null) && (
                <span
                  className={`text-xs px-1.5 py-0.5 rounded ${
                    allPassed
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                      : 'bg-red-500/10 text-red-400 border border-red-500/30'
                  }`}
                >
                  {passedCount}/{testCases.length} 通过
                </span>
              )}
            </div>
            {consoleExpanded ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>

          {/* Console Body */}
          {consoleExpanded && (
            <div className="bg-neutral-900 dark:bg-neutral-950 max-h-[300px] overflow-auto">
              {/* Test case results */}
              <div className="p-3 space-y-2">
                {testCases.map((tc, i) => {
                  const result = results[i];
                  const isHidden = tc.isHidden && !showHidden;

                  return (
                    <div
                      key={i}
                      className={`rounded-md border text-sm font-mono ${
                        !result
                          ? 'bg-neutral-800/50 border-neutral-700/50 text-muted-foreground'
                          : result.passed
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                            : 'bg-red-500/10 border-red-500/30 text-red-400'
                      }`}
                    >
                      <div className="flex items-center justify-between px-3 py-2">
                        <div className="flex items-center gap-2">
                          {!result ? (
                            <span className="w-4 h-4 rounded-full border border-neutral-600 flex-shrink-0" />
                          ) : result.passed ? (
                            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                          ) : (
                            <XCircle className="w-4 h-4 flex-shrink-0" />
                          )}
                          <span>测试用例 {i + 1}</span>
                          {tc.isHidden && (
                            <span className="text-xs text-muted-foreground">(隐藏)</span>
                          )}
                        </div>
                        {result && (
                          <span className="text-xs">
                            {result.passed ? '通过' : '失败'}
                          </span>
                        )}
                      </div>

                      {!isHidden && (
                        <div className="px-3 pb-2 space-y-1 text-xs">
                          <div>
                            <span className="text-muted-foreground">输入: </span>
                            <span>{tc.input}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">期望: </span>
                            <span>{tc.expected}</span>
                          </div>
                          {result && !result.passed && result.actual && (
                            <div>
                              <span className="text-muted-foreground">实际: </span>
                              <span className="text-red-400">{result.actual}</span>
                            </div>
                          )}
                          {result?.error && (
                            <div className="mt-1 p-2 rounded bg-red-900/30 text-red-300 whitespace-pre-wrap">
                              {result.error}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Show hidden toggle */}
              {testCases.some((tc) => tc.isHidden) && (
                <div className="px-4 pb-3">
                  <button
                    onClick={() => setShowHidden(!showHidden)}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showHidden ? (
                      <EyeOff className="w-3 h-3" />
                    ) : (
                      <Eye className="w-3 h-3" />
                    )}
                    {showHidden ? '隐藏隐藏用例' : '显示隐藏用例'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Helpers ----

function escapePy(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
