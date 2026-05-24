'use client';

import { memo, useState, useEffect, useRef } from 'react';
import { getApiBaseUrl } from '@/lib/auth';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import type { Components } from 'react-markdown';
import { CodeBlock } from './CodeBlock';
import { MermaidBlock } from './MermaidBlock';
import { AnimationBlock } from './AnimationBlock';
import { VideoCard } from './VideoCard';

// Extend sanitize schema to allow KaTeX's className attribute on common elements.
const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...(defaultSchema.attributes || {}),
    '*': [...((defaultSchema.attributes || {})['*'] || []), 'className', 'style'],
    span: [...((defaultSchema.attributes || {}).span || []), 'className', 'style'],
    div: [...((defaultSchema.attributes || {}).div || []), 'className', 'style'],
  },
};

function AuthVideo({ src, className }: { src: string; className?: string }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const prevUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!src) return;
    // Revoke previous blob URL
    if (prevUrlRef.current) {
      URL.revokeObjectURL(prevUrlRef.current);
      prevUrlRef.current = null;
    }
    setBlobUrl(null);
    setError(false);

    const token = localStorage.getItem('token');
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};

    fetch(src, { headers })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        prevUrlRef.current = url;
        setBlobUrl(url);
      })
      .catch(() => setError(true));

    return () => {
      if (prevUrlRef.current) {
        URL.revokeObjectURL(prevUrlRef.current);
        prevUrlRef.current = null;
      }
    };
  }, [src]);

  if (error) {
    return (
      <div className="my-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-muted-foreground">
        视频加载失败
      </div>
    );
  }

  return (
    <video
      src={blobUrl ?? undefined}
      controls
      playsInline
      preload="metadata"
      className={className ?? 'max-w-full h-auto rounded-lg my-3'}
    />
  );
}

const components: Components = {
  img: ({ src, alt, ...rest }) => {
    const srcStr = typeof src === 'string' ? src : '';
    // Detect video files by extension and render <video> instead of <img>
    if (srcStr && /\.(mp4|webm|ogg)$/i.test(srcStr)) {
      const apiBase = getApiBaseUrl();
      // Encode each path segment individually — keep '/' intact for FastAPI :path route
      const encodedPath = srcStr.startsWith('http')
        ? srcStr
        : `${apiBase}/api/videos/${srcStr.split('/').map(encodeURIComponent).join('/')}`;
      return <AuthVideo src={encodedPath} />;
    }
    // Transform relative image paths for knowledge assets
    let imageSrc = srcStr;
    if (srcStr && !srcStr.startsWith('http') && !srcStr.startsWith('data:')) {
      // Images are stored in knowledge/assets directory
      const apiBase = getApiBaseUrl();
      imageSrc = `${apiBase}/static/knowledge/assets/${srcStr}`;
    }
    return (
      <img
        src={imageSrc}
        alt={alt}
        className="max-w-full h-auto rounded-lg my-3"
        {...rest}
      />
    );
  },
  a: ({ href, children, ...rest }) => {
    const hrefStr = typeof href === 'string' ? href : '';

    // Detect Bilibili video URLs
    const bilibiliMatch = hrefStr.match(/bilibili\.com\/video\/(BV\w+)/);
    if (bilibiliMatch) {
      const bvid = bilibiliMatch[1];
      const title = typeof children === 'string' ? children : undefined;
      return <VideoCard bvid={bvid} title={title} />;
    }

    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline underline-offset-2 hover:text-primary/80"
        {...rest}
      >
        {children}
      </a>
    );
  },
  h1: ({ children }) => (
    <h1 className="mt-6 mb-2 text-2xl font-semibold text-foreground border-b border-border pb-1">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-6 mb-2 text-xl font-semibold text-foreground">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-3 mb-1.5 text-base font-semibold text-foreground">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="mt-3 mb-1 text-sm font-semibold text-foreground">{children}</h4>
  ),
  p: ({ children }) => <div className="my-2 leading-relaxed">{children}</div>,
  ul: ({ children }) => <ul className="my-2 ml-5 list-disc space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 ml-5 list-decimal space-y-1">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-4 border-primary/50 bg-primary/5 rounded-r-lg pl-3 py-2 text-muted-foreground italic">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-4 border-border" />,
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-muted/50">{children}</thead>,
  th: ({ children }) => (
    <th className="border-b border-border px-3 py-1.5 text-left font-medium">{children}</th>
  ),
  td: ({ children }) => (
    <td className="border-b border-border/60 px-3 py-1.5 align-top">{children}</td>
  ),
  code: (props) => {
    const { className, children, ...rest } = props as {
      className?: string;
      children?: React.ReactNode;
      node?: unknown;
    };
    const match = /language-(\w+)/.exec(className || '');
    const codeText = String(children ?? '').replace(/\n$/, '');

    // Inline code: no language class AND no newline
    const isInline = !match && !codeText.includes('\n');
    if (isInline) {
      return (
        <code
          className="rounded bg-muted px-1 py-0.5 font-mono text-[0.875em] text-foreground"
          {...rest}
        >
          {children}
        </code>
      );
    }

    const lang = match?.[1]?.toLowerCase();
    if (lang === 'mermaid') return <MermaidBlock code={codeText} />;
    if (lang === 'html-animation') return <AnimationBlock code={codeText} />;

    return <CodeBlock code={codeText} language={match?.[1]} />;
  },
  pre: ({ children }) => <>{children}</>, // CodeBlock handles its own <pre>
};

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

function MarkdownRendererImpl({ content, className }: MarkdownRendererProps) {
  // Filter out tool call JSON blocks that the model outputs as text
  // Pattern: ```json\n{ "tool": "...", ... }\n``` or ```\n<tool_call>...\n```
  const filteredContent = content.replace(
    /```(?:json)?\s*\n\s*\{\s*\n\s*"tool"\s*:\s*"[^"]+"\s*,[\s\S]*?\}\s*\n```/g,
    ''
  ).replace(
    /<tool_call>[\s\S]*?<\/tool_call>/g,
    ''
  ).replace(
    /\n{3,}/g,  // Collapse multiple blank lines
    '\n\n'
  ).trim();

  return (
    <div className={`markdown-body text-sm text-foreground ${className ?? ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeSanitize, sanitizeSchema], rehypeKatex]}
        components={components}
      >
        {filteredContent}
      </ReactMarkdown>
    </div>
  );
}

export const MarkdownRenderer = memo(MarkdownRendererImpl);
