'use client'

import React, { useEffect, useState } from 'react'
import {
  Activity,
  ChevronDown,
  Compass,
  LogOut,
  MapPin,
  Menu,
  Navigation,
  ShieldCheck,
  User,
  Wind,
  X,
} from 'lucide-react'
import ThemeToggle from '@/components/theme-toggle'
import { useAuth } from '@/hooks/use-auth'

export const US_PRESET_CITIES = [
  { name: 'New York City, NY', lat: 40.7128, lon: -74.0060 },
  { name: 'Austin, TX', lat: 30.2672, lon: -97.7431 },
  { name: 'Miami, FL', lat: 25.7617, lon: -80.1918 },
  { name: 'Phoenix, AZ', lat: 33.4484, lon: -112.0740 },
  { name: 'Los Angeles, CA', lat: 34.0522, lon: -118.2437 },
  { name: 'Chicago, IL', lat: 41.8781, lon: -87.6298 },
  { name: 'Las Vegas, NV', lat: 36.1699, lon: -115.1398 },
]

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: Activity },
  { id: 'forecast', label: '12h Forecast', icon: Wind },
  { id: 'map', label: 'Heat Map', icon: Compass },
  { id: 'safety', label: 'Safety Tips', icon: ShieldCheck },
]

export function Navbar({
  selectedCityName,
  onSelectCity,
  onRequestGps,
}: {
  selectedCityName: string
  onSelectCity: (lat: number, lon: number, name: string) => void
  onRequestGps: () => void
}) {
  const { user, logout } = useAuth()
  const [cityDropdownOpen, setCityDropdownOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [tabletNavOpen, setTabletNavOpen] = useState(false)
  const [activeSection, setActiveSection] = useState('dashboard')

  useEffect(() => {
    const sectionElements = NAV_ITEMS.map((item) => document.getElementById(item.id)).filter(Boolean) as HTMLElement[]
    if (sectionElements.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id)
          }
        })
      },
      { rootMargin: '-20% 0px -50% 0px', threshold: 0 }
    )

    sectionElements.forEach((el) => observer.observe(el))
    return () => sectionElements.forEach((el) => observer.unobserve(el))
  }, [])

  const handleNavClick = (event: React.MouseEvent<HTMLAnchorElement>, sectionId: string) => {
    event.preventDefault()
    setTabletNavOpen(false)
    setActiveSection(sectionId)
    const target = document.getElementById(sectionId)
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  return (
    <>
      <header
        className="sticky top-0 z-30 transition-all glass-navbar"
        style={{ height: 64 }}
      >
        <div className="mx-auto flex h-full max-w-[1280px] items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Brand Logo */}
          <a
            href="#dashboard"
            onClick={(e) => handleNavClick(e, 'dashboard')}
            className="flex items-center gap-2.5 group"
          >
            <div
              className="grid size-9 place-items-center rounded-xl transition-transform group-hover:scale-105"
              style={{ background: 'rgba(56,189,248,0.15)', border: '1px solid var(--border-default)' }}
            >
              <ShieldCheck className="size-5" style={{ color: 'var(--accent-cyan)' }} />
            </div>
            <div className="flex flex-col">
              <span className="text-base font-bold tracking-tight leading-none" style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                HeatShield
              </span>
              <span className="text-[9px] font-extrabold tracking-widest uppercase mt-0.5" style={{ color: 'var(--accent-cyan)' }}>
                Climate Intelligence
              </span>
            </div>
          </a>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex lg:items-center lg:gap-1">
            {NAV_ITEMS.map((item) => {
              const isActive = activeSection === item.id
              return (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  onClick={(e) => handleNavClick(e, item.id)}
                  className="relative rounded-lg px-3.5 py-2 text-xs font-semibold transition-all"
                  style={{
                    color: isActive ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                    background: isActive ? 'rgba(56,189,248,0.1)' : 'transparent',
                  }}
                >
                  {item.label}
                  {isActive && (
                    <span
                      className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full"
                      style={{ background: 'var(--accent-cyan)' }}
                    />
                  )}
                </a>
              )
            })}
          </nav>

          {/* Right Controls */}
          <div className="flex items-center gap-2">
            {/* Location Selector */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setCityDropdownOpen((v) => !v)}
                className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all"
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
                aria-label="Select US Location"
              >
                <MapPin className="size-3.5 flex-shrink-0" style={{ color: 'var(--accent-cyan)' }} />
                <span className="truncate max-w-[110px] sm:max-w-[140px]">{selectedCityName}</span>
                <ChevronDown className="size-3" style={{ color: 'var(--text-tertiary)' }} />
              </button>

              {cityDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setCityDropdownOpen(false)} />
                  <div
                    className="absolute right-0 top-10 z-50 w-60 rounded-xl p-2 shadow-2xl animate-in fade-in-50 zoom-in-95"
                    style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}
                  >
                    <div className="px-2.5 py-2 mb-1" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <p className="text-[9px] font-extrabold uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>
                        FortyGuard US Coverage
                      </p>
                      <button
                        type="button"
                        onClick={() => { setCityDropdownOpen(false); onRequestGps() }}
                        className="mt-2 flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-bold transition-all"
                        style={{ background: 'rgba(56,189,248,0.12)', color: 'var(--accent-cyan)', border: '1px solid rgba(56,189,248,0.2)' }}
                      >
                        <Navigation className="size-3.5" />
                        Use My Device GPS
                      </button>
                    </div>

                    <div className="py-1">
                      <p className="px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>
                        Select US City
                      </p>
                      {US_PRESET_CITIES.map((city) => (
                        <button
                          key={city.name}
                          type="button"
                          onClick={() => {
                            setCityDropdownOpen(false)
                            onSelectCity(city.lat, city.lon, city.name)
                          }}
                          className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs font-medium transition-all"
                          style={{
                            background: selectedCityName === city.name ? 'rgba(56,189,248,0.12)' : 'transparent',
                            color: selectedCityName === city.name ? 'var(--accent-cyan)' : 'var(--text-primary)',
                            fontWeight: selectedCityName === city.name ? 700 : 500,
                          }}
                        >
                          <span>{city.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            <ThemeToggle />

            {/* User Profile */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setUserMenuOpen((prev) => !prev)}
                className="grid size-8 place-items-center rounded-full transition-all"
                style={{ background: 'rgba(56,189,248,0.15)', border: '1px solid var(--border-default)', color: 'var(--accent-cyan)' }}
                aria-label="User Account Menu"
              >
                <User className="size-4" />
              </button>

              {userMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                  <div
                    className="absolute right-0 top-11 z-50 w-56 rounded-xl p-3 shadow-2xl animate-in fade-in-50 zoom-in-95"
                    style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}
                  >
                    <div className="pb-2.5 mb-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <p className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>{user?.name || 'Demo Account'}</p>
                      <p className="text-[11px] truncate mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{user?.email || 'demo@heatshield.ai'}</p>
                    </div>
                    <div className="py-1 text-[11px] flex justify-between items-center" style={{ color: 'var(--text-secondary)' }}>
                      <span>Region</span>
                      <span className="font-bold" style={{ color: '#4ade80' }}>🇺🇸 United States</span>
                    </div>
                    <div className="pt-2 mt-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                      <button
                        type="button"
                        onClick={() => { setUserMenuOpen(false); logout() }}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors"
                        style={{ color: '#ef4444', background: 'rgba(239,68,68,0.1)' }}
                      >
                        <LogOut className="size-3.5" />
                        Sign Out
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Tablet Menu Button */}
            <button
              className="hidden md:grid lg:hidden size-9 place-items-center rounded-xl transition-all"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
              onClick={() => setTabletNavOpen((prev) => !prev)}
              aria-label="Toggle Navigation Menu"
            >
              {tabletNavOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>
        </div>

        {/* Tablet Drawer */}
        {tabletNavOpen && (
          <div
            className="hidden md:block lg:hidden p-4 border-b animate-in slide-in-from-top-2"
            style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
          >
            <nav className="flex flex-col gap-1 max-w-sm mx-auto">
              {NAV_ITEMS.map((item) => {
                const isActive = activeSection === item.id
                const Icon = item.icon
                return (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    onClick={(e) => handleNavClick(e, item.id)}
                    className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-all"
                    style={{
                      background: isActive ? 'rgba(56,189,248,0.15)' : 'transparent',
                      color: isActive ? 'var(--accent-cyan)' : 'var(--text-primary)',
                    }}
                  >
                    <Icon className="size-4" />
                    <span>{item.label}</span>
                  </a>
                )
              })}
            </nav>
          </div>
        )}
      </header>

      {/* Mobile Bottom Thumb Navigation Bar */}
      <div
        className="fixed bottom-0 left-0 right-0 z-40 md:hidden pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] px-3 shadow-2xl"
        style={{ background: 'var(--bg-navbar)', backdropFilter: 'blur(20px)', borderTop: '1px solid var(--border-subtle)' }}
      >
        <div className="grid grid-cols-4 gap-1">
          {NAV_ITEMS.map((item) => {
            const isActive = activeSection === item.id
            const Icon = item.icon
            return (
              <a
                key={item.id}
                href={`#${item.id}`}
                onClick={(e) => handleNavClick(e, item.id)}
                className="relative flex flex-col items-center justify-center py-2 rounded-xl text-[10px] font-bold transition-all min-h-[48px]"
                style={{
                  color: isActive ? 'var(--accent-cyan)' : 'var(--text-tertiary)',
                  background: isActive ? 'rgba(56,189,248,0.12)' : 'transparent',
                }}
              >
                <Icon className="size-5 mb-0.5" />
                <span>{item.label}</span>
                {isActive && (
                  <span className="absolute top-1.5 right-3 size-1.5 rounded-full bg-cyan-400 animate-pulse" />
                )}
              </a>
            )
          })}
        </div>
      </div>
    </>
  )
}
