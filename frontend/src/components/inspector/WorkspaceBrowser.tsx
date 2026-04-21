'use client';

import { useEffect, useState } from 'react';
import { ChevronRight, ChevronDown, FileText, Folder, FolderOpen, Loader2 } from 'lucide-react';
import { listFiles, type FileInfo } from '@/lib/api';

const ROOTS = [
  { path: 'workspace', label: 'workspace' },
  { path: 'memory', label: 'memory' },
  { path: 'knowledge/source', label: 'knowledge/source' },
] as const;

interface FileNodeProps {
  file: FileInfo;
  depth: number;
  activePath: string | null;
  onSelect: (path: string) => void;
}

function FileNode({ file, depth, activePath, onSelect }: FileNodeProps) {
  const [expanded, setExpanded] = useState(depth === 0);
  const [children, setChildren] = useState<FileInfo[] | null>(null);
  const [loading, setLoading] = useState(false);
  const isActive = activePath === file.path;

  useEffect(() => {
    if (file.type === 'directory' && expanded && children === null && !loading) {
      setLoading(true);
      listFiles(file.path)
        .then((res) => setChildren(res.files))
        .catch(() => setChildren([]))
        .finally(() => setLoading(false));
    }
  }, [expanded, file.path, file.type, children, loading]);

  if (file.type === 'directory') {
    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          style={{ paddingLeft: depth * 12 + 8 }}
          className="w-full flex items-center gap-1.5 py-1 pr-2 text-xs text-left rounded hover:bg-accent/50"
        >
          {expanded ? (
            <ChevronDown className="w-3 h-3 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-3 h-3 text-muted-foreground" />
          )}
          {expanded ? (
            <FolderOpen className="w-3.5 h-3.5 text-primary/70" />
          ) : (
            <Folder className="w-3.5 h-3.5 text-primary/70" />
          )}
          <span className="truncate text-foreground">{file.name}</span>
        </button>
        {expanded && (
          <div>
            {loading && (
              <div style={{ paddingLeft: (depth + 1) * 12 + 8 }} className="py-1 text-xs text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin inline mr-1" />
                加载中…
              </div>
            )}
            {children?.map((child) => (
              <FileNode
                key={child.path}
                file={child}
                depth={depth + 1}
                activePath={activePath}
                onSelect={onSelect}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={() => onSelect(file.path)}
      style={{ paddingLeft: depth * 12 + 20 }}
      className={`w-full flex items-center gap-1.5 py-1 pr-2 text-xs text-left rounded ${
        isActive ? 'bg-primary/10 text-primary' : 'hover:bg-accent/50 text-foreground'
      }`}
    >
      <FileText className="w-3.5 h-3.5 text-muted-foreground" />
      <span className="truncate">{file.name}</span>
    </button>
  );
}

interface WorkspaceBrowserProps {
  activePath: string | null;
  onSelect: (path: string) => void;
}

export function WorkspaceBrowser({ activePath, onSelect }: WorkspaceBrowserProps) {
  const [categorizedFiles, setCategorizedFiles] = useState<Record<string, FileInfo[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const allFiles: FileInfo[] = [];

      // Load files from workspace and memory
      for (const root of ROOTS) {
        try {
          const res = await listFiles(root.path);
          allFiles.push(...res.files);
        } catch {
          // Ignore errors
        }
      }

      // Categorize files
      const categories: Record<string, FileInfo[]> = {};
      for (const file of allFiles) {
        if (file.type === 'file') {
          const category = file.category || '其他资源';
          if (!categories[category]) {
            categories[category] = [];
          }
          categories[category].push(file);
        }
      }

      setCategorizedFiles(categories);
      setLoading(false);
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="p-3 text-xs text-muted-foreground flex items-center gap-1.5">
        <Loader2 className="w-3 h-3 animate-spin" />
        加载资源库…
      </div>
    );
  }

  const categoryOrder = [
    '记忆',
    '知识库',
    '课程讲义',
    '练习题',
    '思维导图',
    '阅读材料',
    '视频脚本',
    '代码案例',
    '其他资源',
  ];

  const sortedCategories = categoryOrder.filter((cat) => categorizedFiles[cat]);

  return (
    <div className="py-2">
      {sortedCategories.map((category) => (
        <div key={category} className="mb-3">
          <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            {category}
          </div>
          {categorizedFiles[category]?.length ? (
            <div className="space-y-0.5">
              {categorizedFiles[category].map((file) => (
                <button
                  key={file.path}
                  onClick={() => onSelect(file.path)}
                  className={`w-full flex items-center gap-1.5 py-1.5 px-3 text-xs text-left rounded ${
                    activePath === file.path
                      ? 'bg-primary/10 text-primary'
                      : 'hover:bg-accent/50 text-foreground'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="truncate">{file.name}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="px-3 py-1 text-xs text-muted-foreground/70">（空）</div>
          )}
        </div>
      ))}
      {sortedCategories.length === 0 && (
        <div className="text-center text-muted-foreground text-sm py-4">
          暂无资源
        </div>
      )}
    </div>
  );
}
