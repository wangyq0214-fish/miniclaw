'use client';

import { useState } from 'react';
import { Play, ExternalLink, User, Eye } from 'lucide-react';

interface VideoCardProps {
  bvid: string;
  title?: string;
  author?: string;
  play?: number;
  duration?: string;
}

export function VideoCard({ bvid, title, author, play, duration }: VideoCardProps) {
  const [isPlaying, setIsPlaying] = useState(false);

  const videoUrl = `https://www.bilibili.com/video/${bvid}`;
  const embedUrl = `https://player.bilibili.com/player.html?bvid=${bvid}&high_quality=1&autoplay=0`;

  const formatPlayCount = (count?: number) => {
    if (!count) return '';
    if (count >= 10000) return `${(count / 10000).toFixed(1)}万`;
    return String(count);
  };

  if (isPlaying) {
    return (
      <div className="my-3 rounded-xl overflow-hidden border border-gray-200 dark:border-zinc-700 bg-black">
        <div className="relative w-full" style={{ paddingTop: '56.25%' }}>
          <iframe
            src={embedUrl}
            className="absolute inset-0 w-full h-full"
            allowFullScreen
            allow="autoplay; encrypted-media"
            sandbox="allow-scripts allow-same-origin allow-popups"
            title={title || 'Bilibili Video'}
          />
        </div>
        <div className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-zinc-800">
          <span className="text-sm text-gray-600 dark:text-zinc-400 truncate flex-1 mr-2">
            {title || bvid}
          </span>
          <a
            href={videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-500 hover:text-blue-600 flex items-center gap-1 shrink-0"
          >
            <ExternalLink className="w-3 h-3" />
            在 B 站打开
          </a>
        </div>
      </div>
    );
  }

  return (
    <div
      className="my-3 rounded-xl overflow-hidden border border-gray-200 dark:border-zinc-700 hover:border-pink-300 dark:hover:border-pink-600 transition-colors cursor-pointer group"
      onClick={() => setIsPlaying(true)}
    >
      <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-pink-50 to-blue-50 dark:from-pink-950/20 dark:to-blue-950/20">
        {/* Play button */}
        <div className="w-12 h-12 rounded-full bg-pink-500 flex items-center justify-center shrink-0 group-hover:bg-pink-600 transition-colors shadow-lg">
          <Play className="w-5 h-5 text-white ml-0.5" fill="white" />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-900 dark:text-zinc-100 truncate">
            {title || bvid}
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-zinc-400">
            {author && (
              <span className="flex items-center gap-1">
                <User className="w-3 h-3" />
                {author}
              </span>
            )}
            {play != null && play > 0 && (
              <span className="flex items-center gap-1">
                <Eye className="w-3 h-3" />
                {formatPlayCount(play)}
              </span>
            )}
            {duration && (
              <span>{duration}</span>
            )}
          </div>
        </div>

        {/* Bilibili badge */}
        <div className="shrink-0 px-2 py-1 rounded bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400 text-xs font-medium">
          B 站
        </div>
      </div>
    </div>
  );
}
