'use client'

import React, { useEffect, useState } from 'react'
import { Sun, Moon } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function ThemeToggle() {
  const [mounted, setMounted] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    setMounted(true)
    try {
      const stored = localStorage.getItem('theme')
      if (stored === 'dark' || stored === 'light') {
        setTheme(stored)
      } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        setTheme('dark')
      }
    } catch (e) {
      // ignore
    }
  }, [])

  useEffect(() => {
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
    } catch (e) {
      // ignore
    }
  }, [theme])

  const onToggle = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))

  // Keep server and initial client markup identical — render only the button without icon until mounted
  if (!mounted) {
    return <Button variant="ghost" size="icon" aria-label="Toggle color theme" />
  }

  return (
    <Button variant="ghost" size="icon" aria-label="Toggle color theme" onClick={onToggle}>
      {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  )
}
