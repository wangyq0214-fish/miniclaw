'use client';

import { User } from 'lucide-react';
import { useMemo } from 'react';
import { CardShell } from './CardShell';
import { MarkdownRenderer } from '@/components/chat/MarkdownRenderer';

interface StudentProfileCardProps {
  path: string;
  content: string;
  onOpenInEditor?: () => void;
}

interface ProfileSection {
  title: string;
  body: string;
}

function splitSections(markdown: string): ProfileSection[] {
  // Strip YAML frontmatter if present
  const stripped = markdown.replace(/^---[\s\S]*?---\s*/m, '');
  // Split by H2 headings
  const parts = stripped.split(/^##\s+/m).filter(Boolean);
  if (parts.length <= 1) {
    return [{ title: '画像', body: stripped }];
  }
  return parts.map((part) => {
    const newlineIdx = part.indexOf('\n');
    const title = (newlineIdx === -1 ? part : part.slice(0, newlineIdx)).trim();
    const body = newlineIdx === -1 ? '' : part.slice(newlineIdx + 1).trim();
    return { title, body };
  });
}

export function StudentProfileCard({ path, content, onOpenInEditor }: StudentProfileCardProps) {
  const sections = useMemo(() => splitSections(content), [content]);

  return (
    <CardShell
      icon={<User className="w-4 h-4" />}
      label="学生画像"
      path={path}
      content={content}
      onOpenInEditor={onOpenInEditor}
    >
      {sections.length > 1 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {sections.map((s) => (
            <div
              key={s.title}
              className="rounded-xl border border-border bg-background/50 p-4"
            >
              <h3 className="text-sm font-semibold text-foreground mb-2 border-b border-border pb-1">
                {s.title}
              </h3>
              <div className="text-sm">
                <MarkdownRenderer content={s.body} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <MarkdownRenderer content={content} />
      )}
    </CardShell>
  );
}
