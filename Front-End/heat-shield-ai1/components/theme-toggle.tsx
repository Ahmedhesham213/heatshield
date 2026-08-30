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
        className="size-9 sm:size-8 rounded-xl"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
      />
    )
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label="Toggle dark and light theme mode"
      className="grid size-9 sm:size-8 place-items-center rounded-xl transition-all active:scale-95 border flex-shrink-0"
      style={{
        background: theme === 'dark' ? 'rgba(250,204,21,0.12)' : 'rgba(14,165,233,0.12)',
        borderColor: theme === 'dark' ? 'rgba(250,204,21,0.3)' : 'rgba(14,165,233,0.3)',
        color: theme === 'dark' ? '#facc15' : '#0284c7',
      }}
      title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
    >
      {theme === 'dark' ? <Sun className="size-4 stroke-[2.5]" /> : <Moon className="size-4 stroke-[2.5]" />}
    </button>
  )
}
