'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

interface ImmersiveHeaderProps {
  courseId: string;
  chapterId: string;
  title: string;
}

export default function ImmersiveHeader({ courseId, chapterId, title }: ImmersiveHeaderProps) {
  const router = useRouter();

  return (
    <header className="absolute top-0 left-0 right-0 h-16 px-6 flex items-center justify-between z-10">
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.back()}
          className="p-2 text-slate-400 hover:text-slate-700 transition-colors rounded-full hover:bg-slate-100"
          aria-label="返回"
        >
          <ArrowLeft size={20} />
        </button>
        <span className="font-semibold text-slate-800 tracking-wide">
          {title}
        </span>
      </div>
    </header>
  );
}
