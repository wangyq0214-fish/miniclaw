'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Download, Presentation, Loader2 } from 'lucide-react';
import { getApiBaseUrl, tokenManager } from '@/lib/auth';

// ── Types ──
interface PptxRun {
  text: string;
  size?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  font?: string;
}

interface PptxParagraph {
  runs: PptxRun[];
  alignment?: string;
}

interface PptxFill {
  type: 'solid' | 'gradient';
  color?: string;
  colors?: string[];
}

interface PptxLine {
  color?: string;
  width?: number;
}

interface PptxShape {
  left: number;
  top: number;
  width: number;
  height: number;
  type: string;
  text?: string;
  paragraphs?: PptxParagraph[];
  fill?: PptxFill;
  line?: PptxLine;
  imageSrc?: string;
}

interface PptxSlide {
  index: number;
  background?: PptxFill;
  shapes: PptxShape[];
  notes: string;
}

interface PptxData {
  slideWidth: number;
  slideHeight: number;
  slides: PptxSlide[];
}

// ── Constants ──
const EMU_PER_INCH = 914400;
const DPI = 96;

// Convert EMU to CSS pixels
function emuToPx(emu: number): number {
  return (emu / EMU_PER_INCH) * DPI;
}

function getAlignment(align?: string): string {
  if (!align) return 'left';
  const a = align.toLowerCase();
  if (a.includes('center')) return 'center';
  if (a.includes('right')) return 'right';
  if (a.includes('justify')) return 'justify';
  return 'left';
}

function buildFillStyle(fill?: PptxFill): React.CSSProperties {
  if (!fill) return {};
  if (fill.type === 'solid' && fill.color) {
    return { backgroundColor: fill.color };
  }
  if (fill.type === 'gradient' && fill.colors?.length) {
    const c = fill.colors;
    const grad = c.length === 2
      ? `linear-gradient(135deg, ${c[0]}, ${c[1]})`
      : `linear-gradient(135deg, ${c.join(', ')})`;
    return { background: grad };
  }
  return {};
}

function buildBorderStyle(line?: PptxLine): React.CSSProperties {
  if (!line) return {};
  const color = line.color || '#000000';
  const w = line.width ? Math.max(1, Math.round(line.width / 12700)) : 1;
  return { border: `${w}px solid ${color}` };
}

// ── Slide renderer (rendered at native pixel size, then CSS-scaled) ──
function SlideContent({ slide, slideW, slideH }: { slide: PptxSlide; slideW: number; slideH: number }) {
  const bgStyle = buildFillStyle(slide.background);

  return (
    <div
      style={{
        position: 'relative',
        width: slideW,
        height: slideH,
        overflow: 'hidden',
        fontFamily: 'Microsoft YaHei, PingFang SC, Arial, sans-serif',
        ...bgStyle,
        backgroundColor: bgStyle.backgroundColor || bgStyle.background ? bgStyle.backgroundColor : '#ffffff',
        ...(bgStyle.background ? { background: bgStyle.background } : {}),
      }}
    >
      {slide.shapes.map((shape, i) => {
        const left = emuToPx(shape.left);
        const top = emuToPx(shape.top);
        const width = emuToPx(shape.width);
        const height = emuToPx(shape.height);

        const posStyle: React.CSSProperties = {
          position: 'absolute',
          left,
          top,
          width,
          height,
          overflow: 'hidden',
          boxSizing: 'border-box',
        };

        // Image
        if (shape.imageSrc) {
          return (
            <div key={i} style={posStyle}>
              <img src={shape.imageSrc} style={{ width: '100%', height: '100%', objectFit: 'contain' }} alt="" />
            </div>
          );
        }

        const fillStyle = buildFillStyle(shape.fill);
        const borderStyle = buildBorderStyle(shape.line);

        // Non-text shape (rectangle, line, etc.)
        if (!shape.paragraphs || shape.paragraphs.length === 0) {
          if (shape.fill || shape.line) {
            return <div key={i} style={{ ...posStyle, ...fillStyle, ...borderStyle, borderRadius: 2 }} />;
          }
          return null;
        }

        // Text shape
        return (
          <div
            key={i}
            style={{
              ...posStyle,
              ...fillStyle,
              ...borderStyle,
              borderRadius: fillStyle.backgroundColor ? 2 : undefined,
              padding: '0.3em',
            }}
          >
            {shape.paragraphs.map((para, pi) => {
              const align = getAlignment(para.alignment);
              return (
                <div
                  key={pi}
                  style={{
                    textAlign: align as any,
                    marginBottom: 2,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    lineHeight: 1.3,
                  }}
                >
                  {para.runs.length === 0 ? (
                    <br />
                  ) : (
                    para.runs.map((run, ri) => (
                      <span
                        key={ri}
                        style={{
                          fontSize: run.size ? `${run.size}pt` : undefined,
                          fontWeight: run.bold ? 700 : 400,
                          fontStyle: run.italic ? 'italic' : undefined,
                          textDecoration: run.underline ? 'underline' : undefined,
                          color: run.color || undefined,
                          fontFamily: run.font || undefined,
                        }}
                      >
                        {run.text}
                      </span>
                    ))
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ── Main viewer ──
export function PptxViewer({ filePath }: { filePath: string }) {
  const [data, setData] = useState<PptxData | null>(null);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(720);
  const [containerH, setContainerH] = useState(540);

  // Fetch PPTX data
  useEffect(() => {
    if (!filePath) return;
    setLoading(true);
    setError(null);

    const token = tokenManager.getToken();
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
    const url = `${getApiBaseUrl()}/api/files/pptx?path=${encodeURIComponent(filePath)}`;

    fetch(url, { headers })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(d => {
        setData(d);
        setCurrentSlide(0);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [filePath]);

  // Measure container size
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        setContainerW(entry.contentRect.width);
        setContainerH(entry.contentRect.height);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [loading, data]);

  const handleDownload = useCallback(async () => {
    setDownloading(true);
    try {
      const token = tokenManager.getToken();
      const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
      const url = `${getApiBaseUrl()}/api/files/download?path=${encodeURIComponent(filePath)}`;
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = filePath.split('/').pop() || 'presentation.pptx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objUrl);
    } catch (err) {
      console.error('Download failed:', err);
    } finally {
      setDownloading(false);
    }
  }, [filePath]);

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        setCurrentSlide(s => Math.max(0, s - 1));
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') {
        e.preventDefault();
        setCurrentSlide(s => Math.min((data?.slides.length || 1) - 1, s + 1));
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [data]);

  if (loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
        <p className="text-xs text-muted-foreground">加载演示文稿...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 p-6">
        <div className="w-16 h-16 rounded-2xl bg-orange-50 dark:bg-orange-500/10 flex items-center justify-center">
          <Presentation className="w-8 h-8 text-orange-600 dark:text-orange-400" />
        </div>
        <p className="text-sm text-destructive">{error || '加载失败'}</p>
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-all"
        >
          <Download className="w-4 h-4" />
          {downloading ? '下载中...' : '下载文件'}
        </button>
      </div>
    );
  }

  const slide = data.slides[currentSlide];
  // Native pixel size of the slide
  const nativeW = emuToPx(data.slideWidth);
  const nativeH = emuToPx(data.slideHeight);
  // Scale to fit container (WPS-like full coverage)
  const scaleW = containerW / nativeW;
  const scaleH = containerH / nativeH;
  const scale = Math.min(scaleW, scaleH);
  const maxW = nativeW * scale;
  const scaledH = nativeH * scale;

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-border shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentSlide(s => Math.max(0, s - 1))}
            disabled={currentSlide === 0}
            className="p-1.5 rounded-lg hover:bg-secondary disabled:opacity-30 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs font-medium text-muted-foreground">
            {currentSlide + 1} / {data.slides.length}
          </span>
          <button
            onClick={() => setCurrentSlide(s => Math.min(data.slides.length - 1, s + 1))}
            disabled={currentSlide === data.slides.length - 1}
            className="p-1.5 rounded-lg hover:bg-secondary disabled:opacity-30 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary hover:bg-accent text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          下载
        </button>
      </div>

      {/* Slide area */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 overflow-hidden flex items-center justify-center bg-gray-50 dark:bg-zinc-900"
      >
        {/* Outer: fixed display size, clips overflow */}
        <div
          className="shadow-lg rounded-md overflow-hidden relative"
          style={{
            width: maxW,
            height: scaledH,
            flexShrink: 0,
          }}
        >
          {/* Inner: native pixel size, scaled down */}
          <div
            style={{
              width: nativeW,
              height: nativeH,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
            }}
          >
            <SlideContent slide={slide} slideW={nativeW} slideH={nativeH} />
          </div>
        </div>
      </div>

      {/* Slide thumbnails */}
      {data.slides.length > 1 && (
        <div className="flex gap-2 px-3 py-2 overflow-x-auto border-t border-gray-100 dark:border-border shrink-0">
          {data.slides.map((s, i) => {
            const thumbW = 64;
            const thumbScale = thumbW / nativeW;
            const thumbH = nativeH * thumbScale;
            return (
              <button
                key={i}
                onClick={() => setCurrentSlide(i)}
                className={`shrink-0 rounded border-2 overflow-hidden relative transition-colors ${
                  i === currentSlide
                    ? 'border-primary'
                    : 'border-transparent hover:border-gray-300'
                }`}
                style={{ width: thumbW, height: thumbH }}
              >
                <div
                  style={{
                    width: nativeW,
                    height: nativeH,
                    transform: `scale(${thumbScale})`,
                    transformOrigin: 'top left',
                  }}
                >
                  <SlideContent slide={s} slideW={nativeW} slideH={nativeH} />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Notes */}
      {slide.notes && (
        <div className="px-3 py-2 border-t border-gray-100 dark:border-border bg-amber-50 dark:bg-amber-500/5 shrink-0 max-h-24 overflow-y-auto">
          <p className="text-xs text-muted-foreground font-medium mb-1">演讲者备注</p>
          <p className="text-xs text-foreground whitespace-pre-wrap">{slide.notes}</p>
        </div>
      )}
    </div>
  );
}
