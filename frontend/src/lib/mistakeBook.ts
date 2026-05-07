'use client';

const STORAGE_KEY = 'miniclaw_mistake_book';

export interface MistakeEntry {
  question_id: string;
  question_text_md: string;
  difficulty: string;
  options: {
    id: string;
    is_correct: boolean;
    text_md: string;
    explanation_md: string;
  }[];
  user_selected_id: string;
  topic: string;
  added_at: string;
}

export function getMistakes(): MistakeEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addMistake(entry: MistakeEntry): boolean {
  const mistakes = getMistakes();
  if (mistakes.some(m => m.question_id === entry.question_id)) return false;
  mistakes.unshift(entry);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(mistakes));
  return true;
}

export function removeMistake(questionId: string): void {
  const mistakes = getMistakes().filter(m => m.question_id !== questionId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(mistakes));
}

export function clearMistakes(): void {
  localStorage.removeItem(STORAGE_KEY);
}
