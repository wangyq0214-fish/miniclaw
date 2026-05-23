import { useEffect, useRef, useState } from 'react';

interface UseTTSProps {
  text: string;
  enabled: boolean;
  onEnd?: () => void;
}

export function useTTS({ text, enabled, onEnd }: UseTTSProps) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    console.log('🔊 TTS Hook:', { enabled, textLength: text?.length, hasWindow: typeof window !== 'undefined' });

    if (!enabled || !text || typeof window === 'undefined') return;

    const playAudio = async () => {
      try {
        console.log('🎵 Starting TTS playback, text length:', text.length);

        // Stop any ongoing audio
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current = null;
        }

        // Abort any ongoing request
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }

        abortControllerRef.current = new AbortController();

        setIsSpeaking(true);

        // Call backend TTS API (MiMo model)
        const apiBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8002';
        console.log('📡 Calling TTS API:', `${apiBase}/api/tts/generate`);

        const response = await fetch(`${apiBase}/api/tts/generate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text: text,
            voice: '冰糖', // MiMo voice
          }),
          signal: abortControllerRef.current.signal
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('❌ TTS API error:', response.status, errorText);
          throw new Error(`TTS API error: ${response.status} - ${errorText}`);
        }

        // Get audio blob
        const audioBlob = await response.blob();
        console.log('📦 Received audio blob:', audioBlob.size, 'bytes');
        const audioUrl = URL.createObjectURL(audioBlob);

        // Create and play audio
        const audio = new Audio(audioUrl);
        audioRef.current = audio;

        audio.onended = () => {
          console.log('✅ Audio playback ended');
          setIsSpeaking(false);
          URL.revokeObjectURL(audioUrl);
          onEnd?.();
        };

        audio.onerror = (error) => {
          console.error('❌ Audio playback error:', error);
          setIsSpeaking(false);
          URL.revokeObjectURL(audioUrl);
        };

        console.log('▶️ Starting audio playback...');
        await audio.play();
        console.log('🎶 Audio is playing');

      } catch (error: any) {
        if (error.name !== 'AbortError') {
          console.error('❌ TTS error:', error);
        } else {
          console.log('⏹️ TTS aborted');
        }
        setIsSpeaking(false);
      }
    };

    playAudio();

    // Cleanup
    return () => {
      console.log('🧹 TTS cleanup');
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      setIsSpeaking(false);
    };
  }, [text, enabled, onEnd]);

  const stop = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsSpeaking(false);
  };

  const pause = () => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
  };

  const resume = () => {
    if (audioRef.current) {
      audioRef.current.play();
    }
  };

  return {
    isSpeaking,
    stop,
    pause,
    resume
  };
}
