import { ChevronLeft, ChevronRight } from 'lucide-react';
import { RefObject } from 'react';

interface PaginationControlsProps {
  currentPage: number;
  totalPages: number;
  onPrevPage: () => void;
  onNextPage: () => void;
  isFirstPage: boolean;
  isLastPage: boolean;
  scrollContainerRef?: RefObject<HTMLElement>;
}

export function PaginationControls({
  currentPage,
  totalPages,
  onPrevPage,
  onNextPage,
  isFirstPage,
  isLastPage,
  scrollContainerRef,
}: PaginationControlsProps) {
  const handlePrev = () => {
    onPrevPage();
    scrollToTop();
  };

  const handleNext = () => {
    onNextPage();
    scrollToTop();
  };

  const scrollToTop = () => {
    if (scrollContainerRef?.current) {
      scrollContainerRef.current.scrollTo({
        top: 0,
        behavior: 'smooth',
      });
    }
  };

  return (
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-40">
      <div className="flex items-center gap-4 px-5 py-2.5 bg-white/80 backdrop-blur-md border border-gray-200/60 rounded-full shadow-sm dark:bg-zinc-900/80 dark:border-zinc-800">
        {/* Previous Button */}
        <button
          onClick={handlePrev}
          disabled={isFirstPage}
          className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-all disabled:opacity-30 disabled:hover:bg-transparent dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800"
          aria-label="上一节"
        >
          <ChevronLeft size={18} strokeWidth={2.5} />
        </button>

        {/* Page Indicator with monospace font to prevent jitter */}
        <span className="text-sm font-mono font-medium text-gray-500 tracking-widest dark:text-zinc-400">
          {currentPage + 1} <span className="opacity-50 mx-1">/</span> {totalPages}
        </span>

        {/* Next Button */}
        <button
          onClick={handleNext}
          disabled={isLastPage}
          className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-all disabled:opacity-30 disabled:hover:bg-transparent dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800"
          aria-label="下一节"
        >
          <ChevronRight size={18} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}
