'use client'

import { useState, useMemo } from 'react'
import { CheckCircle2, Clock } from 'lucide-react'
import { type HeatRiskResponse } from '@/services/api'
import { ACTIVITY_PROFILES, getActivityProfile, formatTempUnit, getRiskTheme, type TempUnit } from '@/utils/risk-theme'

type HeatMissionProps = {
  heatData: HeatRiskResponse | null
  tempUnit: TempUnit
}

const ACTIVITIES = [
  { id: 'walking', label: 'Walk', icon: '🚶' },
  { id: 'delivery', label: 'Delivery', icon: '📦' },
  { id: 'worker', label: 'Outdoor Work', icon: '🏗️' },
  { id: 'runner', label: 'Exercise', icon: '🏃' },
  { id: 'cyclist', label: 'Cycling', icon: '🚴' },
  { id: 'student', label: 'Commute', icon: '🎒' },
]

const DURATIONS = [
  { label: '15 min', hours: 0.25 },
  { label: '30 min', hours: 0.5 },
  { label: '1 hour', hours: 1 },
  { label: '2 hours', hours: 2 },
]

type MissionResult = {
  adjustedRisk: number
  level: string
  maxTemp: number
  saferStart: string
  saferEnd: string
  saferRisk: number
  isUnsafe: boolean
  guidance: string
}

function computeMission(
  heatData: HeatRiskResponse,
  activityId: string,
  durationHours: number
): MissionResult {
  const profile = getActivityProfile(activityId)
  const forecast = heatData.forecast
  const currentRisk = heatData.current.riskScore
  const currentTemp = heatData.current.temperature

  // Use nearest forecast hours for the mission window
  const durationSlots = Math.max(1, Math.round(durationHours))
  const slice = forecast.slice(0, durationSlots)

  const temps = slice.length ? slice.map(h => h.temperature) : [currentTemp]
  const maxTemp = Math.max(...temps)
  const baseMaxRisk = slice.length
    ? Math.max(...slice.map(h => h.riskScore))
    : currentRisk

  const adjustedRisk = Math.min(100, Math.round(baseMaxRisk * profile.riskMultiplier))

  const level =
    adjustedRisk >= 80 ? 'extreme'
    : adjustedRisk >= 60 ? 'very_high'
    : adjustedRisk >= 40 ? 'high'
    : adjustedRisk >= 20 ? 'moderate'
    : 'low'

  // Find best window
  let bestStart = -1
  let lowestRisk = 999
  for (let i = 0; i <= Math.max(0, forecast.length - durationSlots); i++) {
    const w = forecast.slice(i, i + durationSlots)
    const r = w.length ? Math.max(...w.map(h => h.riskScore)) : currentRisk
    if (r < lowestRisk) { lowestRisk = r; bestStart = i }
  }

  const saferSlice = bestStart >= 0 ? forecast.slice(bestStart, bestStart + durationSlots) : []
  const saferStart = saferSlice[0]?.time ?? '--:--'
  const saferEnd = saferSlice[saferSlice.length - 1]?.time ?? '--:--'
  const saferRisk = Math.round(lowestRisk * profile.riskMultiplier)

  return {
    adjustedRisk,
    level,
    maxTemp,
    saferStart,
    saferEnd,
    saferRisk: Math.min(100, saferRisk),
    isUnsafe: adjustedRisk >= 60,
    guidance: profile.guidance,
  }
}

export function HeatMission({ heatData, tempUnit }: HeatMissionProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [selectedActivity, setSelectedActivity] = useState<string | null>(null)
  const [selectedDuration, setSelectedDuration] = useState<number | null>(null)

  const result = useMemo<MissionResult | null>(() => {
    if (!heatData || !selectedActivity || selectedDuration === null) return null
    return computeMission(heatData, selectedActivity, selectedDuration)
  }, [heatData, selectedActivity, selectedDuration])

  const resultTheme = getRiskTheme(result?.level ?? 'unknown')
  const saferTheme = getRiskTheme(
    result
      ? result.saferRisk >= 80 ? 'extreme'
        : result.saferRisk >= 60 ? 'very_high'
        : result.saferRisk >= 40 ? 'high'
        : result.saferRisk >= 20 ? 'moderate'
        : 'low'
      : 'unknown'
  )

  const handleReset = () => {
    setStep(1)
    setSelectedActivity(null)
    setSelectedDuration(null)
  }

  return (
    <section id="heat-mission" className="hs-card overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>
              Heat Mission
            </p>
            <h2 className="text-lg font-black" style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              What are you about to do?
            </h2>
          </div>
          {step > 1 && (
            <button
              onClick={handleReset}
              className="text-xs font-bold px-3 py-1.5 rounded-xl"
              style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}
            >
              Reset
            </button>
          )}
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mt-3">
          {[1, 2, 3].map(s => (
            <div
              key={s}
              className="h-1 flex-1 rounded-full transition-all duration-300"
              style={{
                background: step >= s ? 'var(--accent-cyan)' : 'var(--border-subtle)',
              }}
            />
          ))}
        </div>
      </div>

      <div className="p-5">
        {/* STEP 1: Activity */}
        {step === 1 && (
          <div className="animate-fade-in">
            <p className="text-xs font-semibold mb-4" style={{ color: 'var(--text-secondary)' }}>
              Select your activity:
            </p>
            <div className="grid grid-cols-3 gap-2.5">
              {ACTIVITIES.map(act => (
                <button
                  key={act.id}
                  type="button"
                  onClick={() => {
                    setSelectedActivity(act.id)
                    setStep(2)
                  }}
                  className="flex flex-col items-center gap-2 rounded-2xl py-4 px-2 font-bold text-xs transition-all active:scale-95 hover:scale-[1.03]"
                  style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                    minHeight: 80,
                  }}
                >
                  <span className="text-2xl">{act.icon}</span>
                  <span>{act.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* STEP 2: Duration */}
        {step === 2 && selectedActivity && (
          <div className="animate-fade-in">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xl">{ACTIVITIES.find(a => a.id === selectedActivity)?.icon}</span>
              <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                {ACTIVITY_PROFILES[selectedActivity]?.title ?? selectedActivity}
              </p>
            </div>
            <p className="text-xs font-semibold mb-4" style={{ color: 'var(--text-secondary)' }}>
              How long?
            </p>
            <div className="grid grid-cols-2 gap-3">
              {DURATIONS.map(d => (
                <button
                  key={d.label}
                  type="button"
                  onClick={() => {
                    setSelectedDuration(d.hours)
                    setStep(3)
                  }}
                  className="flex flex-col items-center gap-1 rounded-2xl py-4 font-bold transition-all active:scale-95 hover:scale-[1.02]"
                  style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-subtle)',
                    minHeight: 72,
                  }}
                >
                  <span className="text-lg font-black" style={{ color: 'var(--text-primary)' }}>{d.label}</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setStep(1)}
              className="mt-4 text-xs font-bold"
              style={{ color: 'var(--text-tertiary)' }}
            >
              ← Back
            </button>
          </div>
        )}

        {/* STEP 3: Result */}
        {step === 3 && result && selectedActivity && selectedDuration !== null && (
          <div className="animate-fade-in space-y-4">
            {/* Activity + duration label */}
            <div className="flex items-center gap-2">
              <span className="text-xl">{ACTIVITIES.find(a => a.id === selectedActivity)?.icon}</span>
              <div>
                <p className="text-sm font-black" style={{ color: 'var(--text-primary)' }}>
                  {ACTIVITY_PROFILES[selectedActivity]?.title}
                </p>
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  {DURATIONS.find(d => d.hours === selectedDuration)?.label}
                </p>
              </div>
              <div
                className="ml-auto px-3 py-1 rounded-full text-xs font-black"
                style={{
                  background: `${resultTheme.ringColor}15`,
                  border: `1px solid ${resultTheme.ringColor}30`,
                  color: resultTheme.ringColor,
                }}
              >
                {result.level.replace('_', ' ').toUpperCase()} · {result.adjustedRisk}/100
              </div>
            </div>

            {/* Current risk card */}
            <div
              className="rounded-2xl p-4"
              style={{ background: `${resultTheme.ringColor}08`, border: `1px solid ${resultTheme.ringColor}25` }}
            >
              <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: resultTheme.ringColor }}>
                {result.isUnsafe ? '⚠️ Current Conditions' : '✓ Current Conditions'}
              </p>
              <p className="text-sm font-semibold leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                {result.isUnsafe
                  ? `Going out now poses a ${result.level.replace('_', ' ')} heat risk. Consider waiting.`
                  : `Current conditions are manageable. Stay hydrated and take breaks.`}
              </p>
              <p className="text-xs mt-2 leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
                💡 {result.guidance}
              </p>
            </div>

            {/* Safer window */}
            {result.saferStart !== '--:--' && (
              <div
                className="rounded-2xl p-4 flex items-center gap-4"
                style={{ background: 'rgba(74,222,128,0.07)', border: '1px solid rgba(74,222,128,0.25)' }}
              >
                <CheckCircle2 className="size-6 flex-shrink-0 text-emerald-400" />
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-1">
                    Safer Alternative
                  </p>
                  <p className="text-sm font-black font-mono" style={{ color: 'var(--text-primary)' }}>
                    {result.saferStart} – {result.saferEnd}
                  </p>
                  <p className="text-xs text-emerald-300/80">
                    Estimated risk: ~{result.saferRisk}/100 · Lower heat exposure
                  </p>
                </div>
              </div>
            )}

            <p className="text-[10px] text-center" style={{ color: 'var(--text-tertiary)' }}>
              Estimates based on forecast data · Not medical advice
            </p>
          </div>
        )}
      </div>
    </section>
  )
}
