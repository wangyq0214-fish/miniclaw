'use client';

interface SubjectFilterProps {
  subjects: string[];
  selected: string;
  onSelect: (subject: string) => void;
}

export function SubjectFilter({ subjects, selected, onSelect }: SubjectFilterProps) {
  return (
    <div className="flex items-center gap-2 bg-white dark:bg-gray-800 p-1 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm w-fit">
      <button
        onClick={() => onSelect('全部学科')}
        className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
          selected === '全部学科'
            ? 'bg-[#f0f4ff] text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
            : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
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
              ? 'bg-[#f0f4ff] text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
              : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
          }`}
        >
          {subject}
        </button>
      ))}
    </div>
  );
}
