// @refresh reset
'use client'

import { SunIcon, MoonIcon, ComputerDesktopIcon } from '@/lib/icons'

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
      <div className="w-10 h-10 bg-muted rounded-none animate-pulse"></div>
    )
  }

  const getThemeIcon = () => {
    switch (theme) {
      case 'light':
        return <SunIcon className="w-5 h-5 text-orange-500" />
      case 'dark':
        return <MoonIcon className="w-5 h-5 text-orange-400" />
      case 'system':
        return <ComputerDesktopIcon className="w-5 h-5 text-muted-foreground" />
      default:
        return <SunIcon className="w-5 h-5 text-orange-500" />
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
      className="relative inline-flex items-center justify-center w-10 h-10 rounded-none bg-card border border-border hover:border-orange-500 transition-all duration-200 focus:outline-none focus:ring-1 focus:ring-orange-500"
      aria-label={getThemeLabel()}
      title={getThemeLabel()}
    >
      {getThemeIcon()}
    </button>
  )
}
 