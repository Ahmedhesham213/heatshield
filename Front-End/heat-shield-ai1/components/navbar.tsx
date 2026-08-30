'use client'

import React, { useEffect, useState } from 'react'
import {
  Activity,
  Bell,
  Calendar,
  ChevronDown,
  Compass,
  LogOut,
  MapPin,
  Menu,
  Navigation,
  ShieldCheck,
  Sliders,
  User,
  Wind,
  X,
} from 'lucide-react'
import ThemeToggle from '@/components/theme-toggle'
import { useAuth } from '@/hooks/use-auth'
import { ACTIVITY_PROFILES, getActivityProfile, TempUnit } from '@/utils/risk-theme'

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
  { id: 'dashboard', label: 'Home', icon: Activity },
  { id: 'forecast', label: '12h Forecast', icon: Wind },
  { id: 'map', label: 'Heat Map', icon: Compass },
  { id: 'protect-me', label: 'Protect', icon: ShieldCheck },
  { id: 'planner', label: 'Planner', icon: Calendar },
  { id: 'routes', label: 'Routes', icon: Navigation },
  { id: 'compare', label: 'Compare', icon: Compass },
  { id: 'alerts', label: 'Alerts', icon: Bell },
  { id: 'safety', label: 'Safety', icon: ShieldCheck },
]

export function Navbar({
  selectedCityName,
  onSelectCity,
  onRequestGps,
  tempUnit,
  setTempUnit,
  selectedActivity,
  setSelectedActivity,
  onOpenSettings,
}: {
  selectedCityName: string
  onSelectCity: (lat: number, lon: number, name: string) => void
  onRequestGps: () => void
  tempUnit: TempUnit
  setTempUnit: (unit: TempUnit) => void
  selectedActivity: string
  setSelectedActivity: (act: string) => void
  onOpenSettings: () => void
}) {
  const { user, logout } = useAuth()
  const [cityDropdownOpen, setCityDropdownOpen] = useState(false)
  const [activityDropdownOpen, setActivityDropdownOpen] = useState(false)
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

  const currentActivityProfile = getActivityProfile(selectedActivity)

  return (
    <>
      <header
        className="sticky top-0 z-30 transition-all glass-navbar"
        style={{ height: 64 }}
      >
        <div className="mx-auto flex h-full max-w-[1280px] items-center justify-between px-2.5 sm:px-6 lg:px-8">
          {/* Brand Logo */}
          <a
            href="#dashboard"
            onClick={(e) => handleNavClick(e, 'dashboard')}
            className="flex items-center gap-2 group flex-shrink-0"
          >
            <div
              className="grid size-8 sm:size-9 place-items-center rounded-xl transition-transform group-hover:scale-105"
              style={{ background: 'rgba(56,189,248,0.15)', border: '1px solid var(--border-default)' }}
            >
              <ShieldCheck className="size-4.5 sm:size-5" style={{ color: 'var(--accent-cyan)' }} />
            </div>
            <div className="flex flex-col">
              <span className="text-sm sm:text-base font-bold tracking-tight leading-none" style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                HeatShield
              </span>
              <span className="hidden xs:inline-block text-[9px] font-extrabold tracking-widest uppercase mt-0.5" style={{ color: 'var(--accent-cyan)' }}>
                Climate Intelligence AI
              </span>
            </div>
          </a>

          {/* Desktop Navigation */}
          <nav className="hidden xl:flex xl:items-center xl:gap-1">
            {NAV_ITEMS.map((item) => {
              const isActive = activeSection === item.id
              return (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  onClick={(e) => handleNavClick(e, item.id)}
                  className="relative rounded-lg px-3 py-1.5 text-xs font-semibold transition-all"
                  style={{
                    color: isActive ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                    background: isActive ? 'rgba(56,189,248,0.1)' : 'transparent',
                  }}
                >
                  {item.label}
                  {isActive && (
                    <span
                      className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full"
                      style={{ background: 'var(--accent-cyan)' }}
                    />
                  )}
                </a>
              )
            })}
          </nav>

          {/* Right Controls */}
          <div className="flex items-center gap-1.5 xs:gap-2">

            {/* Activity Profile Selector */}
            <div className="relative hidden sm:block">
              <button
                type="button"
                onClick={() => setActivityDropdownOpen((v) => !v)}
                className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all border"
                style={{
                  background: 'var(--bg-elevated)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              >
                <span>{currentActivityProfile.icon}</span>
                <span className="truncate max-w-[90px]">{currentActivityProfile.title}</span>
                <ChevronDown className="size-3" style={{ color: 'var(--text-tertiary)' }} />
              </button>

              {activityDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setActivityDropdownOpen(false)} />
                  <div
                    className="absolute right-0 top-10 z-50 w-56 rounded-2xl p-2 shadow-2xl animate-in fade-in-50 zoom-in-95"
                    style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}
                  >
                    <p className="px-2.5 py-1.5 text-[9px] font-extrabold uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>
                      Personal Safety Mode
                    </p>
                    {Object.values(ACTIVITY_PROFILES).map((p) => (
                      <button
                        key={p.id}
                        onClick={() => {
                          setSelectedActivity(p.id)
                          setActivityDropdownOpen(false)
                        }}
                        className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-medium transition-all"
                        style={{
                          background: selectedActivity === p.id ? 'rgba(56,189,248,0.12)' : 'transparent',
                          color: selectedActivity === p.id ? 'var(--accent-cyan)' : 'var(--text-primary)',
                        }}
                      >
                        <span className="text-base">{p.icon}</span>
                        <span className="truncate">{p.title}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Location Selector */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setCityDropdownOpen((v) => !v)}
                className="flex items-center gap-1 rounded-xl px-2 py-1.5 xs:px-3 text-xs font-semibold transition-all border"
                style={{
                  background: 'var(--bg-elevated)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
                aria-label="Select US Location"
              >
                <MapPin className="size-3.5 flex-shrink-0" style={{ color: 'var(--accent-cyan)' }} />
                <span className="truncate max-w-[70px] min-[360px]:max-w-[100px] xs:max-w-[140px] sm:max-w-[180px]">{selectedCityName}</span>
                <ChevronDown className="size-3 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} />
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

            {/* Settings trigger */}
            <button
              onClick={onOpenSettings}
              className="grid size-8 place-items-center rounded-xl transition-all border"
              style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
              title="Settings"
            >
              <Sliders className="size-4" />
            </button>

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
              className="hidden md:grid xl:hidden size-9 place-items-center rounded-xl transition-all"
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
            className="hidden md:block xl:hidden p-4 border-b animate-in slide-in-from-top-2"
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
        className="fixed bottom-0 left-0 right-0 z-40 md:hidden pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] px-2 shadow-2xl"
        style={{ background: 'var(--bg-navbar)', backdropFilter: 'blur(20px)', borderTop: '1px solid var(--border-subtle)' }}
      >
        <div className="grid grid-cols-5 gap-1">
          {[
            { id: 'dashboard', label: 'Home', icon: Activity },
            { id: 'map', label: 'Map', icon: Compass },
            { id: 'forecast', label: 'Forecast', icon: Wind },
            { id: 'protect-me', label: 'Protect', icon: ShieldCheck },
          ].map((item) => {
            const isActive = activeSection === item.id
            const Icon = item.icon
            return (
              <a
                key={item.id}
                href={`#${item.id}`}
                onClick={(e) => handleNavClick(e, item.id)}
                className="relative flex flex-col items-center justify-center py-1.5 rounded-xl text-[9px] font-bold transition-all min-h-[46px]"
                style={{
                  color: isActive ? 'var(--accent-cyan)' : 'var(--text-tertiary)',
                  background: isActive ? 'rgba(56,189,248,0.12)' : 'transparent',
                }}
              >
                <Icon className="size-4 mb-0.5" />
                <span className="truncate max-w-[50px]">{item.label}</span>
                {isActive && (
                  <span className="absolute top-1 right-2 size-1.5 rounded-full bg-cyan-400 animate-pulse" />
                )}
              </a>
            )
          })}

          {/* More Drawer Button */}
          <button
            type="button"
            onClick={() => setTabletNavOpen(prev => !prev)}
            className="relative flex flex-col items-center justify-center py-1.5 rounded-xl text-[9px] font-bold transition-all min-h-[46px]"
            style={{
              color: tabletNavOpen ? 'var(--accent-cyan)' : 'var(--text-tertiary)',
              background: tabletNavOpen ? 'rgba(56,189,248,0.12)' : 'transparent',
            }}
          >
            <Menu className="size-4 mb-0.5" />
            <span>More</span>
          </button>
        </div>
      </div>

      {/* Mobile More Drawer Overlay */}
      {tabletNavOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex flex-col justify-end bg-black/60 backdrop-blur-sm animate-in fade-in-50">
          <div
            className="w-full rounded-t-3xl p-5 border-t shadow-2xl animate-in slide-in-from-bottom-5 max-h-[80vh] overflow-y-auto"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border-default)' }}
          >
            <div className="flex items-center justify-between pb-3 mb-3 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-5 text-sky-400" />
                <h3 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>HeatShield Features</h3>
              </div>
              <button
                type="button"
                onClick={() => setTabletNavOpen(false)}
                className="p-1 rounded-xl"
                style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-4">
              {[
                { id: 'planner', label: 'Smart Planner', icon: Calendar, desc: 'Plan activities safely' },
                { id: 'routes', label: 'Safe Routes', icon: Navigation, desc: 'Cooler navigation' },
                { id: 'compare', label: 'Compare Locations', icon: Compass, desc: 'Find safer spots' },
                { id: 'alerts', label: 'Alert Center', icon: Bell, desc: 'Recent heat warnings' },
                { id: 'safety', label: 'Pre-Departure Safety', icon: ShieldCheck, desc: 'Hydration checklist' },
              ].map((item) => {
                const Icon = item.icon
                return (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    onClick={(e) => handleNavClick(e, item.id)}
                    className="flex flex-col p-3 rounded-2xl text-left transition-all border"
                    style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
                  >
                    <Icon className="size-4 text-sky-400 mb-1.5" />
                    <span className="font-bold text-xs" style={{ color: 'var(--text-primary)' }}>{item.label}</span>
                    <span className="text-[10px] truncate" style={{ color: 'var(--text-tertiary)' }}>{item.desc}</span>
                  </a>
                )
              })}
            </div>

            <div className="space-y-2 mt-3 pt-3 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
              <div className="flex items-center justify-between p-3 rounded-2xl border" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}>
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="grid size-8 place-items-center rounded-full flex-shrink-0" style={{ background: 'rgba(56,189,248,0.15)', color: 'var(--accent-cyan)' }}>
                    <User className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold truncate" style={{ color: 'var(--text-primary)' }}>{user?.name || 'Demo Account'}</p>
                    <p className="text-[10px] truncate" style={{ color: 'var(--text-tertiary)' }}>{user?.email || 'demo@heatshield.ai'}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { setTabletNavOpen(false); logout() }}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold flex-shrink-0"
                  style={{ color: '#ef4444', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)' }}
                >
                  <LogOut className="size-3.5" />
                  Sign Out
                </button>
              </div>

            <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
              <button
                type="button"
                onClick={() => { setTabletNavOpen(false); onOpenSettings() }}
                className="flex items-center justify-center gap-1.5 py-3 rounded-2xl text-xs font-bold transition-all border"
                style={{ background: 'rgba(56,189,248,0.1)', borderColor: 'rgba(56,189,248,0.3)', color: 'var(--accent-cyan)' }}
              >
                <Sliders className="size-3.5" />
                Settings
              </button>

              <button
                type="button"
                onClick={() => setTempUnit(tempUnit === 'C' ? 'F' : 'C')}
                className="flex items-center justify-center gap-1.5 py-3 rounded-2xl text-xs font-bold transition-all border"
                style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
              >
                <span>Unit:</span>
                <span className="font-black text-sky-400">°{tempUnit}</span>
              </button>

              <div className="flex items-center justify-center py-2 rounded-2xl border" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}>
                <ThemeToggle />
              </div>
            </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
