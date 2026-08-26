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
import { Button } from '@/components/ui/button'

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
  const [mobileNav, setMobileNav] = useState(false)
  const [cityDropdownOpen, setCityDropdownOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [activeSection, setActiveSection] = useState('dashboard')

  // IntersectionObserver for active section tracking
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
      {
        rootMargin: '-20% 0px -50% 0px',
        threshold: 0,
      }
    )

    sectionElements.forEach((el) => observer.observe(el))

    return () => {
      sectionElements.forEach((el) => observer.unobserve(el))
    }
  }, [])

  const handleNavClick = (event: React.MouseEvent<HTMLAnchorElement>, sectionId: string) => {
    event.preventDefault()
    setMobileNav(false)
    setActiveSection(sectionId)
    const target = document.getElementById(sectionId)
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/90 backdrop-blur-md transition-all">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Brand Logo */}
          <a
            href="#dashboard"
            onClick={(e) => handleNavClick(e, 'dashboard')}
            className="flex items-center gap-2 group"
          >
            <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm transition-transform group-hover:scale-105">
              <ShieldCheck className="size-5" />
            </span>
            <div className="flex flex-col">
              <span className="text-base font-extrabold tracking-tight text-foreground leading-tight">
                HeatShield
              </span>
              <span className="text-[10px] font-bold text-primary tracking-wider uppercase">
                US Intelligence
              </span>
            </div>
          </a>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex md:items-center md:gap-1">
            {NAV_ITEMS.map((item) => {
              const isActive = activeSection === item.id
              return (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  onClick={(e) => handleNavClick(e, item.id)}
                  className={`relative rounded-lg px-3.5 py-2 text-xs font-bold transition-all ${
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  {item.label}
                  {isActive && (
                    <span className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-primary" />
                  )}
                </a>
              )
            })}
          </nav>

          {/* Right Controls */}
          <div className="flex items-center gap-2">
            {/* US Location Dropdown Selector */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setCityDropdownOpen((v) => !v)}
                className="flex items-center gap-1.5 rounded-xl border border-border/80 bg-muted/50 px-3 py-1.5 text-xs font-bold text-foreground transition hover:bg-muted"
                aria-label="Select US Location"
              >
                <MapPin className="size-3.5 text-primary shrink-0" />
                <span className="truncate max-w-[110px] sm:max-w-[140px]">{selectedCityName}</span>
                <ChevronDown className="size-3 text-muted-foreground" />
              </button>

              {cityDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setCityDropdownOpen(false)} />
                  <div className="absolute right-0 top-10 z-50 w-60 rounded-xl border border-border/80 bg-popover p-2 shadow-xl animate-in fade-in-50 zoom-in-95">
                    <div className="px-2 py-1.5 border-b border-border/60">
                      <p className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
                        FortyGuard US Coverage
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setCityDropdownOpen(false)
                          onRequestGps()
                        }}
                        className="mt-1.5 flex w-full items-center gap-2 rounded-lg bg-primary/10 px-2.5 py-1.5 text-xs font-bold text-primary hover:bg-primary/20 transition"
                      >
                        <Navigation className="size-3.5" />
                        Use My Device GPS
                      </button>
                    </div>

                    <div className="py-1">
                      <p className="px-2.5 py-1 text-[10px] font-bold text-muted-foreground uppercase">
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
                          className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs font-medium transition ${
                            selectedCityName === city.name
                              ? 'bg-primary text-primary-foreground font-bold'
                              : 'text-foreground hover:bg-muted'
                          }`}
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

            {/* User Profile Menu */}
            <div className="relative">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setUserMenuOpen((prev) => !prev)}
                className="flex items-center gap-1.5 rounded-full px-2 hover:bg-muted h-9"
                aria-label="User Account Menu"
              >
                <div className="grid size-7 place-items-center rounded-full bg-primary text-primary-foreground font-extrabold text-xs">
                  {user?.initials || <User className="size-4" />}
                </div>
              </Button>

              {userMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                  <div className="absolute right-0 top-11 z-50 w-56 rounded-xl border border-border/80 bg-popover p-2 shadow-xl animate-in fade-in-50 zoom-in-95">
                    <div className="border-b border-border/60 px-3 py-2.5">
                      <p className="text-xs font-bold text-foreground">{user?.name || 'User Account'}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{user?.email || 'mirey17981@bejum.com'}</p>
                    </div>
                    <div className="py-1.5 px-3 text-[11px] text-muted-foreground flex justify-between items-center">
                      <span>Coverage Region</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">🇺🇸 United States</span>
                    </div>
                    <div className="border-t border-border/60 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setUserMenuOpen(false)
                          logout()
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-destructive hover:bg-destructive/10 transition-colors font-bold"
                      >
                        <LogOut className="size-4" />
                        Sign Out
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Hamburger menu */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileNav((prev) => !prev)}
              aria-label="Toggle Navigation Menu"
            >
              {mobileNav ? <X className="size-5" /> : <Menu className="size-5" />}
            </Button>
          </div>
        </div>

        {/* Mobile Nav Dropdown Drawer */}
        {mobileNav && (
          <div className="border-b border-border bg-background p-3 shadow-lg md:hidden animate-in slide-in-from-top-2">
            <nav className="flex flex-col gap-1">
              {NAV_ITEMS.map((item) => {
                const isActive = activeSection === item.id
                const Icon = item.icon
                return (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    onClick={(e) => handleNavClick(e, item.id)}
                    className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold transition-all ${
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-foreground hover:bg-muted'
                    }`}
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

      {/* Outdoor Mobile Bottom Quick Nav Bar (1-Hand Thumb Access) */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border/80 bg-background/95 backdrop-blur-md md:hidden py-1.5 px-2 shadow-2xl">
        <div className="grid grid-cols-4 gap-1">
          {NAV_ITEMS.map((item) => {
            const isActive = activeSection === item.id
            const Icon = item.icon
            return (
              <a
                key={item.id}
                href={`#${item.id}`}
                onClick={(e) => handleNavClick(e, item.id)}
                className={`flex flex-col items-center justify-center py-1.5 rounded-xl text-[10px] font-extrabold transition-all min-h-[48px] ${
                  isActive ? 'text-primary bg-primary/10' : 'text-muted-foreground'
                }`}
              >
                <Icon className="size-5 mb-0.5" />
                <span>{item.label}</span>
              </a>
            )
          })}
        </div>
      </div>
    </>
  )
}
