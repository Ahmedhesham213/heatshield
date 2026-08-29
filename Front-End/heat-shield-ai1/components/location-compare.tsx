'use client'

import React, { useEffect, useState } from 'react'
import {
  ArrowRight,
  CheckCircle2,
  Compass,
  Loader2,
  MapPin,
  ShieldAlert,
  ShieldCheck,
  TrendingDown,
} from 'lucide-react'
import { US_PRESET_CITIES } from '@/components/navbar'
import { getHeatRisk, type HeatRiskResponse } from '@/services/api'
import { formatTempUnit, getRiskTheme, TempUnit } from '@/utils/risk-theme'

type LocationCompareProps = {
  currentCityName: string
  currentLat: number
  currentLon: number
  tempUnit: TempUnit
}

export function LocationCompare({
  currentCityName,
  currentLat,
  currentLon,
  tempUnit,
}: LocationCompareProps) {
  const [cityA, setCityA] = useState({ name: currentCityName, lat: currentLat, lon: currentLon })
  const [cityB, setCityB] = useState(US_PRESET_CITIES[1]) // Default e.g. Austin, TX

  const [dataA, setDataA] = useState<HeatRiskResponse | null>(null)
  const [dataB, setDataB] = useState<HeatRiskResponse | null>(null)
  const [loadingA, setLoadingA] = useState(false)
  const [loadingB, setLoadingB] = useState(false)

  // Sync cityA if current selected location changes
  useEffect(() => {
    setCityA({ name: currentCityName, lat: currentLat, lon: currentLon })
  }, [currentCityName, currentLat, currentLon])

  useEffect(() => {
    setLoadingA(true)
    getHeatRisk(cityA.lat, cityA.lon)
      .then(setDataA)
      .catch(() => setDataA(null))
      .finally(() => setLoadingA(false))
  }, [cityA])

  useEffect(() => {
    setLoadingB(true)
    getHeatRisk(cityB.lat, cityB.lon)
      .then(setDataB)
      .catch(() => setDataB(null))
      .finally(() => setLoadingB(false))
  }, [cityB])

  const riskA = dataA?.current.riskScore ?? 0
  const riskB = dataB?.current.riskScore ?? 0
  const tempA = dataA?.current.temperature ?? 0
  const tempB = dataB?.current.temperature ?? 0

  const themeA = getRiskTheme(dataA?.current.riskLevel ?? 'unknown')
  const themeB = getRiskTheme(dataB?.current.riskLevel ?? 'unknown')

  const isBSafer = riskB < riskA
  const riskDiff = Math.abs(riskA - riskB)
  const tempDiffC = Math.abs(tempA - tempB)

  return (
    <section id="compare" className="hs-card p-6 sm:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Compass className="size-4" style={{ color: 'var(--accent-cyan)' }} />
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>
              Location Intelligence
            </span>
          </div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            Compare Heat Risk Between Cities
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Analyze micro-climates side-by-side to choose safer destinations
          </p>
        </div>
      </div>

      {/* Selectors */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        {/* City A Selector */}
        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest mb-1.5 block" style={{ color: 'var(--text-tertiary)' }}>
            Location A (Primary)
          </label>
          <select
            value={cityA.name}
            onChange={(e) => {
              const selected = US_PRESET_CITIES.find(c => c.name === e.target.value)
              if (selected) setCityA(selected)
            }}
            className="w-full rounded-xl p-3 text-xs font-bold transition-all border"
            style={{
              background: 'var(--bg-elevated)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          >
            <option value={cityA.name}>{cityA.name}</option>
            {US_PRESET_CITIES.map(c => c.name !== cityA.name && (
              <option key={c.name} value={c.name}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* City B Selector */}
        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest mb-1.5 block" style={{ color: 'var(--text-tertiary)' }}>
            Location B (Comparison)
          </label>
          <select
            value={cityB.name}
            onChange={(e) => {
              const selected = US_PRESET_CITIES.find(c => c.name === e.target.value)
              if (selected) setCityB(selected)
            }}
            className="w-full rounded-xl p-3 text-xs font-bold transition-all border"
            style={{
              background: 'var(--bg-elevated)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          >
            {US_PRESET_CITIES.map(c => (
              <option key={c.name} value={c.name}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Comparison Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
        {/* Card A */}
        <div
          className="rounded-2xl p-5 flex flex-col justify-between border transition-all"
          style={{
            background: 'var(--bg-elevated)',
            borderColor: themeA.ringColor + '40',
          }}
        >
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <MapPin className="size-4" style={{ color: themeA.ringColor }} />
                <span className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>{cityA.name}</span>
              </div>
              {loadingA ? <Loader2 className="size-4 animate-spin text-sky-400" /> : (
                <span
                  className="px-2.5 py-1 rounded-full text-[10px] font-bold"
                  style={{ background: `${themeA.ringColor}18`, color: themeA.ringColor, border: `1px solid ${themeA.ringColor}35` }}
                >
                  {dataA?.current.riskLabel}
                </span>
              )}
            </div>

            <div className="flex items-baseline justify-between mb-4">
              <div>
                <p className="font-mono text-4xl font-black" style={{ color: 'var(--text-primary)' }}>
                  {formatTempUnit(tempA, tempUnit)}
                </p>
                <p className="text-[11px] font-medium" style={{ color: 'var(--text-tertiary)' }}>
                  Feels like {formatTempUnit(dataA?.current.feelsLike, tempUnit)}
                </p>
              </div>

              <div className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>Risk Score</p>
                <p className="font-mono text-2xl font-black" style={{ color: themeA.ringColor }}>
                  {riskA}/100
                </p>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t text-xs font-medium space-y-1" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}>
            <p>• Peak today: <span className="font-bold">{formatTempUnit(dataA?.peak.temperature, tempUnit)}</span> @ {dataA?.peak.time}</p>
            <p>• Historical baseline: <span className="font-bold">{formatTempUnit(dataA?.historical.averageTemperature, tempUnit)}</span></p>
          </div>
        </div>

        {/* Card B */}
        <div
          className="rounded-2xl p-5 flex flex-col justify-between border transition-all"
          style={{
            background: 'var(--bg-elevated)',
            borderColor: themeB.ringColor + '40',
          }}
        >
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <MapPin className="size-4" style={{ color: themeB.ringColor }} />
                <span className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>{cityB.name}</span>
              </div>
              {loadingB ? <Loader2 className="size-4 animate-spin text-sky-400" /> : (
                <span
                  className="px-2.5 py-1 rounded-full text-[10px] font-bold"
                  style={{ background: `${themeB.ringColor}18`, color: themeB.ringColor, border: `1px solid ${themeB.ringColor}35` }}
                >
                  {dataB?.current.riskLabel}
                </span>
              )}
            </div>

            <div className="flex items-baseline justify-between mb-4">
              <div>
                <p className="font-mono text-4xl font-black" style={{ color: 'var(--text-primary)' }}>
                  {formatTempUnit(tempB, tempUnit)}
                </p>
                <p className="text-[11px] font-medium" style={{ color: 'var(--text-tertiary)' }}>
                  Feels like {formatTempUnit(dataB?.current.feelsLike, tempUnit)}
                </p>
              </div>

              <div className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>Risk Score</p>
                <p className="font-mono text-2xl font-black" style={{ color: themeB.ringColor }}>
                  {riskB}/100
                </p>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t text-xs font-medium space-y-1" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}>
            <p>• Peak today: <span className="font-bold">{formatTempUnit(dataB?.peak.temperature, tempUnit)}</span> @ {dataB?.peak.time}</p>
            <p>• Historical baseline: <span className="font-bold">{formatTempUnit(dataB?.historical.averageTemperature, tempUnit)}</span></p>
          </div>
        </div>
      </div>

      {/* Safety Verdict Banner */}
      {dataA && dataB && (
        <div
          className="mt-6 rounded-2xl p-4 flex items-start gap-3.5 border animate-fade-in"
          style={{
            background: isBSafer ? 'rgba(74,222,128,0.08)' : 'rgba(56,189,248,0.08)',
            borderColor: isBSafer ? 'rgba(74,222,128,0.25)' : 'rgba(56,189,248,0.25)',
          }}
        >
          {isBSafer ? (
            <CheckCircle2 className="size-5 flex-shrink-0 mt-0.5" style={{ color: '#4ade80' }} />
          ) : (
            <ShieldCheck className="size-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--accent-cyan)' }} />
          )}

          <div>
            <p className="text-xs font-extrabold uppercase tracking-wider mb-1" style={{ color: isBSafer ? '#4ade80' : 'var(--accent-cyan)' }}>
              HeatShield Safety Verdict
            </p>
            <p className="text-sm font-semibold leading-relaxed" style={{ color: 'var(--text-primary)' }}>
              {riskA === riskB
                ? `Both ${cityA.name} and ${cityB.name} have identical heat risk scores (${riskA}/100).`
                : isBSafer
                ? `${cityB.name} is safer! Risk score is ${riskDiff} points lower and temperature is ${tempDiffC.toFixed(1)}°C lower than ${cityA.name}.`
                : `${cityA.name} is safer! Risk score is ${riskDiff} points lower and temperature is ${tempDiffC.toFixed(1)}°C lower than ${cityB.name}.`}
            </p>
          </div>
        </div>
      )}
    </section>
  )
}
