'use client';

import { useTheme } from '@/components/providers/ThemeProvider';

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
      <button
        onClick={() => setTheme('light')}
        className={`px-3 py-1 rounded font-medium text-sm transition-colors ${
          theme === 'light'
            ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
            : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
        }`}
        title="Light mode"
      >
        ☀️
      </button>

      <button
        onClick={() => setTheme('system')}
        className={`px-3 py-1 rounded font-medium text-sm transition-colors ${
          theme === 'system'
            ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
            : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
        }`}
        title="System preference"
      >
        🔄
      </button>

      <button
        onClick={() => setTheme('dark')}
        className={`px-3 py-1 rounded font-medium text-sm transition-colors ${
          theme === 'dark'
            ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
            : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
        }`}
        title="Dark mode"
      >
        🌙
      </button>
    </div>
  );
}
