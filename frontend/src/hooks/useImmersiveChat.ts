import { useState, useCallback, useRef } from 'react';

export type ChatMode = 'chat' | 'generate';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ContentBlock {
  id: string;
  type: 'title' | 'insight' | 'formula' | 'list' | 'code' | 'text';
  content: string | string[];
  metadata?: Record<string, any>;
}

interface UseImmersiveChatProps {
  courseId: string;
  chapterId: string;
  pageIndex: number;
  userId: number;
  mode: ChatMode;
  onNewContent?: (blocks: ContentBlock[]) => void;
}

export function useImmersiveChat({
  courseId,
  chapterId,
  pageIndex,
  userId,
  mode,
  onNewContent
}: UseImmersiveChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isStreaming) return;

    // Determine if this is a generate request based on mode
    const isCustomTopic = mode === 'generate';

    // Add user message
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: content.trim(),
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMessage]);
    setIsStreaming(true);
    setError(null);

    // Create assistant message placeholder
    const assistantMessageId = `assistant-${Date.now()}`;
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date()
    };
    setMessages(prev => [...prev, assistantMessage]);

    try {
      abortControllerRef.current = new AbortController();

      const apiBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8002';

      // Choose API endpoint based on mode
      const endpoint = isCustomTopic
        ? `${apiBase}/api/immersive-lecture/generate-custom`
        : `${apiBase}/api/immersive-lecture/chat`;

      const body = isCustomTopic
        ? {
            user_id: userId,
            course_id: courseId,
            chapter_id: parseInt(chapterId),
            page_index: pageIndex,
            topic: content.trim()  // In generate mode, the entire content is the topic
          }
        : {
            user_id: userId,
            course_id: courseId,
            chapter_id: parseInt(chapterId),
            page_index: pageIndex,
            message: content.trim(),
            chat_history: messages.slice(-10).map(m => ({
              role: m.role,
              content: m.content,
              timestamp: m.timestamp.toISOString()
            }))
          };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No reader available');
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let accumulatedContent = '';
      let newBlocks: ContentBlock[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.type === 'message') {
                accumulatedContent += data.content;
                // Update assistant message
                setMessages(prev =>
                  prev.map(m =>
                    m.id === assistantMessageId
                      ? { ...m, content: accumulatedContent }
                      : m
                  )
                );
              } else if (data.type === 'content_block') {
                // New content block for custom topic
                newBlocks.push({
                  id: data.metadata?.id || `block-${Date.now()}-${Math.random()}`,
                  type: data.block_type as ContentBlock['type'],
                  content: data.content,
                  metadata: data.metadata
                });
              } else if (data.type === 'done') {
                // If we collected new blocks, notify via callback
                if (newBlocks.length > 0 && onNewContent) {
                  onNewContent(newBlocks);
                  // Update assistant message to confirm
                  accumulatedContent += `\n\n✅ 已生成 ${newBlocks.length} 个讲解内容块`;
                  setMessages(prev =>
                    prev.map(m =>
                      m.id === assistantMessageId
                        ? { ...m, content: accumulatedContent }
                        : m
                    )
                  );
                }
              } else if (data.type === 'error') {
                throw new Error(data.error);
              }
            } catch (e) {
              console.error('Error parsing SSE data:', e);
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Chat error:', err);
        setError(err.message || 'Failed to send message');
        // Update assistant message with error
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantMessageId
              ? { ...m, content: '抱歉，发生了错误。请稍后再试。' }
              : m
          )
        );
      }
    } finally {
      setIsStreaming(false);
    }
  }, [courseId, chapterId, pageIndex, userId, messages, isStreaming, onNewContent]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return {
    messages,
    isStreaming,
    error,
    sendMessage,
    clearMessages
  };
}
