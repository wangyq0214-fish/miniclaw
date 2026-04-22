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
  const [roots, setRoots] = useState<FileInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const rootFiles: FileInfo[] = [];

      // Load root directories
      for (const root of ROOTS) {
        rootFiles.push({
          name: root.label,
          path: root.path,
          type: 'directory',
          size: 0,
        });
      }

      setRoots(rootFiles);
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


  return (
    <div className="py-2">
      {roots.map((root) => (
        <FileNode
          key={root.path}
          file={root}
          depth={0}
          activePath={activePath}
          onSelect={onSelect}
        />
      ))}
      {roots.length === 0 && (
        <div className="text-center text-muted-foreground text-sm py-4">
          暂无资源
        </div>
      )}
    </div>
  );
}
