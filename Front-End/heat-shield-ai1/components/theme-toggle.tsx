'use client'

import React, { useEffect, useState } from 'react'
import { Sun, Moon } from 'lucide-react'

export default function ThemeToggle() {
  const [mounted, setMounted] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>('dark')

  useEffect(() => {
    setMounted(true)
    try {
      const stored = localStorage.getItem('theme')
      if (stored === 'dark' || stored === 'light') {
        setTheme(stored)
      } else {
        setTheme('dark')
      }
    } catch {
      setTheme('dark')
    }
  }, [])

  useEffect(() => {
    if (!mounted) return
    try {
      const root = document.documentElement
      if (theme === 'dark') {
        root.classList.add('dark')
        root.classList.remove('light')
        localStorage.setItem('theme', 'dark')
      } else {
        root.classList.remove('dark')
        root.classList.add('light')
        localStorage.setItem('theme', 'light')
      }
    } catch {
      // ignore
    }
  }, [theme, mounted])

  const onToggle = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))

  if (!mounted) {
    return (
      <div
        className="size-8 rounded-full"
        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
      />
    )
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label="Toggle color theme"
      className="grid size-8 place-items-center rounded-full transition-all"
      style={{
        background: theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
        border: theme === 'dark' ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)',
        color: theme === 'dark' ? '#facc15' : '#080b10',
      }}
      title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
    >
      {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  )
}
