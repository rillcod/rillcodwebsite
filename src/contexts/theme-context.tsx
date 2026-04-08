'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'

type Theme = 'light' | 'dark' | 'system'

interface ThemeContextType {
  theme: Theme
  resolvedTheme: 'light' | 'dark'
  toggleTheme: () => void
  setTheme: (theme: Theme) => void
  mounted: boolean
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window !== 'undefined') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return 'dark'
}

function getEffectiveTheme(theme: Theme): 'light' | 'dark' {
  return theme === 'system' ? getSystemTheme() : theme
}

export function ThemeProvider({
  children,
  initialTheme = 'dark',
}: {
  children: React.ReactNode
  initialTheme?: Theme
}) {
  const [theme, setThemeState] = useState<Theme>(initialTheme)
  const [mounted, setMounted] = useState(false)

  const readThemeCookie = (): Theme | null => {
    if (typeof document === 'undefined') return null
    const match = document.cookie.match(/(?:^|;\s*)theme=(light|dark|system)(?:;|$)/)
    return (match?.[1] as Theme | undefined) ?? null
  }

  useEffect(() => {
    setMounted(true)
    const cookieTheme = readThemeCookie()
    const savedTheme = localStorage.getItem('theme') as Theme | null
    const initialTheme = cookieTheme ?? savedTheme ?? 'dark'
    setThemeState(initialTheme)
    if (!cookieTheme) {
      document.cookie = `theme=${initialTheme}; Path=/; Max-Age=31536000; SameSite=Lax`
    }
  }, [])

  useEffect(() => {
    if (!mounted) return

    const effectiveTheme = getEffectiveTheme(theme)

    // Apply class to <html> element
    const root = document.documentElement
    root.classList.remove('light', 'dark')
    root.classList.add(effectiveTheme)

    // Update color-scheme so native UI (scrollbars, form controls) matches
    root.style.colorScheme = effectiveTheme

    // Update the theme-color <meta> so the mobile browser chrome matches
    const themeColorMeta = document.querySelector('meta[name="theme-color"]')
    if (themeColorMeta) {
      themeColorMeta.setAttribute(
        'content',
        effectiveTheme === 'dark' ? '#0f0f1a' : '#F8F9FA'
      )
    }

    // Persist preference
    document.cookie = `theme=${theme}; Path=/; Max-Age=31536000; SameSite=Lax`
    if (theme !== 'system') {
      localStorage.setItem('theme', theme)
    } else {
      localStorage.removeItem('theme')
    }
  }, [theme, mounted])

  // Listen for system theme changes when using 'system' mode
  useEffect(() => {
    if (!mounted || theme !== 'system') return

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = () => {
      const effectiveTheme = mediaQuery.matches ? 'dark' : 'light'
      const root = document.documentElement
      root.classList.remove('light', 'dark')
      root.classList.add(effectiveTheme)
      root.style.colorScheme = effectiveTheme
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [theme, mounted])

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme)
  }

  const toggleTheme = () => {
    setThemeState(prev => (prev === 'light' ? 'dark' : 'light'))
  }

  const resolvedTheme = mounted ? getEffectiveTheme(theme) : 'dark'

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, toggleTheme, setTheme, mounted }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}