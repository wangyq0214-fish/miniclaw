'use client';

interface SubjectFilterProps {
  subjects: string[];
  selected: string;
  onSelect: (subject: string) => void;
}

export function SubjectFilter({ subjects, selected, onSelect }: SubjectFilterProps) {
  return (
    <div className="flex items-center gap-2 bg-white dark:bg-zinc-900/50 dark:backdrop-blur-md p-1 rounded-lg border border-gray-200 dark:border-white/10 shadow-sm w-fit">
      <button
        onClick={() => onSelect('全部学科')}
        className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
          selected === '全部学科'
            ? 'bg-[#f0f4ff] text-blue-600 dark:bg-blue-500/20 dark:text-blue-400'
            : 'text-gray-500 hover:text-gray-800 dark:text-zinc-400 dark:hover:text-zinc-200'
        }`}
      >
        全部学科
      </button>
      {subjects.map((subject) => (
        <button
          key={subject}
          onClick={() => onSelect(subject)}
          className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
            selected === subject
              ? 'bg-[#f0f4ff] text-blue-600 dark:bg-blue-500/20 dark:text-blue-400'
              : 'text-gray-500 hover:text-gray-800 dark:text-zinc-400 dark:hover:text-zinc-200'
          }`}
        >
          {subject}
        </button>
      ))}
    </div>
  );
}
