import { useState, useMemo, useCallback } from 'react';

interface UseMarkdownPaginationReturn {
  currentPage: number;
  totalPages: number;
  currentContent: string;
  nextPage: () => void;
  prevPage: () => void;
  goToPage: (page: number) => void;
  isFirstPage: boolean;
  isLastPage: boolean;
}

export function useMarkdownPagination(
  markdown: string
): UseMarkdownPaginationReturn {
  const [currentPage, setCurrentPage] = useState(0);

  // Split markdown by h2 headings (##)
  const pages = useMemo(() => {
    if (!markdown || markdown.trim() === '') {
      return [''];
    }

    // Split by h2 headings, keeping the heading with each section
    const sections = markdown.split(/(?=^## )/m);

    // Filter out empty sections
    return sections.filter(section => section.trim() !== '');
  }, [markdown]);

  const totalPages = pages.length;
  const currentContent = pages[currentPage] || '';
  const isFirstPage = currentPage === 0;
  const isLastPage = currentPage === totalPages - 1;

  const nextPage = useCallback(() => {
    setCurrentPage(prev => Math.min(prev + 1, totalPages - 1));
  }, [totalPages]);

  const prevPage = useCallback(() => {
    setCurrentPage(prev => Math.max(prev - 1, 0));
  }, []);

  const goToPage = useCallback((page: number) => {
    setCurrentPage(Math.max(0, Math.min(page, totalPages - 1)));
  }, [totalPages]);

  return {
    currentPage,
    totalPages,
    currentContent,
    nextPage,
    prevPage,
    goToPage,
    isFirstPage,
    isLastPage,
  };
}
