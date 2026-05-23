'use client';

import { useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeSanitize from 'rehype-sanitize';
import { useMarkdownPagination } from '@/hooks/useMarkdownPagination';
import { PaginationControls } from './PaginationControls';
import 'katex/dist/katex.min.css';

interface CourseViewerProps {
  markdown: string;
  className?: string;
  courseId?: string;
  chapterId?: string;
  // External pagination control (from ChapterResourceTabs)
  currentPage?: number;
  totalPages?: number;
  currentContent?: string;
  onNextPage?: () => void;
  onPrevPage?: () => void;
  isFirstPage?: boolean;
  isLastPage?: boolean;
}

// Get backend API base URL for static assets
function getStaticBaseUrl() {
  if (typeof window === 'undefined') return 'http://localhost:8002';
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  return `${window.location.protocol}//${window.location.hostname}:8002`;
}

export function CourseViewer({
  markdown,
  className = '',
  courseId,
  chapterId,
  currentPage: extCurrentPage,
  totalPages: extTotalPages,
  currentContent: extCurrentContent,
  onNextPage,
  onPrevPage,
  isFirstPage: extIsFirstPage,
  isLastPage: extIsLastPage,
}: CourseViewerProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Transform relative image paths to absolute URLs
  const transformedMarkdown = useMemo(() => {
    const baseUrl = getStaticBaseUrl();
    return markdown.replace(
      /!\[([^\]]*)\]\((?!http)([^)]+)\)/g,
      `![$1](${baseUrl}/static/knowledge/assets/$2)`
    );
  }, [markdown]);

  // Internal pagination (used when no external pagination is provided)
  const internalPagination = useMarkdownPagination(transformedMarkdown);

  // Use external pagination if provided, otherwise use internal
  const currentPage = extCurrentPage ?? internalPagination.currentPage;
  const totalPages = extTotalPages ?? internalPagination.totalPages;
  const currentContent = extCurrentContent ?? internalPagination.currentContent;
  const isFirstPage = extIsFirstPage ?? internalPagination.isFirstPage;
  const isLastPage = extIsLastPage ?? internalPagination.isLastPage;
  const prevPageFn = onPrevPage ?? internalPagination.prevPage;
  const nextPageFn = onNextPage ?? internalPagination.nextPage;

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && !isFirstPage) {
        prevPageFn();
      } else if (e.key === 'ArrowRight' && !isLastPage) {
        nextPageFn();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFirstPage, isLastPage, nextPageFn, prevPageFn]);

  return (
    <div className={`relative h-full flex flex-col ${className}`}>
      {/* Scrollable Content Area with breathing space */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto w-full flex justify-center bg-gray-50/30 dark:bg-zinc-950"
      >
        <div className="w-full max-w-3xl px-8 py-16 sm:px-12">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentPage}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{
                duration: 0.3,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="
                prose prose-slate dark:prose-invert max-w-none
                font-sans leading-relaxed
                prose-headings:font-semibold prose-headings:text-slate-900 dark:prose-headings:text-zinc-100
                prose-h1:text-3xl prose-h1:mb-8 prose-h1:mt-2 prose-h1:leading-tight
                prose-h2:text-2xl prose-h2:mt-16 prose-h2:mb-6 prose-h2:leading-snug
                prose-h3:text-xl prose-h3:mt-10 prose-h3:mb-4 prose-h3:leading-snug
                prose-p:text-slate-700 dark:prose-p:text-zinc-400 prose-p:mb-5 prose-p:leading-[1.75]
                prose-li:my-1.5 prose-li:text-slate-700 dark:prose-li:text-zinc-400
                prose-a:text-blue-600 dark:prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline prose-a:font-medium
                prose-strong:text-slate-900 dark:prose-strong:text-zinc-200 prose-strong:font-semibold
                prose-code:text-sm prose-code:font-mono prose-code:text-pink-600 dark:prose-code:text-pink-400
                prose-code:bg-slate-100 dark:prose-code:bg-zinc-800 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded
                prose-pre:bg-slate-100 dark:prose-pre:bg-zinc-900 prose-pre:border prose-pre:border-slate-200 dark:prose-pre:border-zinc-800
                prose-blockquote:border-l-slate-300 dark:prose-blockquote:border-l-zinc-700 prose-blockquote:text-slate-600 dark:prose-blockquote:text-zinc-400
                prose-img:rounded-lg prose-img:shadow-md prose-img:my-8
                prose-hr:border-slate-200 dark:prose-hr:border-zinc-800 prose-hr:my-12
                prose-table:text-sm
              "
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex, rehypeSanitize]}
              >
                {currentContent}
              </ReactMarkdown>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <PaginationControls
          currentPage={currentPage}
          totalPages={totalPages}
          onPrevPage={prevPageFn}
          onNextPage={nextPageFn}
          isFirstPage={isFirstPage}
          isLastPage={isLastPage}
          scrollContainerRef={scrollContainerRef}
        />
      )}
    </div>
  );
}
