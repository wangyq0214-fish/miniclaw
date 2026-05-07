'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { RotateCcw, Maximize2, Minimize2, Volume2 } from 'lucide-react';
import { getApiBaseUrl } from '@/lib/auth';

interface HtmlAnimationViewerProps {
  content: string;
}

// Script injected into HTML: plays audio when subtitle text changes
const AUDIO_SYNC_SCRIPT = `
<script>
(function() {
  window.addEventListener('load', function() {
    setTimeout(function() {
      if (typeof subtitles === 'undefined' || !Array.isArray(subtitles)) return;
      var hasAudio = subtitles.some(function(s) { return s.audio; });
      if (!hasAudio) return;

      var subtitleEl = document.getElementById('subtitle-cn');
      if (!subtitleEl) return;

      // Build a map: subtitle text -> audio URL
      var audioMap = {};
      subtitles.forEach(function(s) {
        if (s.audio) audioMap[s.cn] = s.audio;
      });

      var player = new Audio();
      player.volume = 1.0;
      var lastText = '';
      var userClicked = false;

      // Listen for user click to unlock audio
      document.getElementById('viewport').addEventListener('click', function() {
        userClicked = true;
      }, { once: true });

      // Watch subtitle text changes — play matching audio
      var observer = new MutationObserver(function(mutations) {
        var text = subtitleEl.innerText;
        if (!text || text === lastText) return;
        lastText = text;

        var url = audioMap[text];
        if (!url) return;

        // Stop any currently playing audio
        player.pause();
        player.currentTime = 0;

        player.src = url;
        var p = player.play();
        if (p !== undefined) {
          p.catch(function() {
            // Autoplay blocked — will unlock after first click
          });
        }
      });

      observer.observe(subtitleEl, { childList: true, characterData: true, subtree: true });

      // Also play audio for the very first subtitle
      var firstText = subtitleEl.innerText;
      if (firstText && audioMap[firstText]) {
        player.src = audioMap[firstText];
        var p = player.play();
        if (p !== undefined) {
          p.catch(function() {
            // Autoplay blocked
          });
        }
      }
    }, 600);
  });
})();
</script>
`;

export function HtmlAnimationViewer({ content }: HtmlAnimationViewerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Process HTML: fix audio URLs + inject sync script
  const enhancedContent = useMemo(() => {
    if (!content) return content;

    let html = content;

    // Replace relative audio URLs with absolute URLs
    // /api/tts/audio/2/xxx -> http://host:port/api/tts/audio/2/xxx
    if (html.includes('/api/tts/audio/')) {
      html = html.replace(/\/api\/tts\/audio\//g, getApiBaseUrl() + '/api/tts/audio/');
    }

    // Inject audio sync script
    if (html.includes('subtitles')) {
      if (html.includes('</body>')) {
        html = html.replace('</body>', AUDIO_SYNC_SCRIPT + '\n</body>');
      } else {
        html += '\n' + AUDIO_SYNC_SCRIPT;
      }
    }

    // Ensure viewport meta for mobile scaling
    if (!html.includes('viewport')) {
      const viewport = '<meta name="viewport" content="width=device-width, initial-scale=1.0">';
      if (html.includes('<head>')) {
        html = html.replace('<head>', `<head>${viewport}`);
      } else if (html.includes('<html')) {
        html = html.replace(/(<html[^>]*>)/, `$1<head>${viewport}</head>`);
      }
    }

    return html;
  }, [content]);

  const handleReload = () => {
    if (iframeRef.current) {
      const doc = iframeRef.current.srcdoc;
      iframeRef.current.srcdoc = '';
      requestAnimationFrame(() => {
        if (iframeRef.current) iframeRef.current.srcdoc = doc;
      });
    }
  };

  const handleFullscreen = () => {
    if (iframeRef.current) {
      if (!document.fullscreenElement) {
        iframeRef.current.requestFullscreen();
        setIsFullscreen(true);
      } else {
        document.exitFullscreen();
        setIsFullscreen(false);
      }
    }
  };

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  return (
    <div className="flex flex-col h-full bg-[#0f172a] overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#1e293b] border-b border-[#334155] shrink-0">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
          <span className="text-xs text-slate-400 ml-2 font-mono">animation.html</span>
          <Volume2 className="w-3 h-3 text-slate-500 ml-1" />
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleReload}
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
            title="重新播放"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleFullscreen}
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
            title={isFullscreen ? '退出全屏' : '全屏播放'}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Iframe — sandbox allows scripts + same-origin for audio fetch */}
      <iframe
        ref={iframeRef}
        srcDoc={enhancedContent}
        className="flex-1 w-full min-h-0 border-0"
        title="HTML 动画"
        sandbox="allow-scripts allow-same-origin"
      />
    </div>
  );
}
