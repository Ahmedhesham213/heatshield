'use client'

import React, { useMemo, useState } from 'react'
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  Compass,
  Flame,
  Info,
  ShieldAlert,
  ShieldCheck,
  Sun,
} from 'lucide-react'
import { HeatRiskResponse } from '@/services/api'
import { ACTIVITY_PROFILES, getActivityProfile, formatTempUnit, getRiskTheme, TempUnit } from '@/utils/risk-theme'

type OutdoorPlannerProps = {
  heatData: HeatRiskResponse | null
  tempUnit: TempUnit
}

export function OutdoorPlanner({ heatData, tempUnit }: OutdoorPlannerProps) {
  const [selectedActivity, setSelectedActivity] = useState<string>('walking')
  const [startTimeIndex, setStartTimeIndex] = useState<number>(0)
  const [durationHours, setDurationHours] = useState<number>(2)

  const forecast = heatData?.forecast ?? []

  const profile = getActivityProfile(selectedActivity)


  // Calculate risk for chosen window
  const evaluation = useMemo(() => {
    if (!forecast.length) return null

    const slice = forecast.slice(startTimeIndex, startTimeIndex + durationHours)
    if (!slice.length) return null

    const startLabel = slice[0].time
    const endLabel = slice[slice.length - 1].time

    const temps = slice.map((item) => item.temperature)
    const maxTemp = Math.max(...temps)
    const avgTemp = temps.reduce((a, b) => a + b, 0) / temps.length

    const baseMaxRisk = Math.max(...slice.map((item) => item.riskScore))
    const adjustedRisk = Math.min(100, Math.round(baseMaxRisk * profile.riskMultiplier))

    const level =
      adjustedRisk >= 75
        ? 'extreme'
        : adjustedRisk >= 60
        ? 'high'
        : adjustedRisk >= 40
        ? 'moderate'
        : 'low'

    // Search for safer alternative window of same duration
    let bestStartIndex = -1
    let lowestRisk = 999

    for (let i = 0; i <= forecast.length - durationHours; i++) {
      const windowSlice = forecast.slice(i, i + durationHours)
      const maxR = Math.max(...windowSlice.map((h) => h.riskScore))
      if (maxR < lowestRisk) {
        lowestRisk = maxR
        bestStartIndex = i
      }
    }

    const saferSlice =
      bestStartIndex >= 0 ? forecast.slice(bestStartIndex, bestStartIndex + durationHours) : []
    const saferStart = saferSlice[0]?.time ?? '--:--'
    const saferEnd = saferSlice[saferSlice.length - 1]?.time ?? '--:--'
    const saferAvgTemp =
      saferSlice.length > 0
        ? saferSlice.reduce((a, b) => a + b.temperature, 0) / saferSlice.length
        : 0

    return {
      startLabel,
      endLabel,
      maxTemp,
      avgTemp,
      adjustedRisk,
      level,
      saferStart,
      saferEnd,
      saferAvgTemp,
      isUnsafe: adjustedRisk >= 60,
    }
  }, [forecast, startTimeIndex, durationHours, profile])

  const evalTheme = getRiskTheme(evaluation?.level ?? 'low')

  return (
    <section id="planner" className="hs-card p-6 sm:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Calendar className="size-4" style={{ color: 'var(--accent-cyan)' }} />
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>
              Smart Outdoor Assistant
            </span>
          </div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            Plan My Day
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Evaluate heat exposure before stepping outside and discover optimal alternative hours
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Planner Inputs */}
        <div className="lg:col-span-1 space-y-4 p-5 rounded-2xl" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
          {/* Activity selector */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest mb-1.5 block" style={{ color: 'var(--text-tertiary)' }}>
              Select Activity
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'walking', label: 'Walking 🚶' },
                { id: 'running', label: 'Running 🏃' },
                { id: 'cyclist', label: 'Cycling 🚴' },
                { id: 'delivery', label: 'Delivery 📦' },
                { id: 'worker', label: 'Work 🏗️' },
                { id: 'traveler', label: 'Outdoor ☀️' },
              ].map((act) => (
                <button
                  key={act.id}
                  type="button"
                  onClick={() => setSelectedActivity(act.id)}
                  className="px-3 py-2.5 rounded-xl text-xs font-bold text-left transition-all border"
                  style={{
                    background: selectedActivity === act.id ? 'rgba(56,189,248,0.12)' : 'var(--bg-surface)',
                    borderColor: selectedActivity === act.id ? 'var(--accent-cyan)' : 'var(--border-subtle)',
                    color: selectedActivity === act.id ? 'var(--accent-cyan)' : 'var(--text-primary)',
                  }}
                >
                  {act.label}
                </button>
              ))}
            </div>
          </div>

          {/* Start Time Select */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest mb-1.5 block" style={{ color: 'var(--text-tertiary)' }}>
              Start Time
            </label>
            <select
              value={startTimeIndex}
              onChange={(e) => setStartTimeIndex(Number(e.target.value))}
              className="w-full rounded-xl p-3 text-xs font-bold border transition-all"
              style={{
                background: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            >
              {forecast.map((item, idx) => (
                <option key={idx} value={idx}>
                  {item.time} ({formatTempUnit(item.temperature, tempUnit)})
                </option>
              ))}
            </select>
          </div>

          {/* Duration Select */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest mb-1.5 block" style={{ color: 'var(--text-tertiary)' }}>
              Duration
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[1, 2, 3, 4].map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setDurationHours(h)}
                  className="py-2 rounded-xl text-xs font-bold border transition-all"
                  style={{
                    background: durationHours === h ? 'rgba(56,189,248,0.12)' : 'var(--bg-surface)',
                    borderColor: durationHours === h ? 'var(--accent-cyan)' : 'var(--border-subtle)',
                    color: durationHours === h ? 'var(--accent-cyan)' : 'var(--text-primary)',
                  }}
                >
                  {h}h
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Evaluation Output */}
        <div className="lg:col-span-2 space-y-4 flex flex-col justify-between">
          {evaluation ? (
            <>
              <div
                className="rounded-2xl p-6 border transition-all"
                style={{
                  background: `${evalTheme.ringColor}08`,
                  borderColor: `${evalTheme.ringColor}35`,
                }}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Clock className="size-4" style={{ color: evalTheme.ringColor }} />
                    <span className="font-mono text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                      {evaluation.startLabel} – {evaluation.endLabel}
                    </span>
                  </div>
                  <span
                    className="px-3 py-1 rounded-full text-xs font-bold"
                    style={{
                      background: `${evalTheme.ringColor}18`,
                      color: evalTheme.ringColor,
                      border: `1px solid ${evalTheme.ringColor}35`,
                    }}
                  >
                    {evaluation.level.toUpperCase().replace('_', ' ')} · {evaluation.adjustedRisk}/100 Risk
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>Max Temp</p>
                    <p className="font-mono text-2xl font-black" style={{ color: 'var(--text-primary)' }}>
                      {formatTempUnit(evaluation.maxTemp, tempUnit)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>Avg Temp</p>
                    <p className="font-mono text-2xl font-black text-amber-500">
                      {formatTempUnit(evaluation.avgTemp, tempUnit)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>Activity Factor</p>
                    <p className="font-mono text-2xl font-black" style={{ color: 'var(--accent-cyan)' }}>
                      {profile.riskMultiplier}x
                    </p>
                  </div>
                </div>

                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {profile.guidance}
                </p>
              </div>

              {/* Safer Alternative Window Card */}
              <div
                className="rounded-2xl p-5 border flex items-center justify-between gap-4"
                style={{
                  background: 'rgba(74,222,128,0.08)',
                  borderColor: 'rgba(74,222,128,0.25)',
                }}
              >
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="size-6 flex-shrink-0" style={{ color: '#4ade80' }} />
                  <div>
                    <p className="text-xs font-extrabold uppercase tracking-wider text-emerald-400">
                      Recommended Safer Window
                    </p>
                    <p className="text-sm font-bold font-mono" style={{ color: 'var(--text-primary)' }}>
                      {evaluation.saferStart} – {evaluation.saferEnd}
                    </p>
                    <p className="text-[11px] text-emerald-300/80 mt-0.5">
                      Avg {formatTempUnit(evaluation.saferAvgTemp, tempUnit)} · Significantly lower heat strain
                    </p>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="p-8 text-center" style={{ color: 'var(--text-tertiary)' }}>
              Select start time and duration to calculate outdoor heat risk.
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
