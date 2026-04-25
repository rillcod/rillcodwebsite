// @refresh reset
'use client'

import { SunIcon, MoonIcon, ComputerDesktopIcon } from '@/lib/icons'
import { useTheme } from '@/contexts/theme-context'

export default function ThemeToggle() {
  const { theme, mounted, toggleTheme } = useTheme();

  // Don't render until mounted to prevent hydration mismatch
  if (!mounted) {
    return (
      <div className="w-10 h-10 bg-muted rounded-none animate-pulse"></div>
    )
  }

  const getThemeIcon = () => {
    switch (theme) {
      case 'light':
        return <SunIcon className="w-5 h-5 text-primary" />
      case 'dark':
        return <MoonIcon className="w-5 h-5 text-primary" />
      case 'system':
        return <ComputerDesktopIcon className="w-5 h-5 text-muted-foreground" />
      default:
        return <SunIcon className="w-5 h-5 text-primary" />
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
      className="relative inline-flex items-center justify-center w-10 h-10 rounded-none bg-card border border-border hover:border-primary transition-all duration-200 focus:outline-none focus:ring-1 focus:ring-primary"
      aria-label={getThemeLabel()}
      title={getThemeLabel()}
    >
      {getThemeIcon()}
    </button>
  )
}
