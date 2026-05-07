'use client';

import { useState, useEffect, type ReactNode } from 'react';
import { ClipboardList, FileCode, Loader2 } from 'lucide-react';
import { CardShell } from './CardShell';
import { MarkdownRenderer } from '@/components/chat/MarkdownRenderer';
import { CodeRunner } from './CodeRunner';
import { listFiles, readFile } from '@/lib/api';

interface CodeCaseCardProps {
  icon: ReactNode;
  label: string;
  path: string;
  content: string;
  onOpenInEditor?: () => void;
}

interface PyFile {
  name: string;
  path: string;
  content: string;
}

export function CodeCaseCard({ icon, label, path, content, onOpenInEditor }: CodeCaseCardProps) {
  const [pyFiles, setPyFiles] = useState<PyFile[]>([]);
  const [activeTab, setActiveTab] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadPyFiles() {
      // Extract directory path from the README file path
      // e.g. "workspace/generated/code-cases/2026-05-04-xxx/README.md" -> "workspace/generated/code-cases/2026-05-04-xxx/"
      const dir = path.replace(/\/[^/]+$/, '');

      try {
        const { files } = await listFiles(dir);
        const pyEntries = files.filter((f) => f.type === 'file' && f.name.endsWith('.py'));

        const loaded: PyFile[] = await Promise.all(
          pyEntries.map(async (f) => {
            const { content: code } = await readFile(f.path);
            return { name: f.name, path: f.path, content: code };
          }),
        );

        // Sort by filename (01_xxx.py, 02_xxx.py, ...)
        loaded.sort((a, b) => a.name.localeCompare(b.name));

        if (!cancelled) {
          setPyFiles(loaded);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    }

    loadPyFiles();
    return () => { cancelled = true; };
  }, [path]);

  return (
    <CardShell
      icon={icon}
      label={label}
      path={path}
      content={content}
      onOpenInEditor={onOpenInEditor}
    >
      {/* README content */}
      <div className="mb-4">
        <MarkdownRenderer content={content} />
      </div>

      {/* Python code tabs */}
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>加载代码文件...</span>
        </div>
      ) : pyFiles.length > 0 ? (
        <div className="border-t border-border pt-4">
          <div className="flex items-center gap-1 mb-3 overflow-x-auto">
            {pyFiles.map((f, i) => (
              <button
                key={f.path}
                onClick={() => setActiveTab(i)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                  activeTab === i
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                <FileCode className="w-3.5 h-3.5" />
                {f.name}
              </button>
            ))}
          </div>
          <div className="h-[500px]">
            <CodeRunner
              code={pyFiles[activeTab].content}
              filename={pyFiles[activeTab].name}
            />
          </div>
        </div>
      ) : (
        <div className="border-t border-border pt-4 text-sm text-muted-foreground">
          <FileCode className="w-4 h-4 inline mr-1.5" />
          未找到 Python 代码文件
        </div>
      )}
    </CardShell>
  );
}
