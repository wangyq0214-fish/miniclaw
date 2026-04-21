import Link from 'next/link';
import { FileQuestion } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md w-full bg-card border border-border rounded-2xl p-8 text-center shadow-sm">
        <div className="w-12 h-12 mx-auto mb-4 rounded-lg bg-muted flex items-center justify-center">
          <FileQuestion className="w-6 h-6 text-muted-foreground" />
        </div>
        <h1 className="text-xl font-semibold text-foreground mb-2">页面未找到</h1>
        <p className="text-sm text-muted-foreground mb-6">
          你访问的资源不存在或已被移除。
        </p>
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-medium h-9 px-4 hover:bg-primary/90 transition-colors"
        >
          返回首页
        </Link>
      </div>
    </div>
  );
}
