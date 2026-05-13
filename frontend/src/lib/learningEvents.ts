/**
 * Learning Event Logger
 *
 * Non-blocking, batched event logging for learning analytics.
 * Events are queued and flushed every 10 seconds or on page unload.
 */

interface LearningEvent {
  event_type: string;
  event_data: Record<string, unknown>;
  session_id?: string;
}

const FLUSH_INTERVAL = 10_000; // 10 seconds
const MAX_BATCH = 50;

let pendingEvents: LearningEvent[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let isInitialized = false;

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token');
}

async function flush(): Promise<void> {
  if (pendingEvents.length === 0) return;

  const events = pendingEvents.splice(0, MAX_BATCH);
  const token = getToken();
  if (!token) return;

  try {
    // Use fetch with keepalive for non-blocking delivery (works on page unload)
    await fetch('/api/evaluation/log-events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ events }),
      keepalive: true,
    });
  } catch {
    // Silently fail — event logging should not disrupt UX
  }
}

function ensureInitialized(): void {
  if (isInitialized || typeof window === 'undefined') return;
  isInitialized = true;

  // Periodic flush
  flushTimer = setInterval(flush, FLUSH_INTERVAL);

  // Flush on page unload
  window.addEventListener('beforeunload', () => {
    if (flushTimer) clearInterval(flushTimer);
    flush();
  });

  // Flush on visibility change (tab switch, minimize)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
}

/**
 * Log a learning event. Non-blocking, queued for batched delivery.
 */
export function logEvent(
  eventType: string,
  eventData: Record<string, unknown>,
  sessionId?: string,
): void {
  ensureInitialized();

  pendingEvents.push({
    event_type: eventType,
    event_data: eventData,
    session_id: sessionId,
  });

  // Flush immediately if batch is large
  if (pendingEvents.length >= MAX_BATCH) {
    flush();
  }
}

// ── Convenience wrappers ──

export function logQuizAnswer(params: {
  questionId: string;
  isCorrect: boolean;
  difficulty: string;
  topic: string;
}): void {
  logEvent('quiz_answer', {
    question_id: params.questionId,
    is_correct: params.isCorrect,
    difficulty: params.difficulty,
    topic: params.topic,
  });
}

export function logQuizComplete(params: {
  score: number;
  total: number;
  topic: string;
  duration?: number;
}): void {
  logEvent('quiz_complete', {
    score: params.score,
    total: params.total,
    topic: params.topic,
    duration: params.duration ?? params.total * 60, // estimate: 60s per question
  });
}

export function logFlashcardReview(params: {
  cardId: string;
  mastered: boolean;
  category: string;
}): void {
  logEvent('flashcard_review', {
    card_id: params.cardId,
    mastered: params.mastered,
    category: params.category,
  });
}

export function logChatMessage(params: {
  messageLength: number;
  preview?: string;
  sessionId?: string;
}): void {
  logEvent('chat_message', {
    message_length: params.messageLength,
    preview: params.preview?.slice(0, 100),
  }, params.sessionId);
}

export function logPageVisit(tab: string): void {
  logEvent('page_visit', { tab });
}

export function logGraphExplore(nodeId: string, nodeType: string): void {
  logEvent('graph_explore', { node_id: nodeId, node_type: nodeType });
}
