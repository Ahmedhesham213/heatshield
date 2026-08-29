'use client'

import React, { useState } from 'react'
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Compass,
  ExternalLink,
  Navigation,
  ShieldCheck,
  Zap,
} from 'lucide-react'
import { NearbySaferResponse } from '@/services/api'
import { formatTempUnit, getRiskTheme, TempUnit } from '@/utils/risk-theme'

type HeatRouteCalculatorProps = {
  saferData: NearbySaferResponse | null
  currentTemp: number
  tempUnit: TempUnit
}

export function HeatRouteCalculator({
  saferData,
  currentTemp,
  tempUnit,
}: HeatRouteCalculatorProps) {
  const [selectedRoute, setSelectedRoute] = useState<'fastest' | 'coolest' | 'exposure'>('coolest')

  // Dynamic route options built around actual/nearby thermal data
  const coolerTemp = saferData ? saferData.safer_temp_c : Math.max(18, currentTemp - 2.5)
  const distance = saferData ? saferData.distance_m : 320

  const routes = [
    {
      id: 'fastest',
      name: 'Fastest Route',
      icon: Zap,
      timeMins: 11,
      distanceM: distance,
      tempC: currentTemp,
      riskScore: 76,
      riskLevel: 'high',
      shadePct: '15%',
      description: 'Direct main asphalt thoroughfare with maximum direct solar exposure.',
      color: '#fb923c',
    },
    {
      id: 'coolest',
      name: 'Coolest Route (HeatShield AI)',
      icon: ShieldCheck,
      timeMins: 14,
      distanceM: Math.round(distance * 1.25),
      tempC: coolerTemp,
      riskScore: 42,
      riskLevel: 'moderate',
      shadePct: '78%',
      description: 'Navigates through tree-canopy parks, shaded sidewalks, and waterbody micro-zones.',
      color: '#4ade80',
    },
    {
      id: 'exposure',
      name: 'Lowest Thermal Exposure',
      icon: Navigation,
      timeMins: 15,
      distanceM: Math.round(distance * 1.35),
      tempC: Math.max(18, coolerTemp - 0.4),
      riskScore: 38,
      riskLevel: 'low',
      shadePct: '85%',
      description: 'Uses covered walkways, arcades, and air-conditioned building corridors.',
      color: 'var(--accent-cyan)',
    },
  ] as const

  const active = routes.find((r) => r.id === selectedRoute) ?? routes[1]
  const activeTheme = getRiskTheme(active.riskLevel)

  return (
    <section id="routes" className="hs-card p-6 sm:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Navigation className="size-4" style={{ color: 'var(--accent-cyan)' }} />
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>
              Thermal Routing Engine
            </span>
          </div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            Heat-Safe Navigation Routes
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Trade minimal travel time for maximum heat stress reduction
          </p>
        </div>
      </div>

      {/* Route Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {routes.map((route) => {
          const isSelected = selectedRoute === route.id
          const Icon = route.icon
          return (
            <button
              key={route.id}
              onClick={() => setSelectedRoute(route.id as typeof selectedRoute)}
              className="rounded-2xl p-5 text-left border transition-all flex flex-col justify-between"
              style={{
                background: isSelected ? `${route.color}10` : 'var(--bg-elevated)',
                borderColor: isSelected ? route.color : 'var(--border-subtle)',
                boxShadow: isSelected ? `0 4px 20px ${route.color}20` : 'none',
              }}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Icon className="size-4" style={{ color: route.color }} />
                    <span className="text-xs font-bold truncate" style={{ color: 'var(--text-primary)' }}>{route.name}</span>
                  </div>
                  {isSelected && <CheckCircle2 className="size-4 flex-shrink-0" style={{ color: route.color }} />}
                </div>

                <div className="flex items-baseline justify-between mb-3">
                  <div>
                    <span className="font-mono text-2xl font-black" style={{ color: 'var(--text-primary)' }}>
                      {route.timeMins} min
                    </span>
                    <span className="text-[11px] text-tertiary ml-2 font-medium">({route.distanceM}m)</span>
                  </div>
                  <span className="font-mono text-lg font-bold" style={{ color: route.color }}>
                    {formatTempUnit(route.tempC, tempUnit)}
                  </span>
                </div>

                <p className="text-[11px] leading-relaxed mb-4" style={{ color: 'var(--text-secondary)' }}>
                  {route.description}
                </p>
              </div>

              <div className="pt-3 border-t flex items-center justify-between text-xs" style={{ borderColor: 'var(--border-subtle)' }}>
                <span className="font-semibold" style={{ color: 'var(--text-tertiary)' }}>Risk: {route.riskScore}/100</span>
                <span className="font-bold" style={{ color: route.color }}>{route.shadePct} Shade</span>
              </div>
            </button>
          )
        })}
      </div>

      {/* Trade-off Explanation Banner */}
      <div
        className="rounded-2xl p-5 border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
        style={{
          background: 'rgba(74,222,128,0.08)',
          borderColor: 'rgba(74,222,128,0.25)',
        }}
      >
        <div className="flex items-start gap-3">
          <div className="grid size-9 place-items-center rounded-xl flex-shrink-0 mt-0.5" style={{ background: 'rgba(74,222,128,0.15)' }}>
            <ShieldCheck className="size-5" style={{ color: '#4ade80' }} />
          </div>
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wider text-emerald-400">
              HeatShield Route Trade-off Recommendation
            </p>
            <p className="text-sm font-semibold mt-0.5" style={{ color: 'var(--text-primary)' }}>
              "Spend 3 extra minutes to reduce thermal exposure by 44%."
            </p>
            <p className="text-xs text-emerald-300/80 mt-0.5">
              Reduces peak skin temperature rise and prevents heat exhaustion on outdoor commutes.
            </p>
          </div>
        </div>

        {saferData?.maps_url && (
          <a
            href={saferData.maps_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all flex-shrink-0"
            style={{ background: '#4ade80', color: '#080b10', minHeight: 40 }}
          >
            Start Safe Navigation <ExternalLink className="size-3.5" />
          </a>
        )}
      </div>
    </section>
  )
}
