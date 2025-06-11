'use client'

import { SunIcon, MoonIcon, ComputerDesktopIcon } from '@heroicons/react/24/outline'

export default function ThemeToggle() {
  // Get theme context safely
  let theme = 'light';
  let mounted = false;
  let toggleTheme = () => {};
  
  try {
    const { useTheme } = require('@/contexts/theme-context');
    const themeContext = useTheme();
    theme = themeContext.theme;
    mounted = themeContext.mounted;
    toggleTheme = themeContext.toggleTheme;
  } catch (error) {
    // If theme context is not available, use defaults
    theme = 'light';
    mounted = false;
    toggleTheme = () => {};
  }

  // Don't render until mounted to prevent hydration mismatch
  if (!mounted) {
    return (
      <div className="w-10 h-10 bg-gray-200 rounded-lg animate-pulse"></div>
    )
  }

  const getThemeIcon = () => {
    switch (theme) {
      case 'light':
        return <SunIcon className="w-5 h-5 text-yellow-500" />
      case 'dark':
        return <MoonIcon className="w-5 h-5 text-blue-400" />
      case 'system':
        return <ComputerDesktopIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
      default:
        return <SunIcon className="w-5 h-5 text-yellow-500" />
    }
  }

  const getThemeLabel = () => {
    switch (theme) {
      case 'light':
        return 'Switch to dark mode'
      case 'dark':
        return 'Switch to system theme'
      case 'system':
        return 'Switch to light mode'
      default:
        return 'Toggle theme'
    }
  }

  return (
    <button
      onClick={toggleTheme}
      className="relative inline-flex items-center justify-center w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
      aria-label={getThemeLabel()}
      title={getThemeLabel()}
    >
      {getThemeIcon()}
    </button>
  )
} 