'use client';

import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import type { Components } from 'react-markdown';
import { CodeBlock } from './CodeBlock';
import { MermaidBlock } from './MermaidBlock';

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

const components: Components = {
  img: ({ src, alt, ...rest }) => {
    // Transform relative image paths for knowledge assets
    let imageSrc = src;
    if (src && !src.startsWith('http') && !src.startsWith('data:')) {
      // Images are stored in knowledge/assets directory
      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8002';
      imageSrc = `${apiBase}/static/knowledge/assets/${src}`;
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
  a: ({ href, children, ...rest }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary underline underline-offset-2 hover:text-primary/80"
      {...rest}
    >
      {children}
    </a>
  ),
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
  p: ({ children }) => <p className="my-2 leading-relaxed">{children}</p>,
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

    return <CodeBlock code={codeText} language={match?.[1]} />;
  },
  pre: ({ children }) => <>{children}</>, // CodeBlock handles its own <pre>
};

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

function MarkdownRendererImpl({ content, className }: MarkdownRendererProps) {
  return (
    <div className={`markdown-body text-sm text-foreground ${className ?? ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeSanitize, sanitizeSchema], rehypeKatex]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export const MarkdownRenderer = memo(MarkdownRendererImpl);
