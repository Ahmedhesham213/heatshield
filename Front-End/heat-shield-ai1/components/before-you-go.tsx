'use client'

import { useState } from 'react'
import { X, DoorOpen, ShieldCheck, MapPin, Thermometer, Clock, Flame, ArrowRight } from 'lucide-react'
import { type HeatRiskResponse } from '@/services/api'
import { getRiskTheme, formatTempUnit, type TempUnit } from '@/utils/risk-theme'

type BeforeYouGoProps = {
  heatData: HeatRiskResponse | null
  tempUnit: TempUnit
  selectedLocation: { name: string }
  onActivateProtection?: () => void
}

type ChecklistItem = {
  icon: React.ReactNode
  label: string
  value: string
  color?: string
  warning?: boolean
}

export function BeforeYouGo({ heatData, tempUnit, selectedLocation, onActivateProtection }: BeforeYouGoProps) {
  const [open, setOpen] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  if (!heatData) return null

  const level = heatData.current.riskLevel
  const score = heatData.current.riskScore
  const theme = getRiskTheme(level)
  const temp = heatData.current.temperature
  const feelsLike = heatData.current.feelsLike
  const peak = heatData.peak
  const saferHour = heatData.forecast.find(h => h.level === 'low' || h.level === 'moderate')
  const isHighRisk = score >= 60

  const items: ChecklistItem[] = [
    {
      icon: <MapPin className="size-4" style={{ color: 'var(--accent-cyan)' }} />,
      label: 'Location',
      value: selectedLocation.name,
    },
    {
      icon: <Thermometer className="size-4" style={{ color: '#fb923c' }} />,
      label: 'Heat',
      value: `${formatTempUnit(temp, tempUnit)} · Feels like ${formatTempUnit(feelsLike, tempUnit)}`,
    },
    {
      icon: <span className="text-base">{theme.icon}</span>,
      label: 'Risk',
      value: `${heatData.current.riskLabel} · ${score}/100`,
      color: theme.ringColor,
      warning: isHighRisk,
    },
    ...(peak.time && peak.time !== '--:--'
      ? [{
          icon: <Flame className="size-4 text-orange-400" />,
          label: 'Peak Heat',
          value: peak.windowStart && peak.windowEnd
            ? `${peak.windowStart} – ${peak.windowEnd}`
            : peak.time,
          warning: isHighRisk,
        }]
      : []),
    ...(saferHour
      ? [{
          icon: <Clock className="size-4 text-emerald-400" />,
          label: 'Better Time',
          value: `After ${saferHour.time} (${saferHour.label})`,
          color: '#4ade80',
        }]
      : []),
  ]

  const recommendation = isHighRisk
    ? 'Consider delaying your activity or limiting time outdoors.'
    : 'Conditions are acceptable. Stay hydrated and monitor how you feel.'

  const handleGoOutside = () => {
    setConfirmed(true)
    if (onActivateProtection) onActivateProtection()
  }

  return (
    <>
      {/* Trigger Button */}
      <button
        type="button"
        id="before-you-go-btn"
        onClick={() => { setOpen(true); setConfirmed(false) }}
        className="w-full flex items-center justify-between rounded-2xl px-5 py-4 font-bold text-sm transition-all active:scale-[0.98] hover:scale-[1.01]"
        style={{
          background: isHighRisk ? `${theme.ringColor}10` : 'var(--bg-elevated)',
          border: `1px solid ${isHighRisk ? theme.ringColor + '35' : 'var(--border-subtle)'}`,
          color: isHighRisk ? theme.ringColor : 'var(--text-primary)',
        }}
      >
        <div className="flex items-center gap-3">
          <span className="text-xl">🚪</span>
          <div className="text-left">
            <p className="text-sm font-black">Before You Go</p>
            <p className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>
              Check conditions before heading outside
            </p>
          </div>
        </div>
        <ArrowRight className="size-4 flex-shrink-0" />
      </button>

      {/* Bottom Sheet Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-[200] flex flex-col justify-end"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}
        >
          <div
            className="w-full max-w-lg mx-auto rounded-t-3xl overflow-hidden animate-slide-up"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', maxHeight: '90vh' }}
          >
            {/* Sheet handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full" style={{ background: 'var(--border-default)' }} />
            </div>

            <div className="px-6 py-4 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 40px)' }}>
              {/* Header */}
              <div className="flex items-center justify-between mb-5">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>
                    Pre-Departure Check
                  </p>
                  <h3 className="text-lg font-black" style={{ color: 'var(--text-primary)' }}>
                    Before you head outside…
                  </h3>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  className="size-9 rounded-full grid place-items-center"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
                >
                  <X className="size-4" style={{ color: 'var(--text-secondary)' }} />
                </button>
              </div>

              {!confirmed ? (
                <>
                  {/* Checklist */}
                  <div className="space-y-3 mb-5">
                    {items.map((item, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-4 rounded-2xl p-4"
                        style={{
                          background: item.warning ? `${theme.ringColor}08` : 'var(--bg-elevated)',
                          border: `1px solid ${item.warning ? theme.ringColor + '25' : 'var(--border-subtle)'}`,
                        }}
                      >
                        <div className="flex-shrink-0">{item.icon}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>
                            {item.label}
                          </p>
                          <p
                            className="text-sm font-bold truncate"
                            style={{ color: item.color ?? 'var(--text-primary)' }}
                          >
                            {item.value}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Recommendation */}
                  <div
                    className="rounded-2xl p-4 mb-5"
                    style={{
                      background: isHighRisk ? `${theme.ringColor}10` : 'rgba(74,222,128,0.08)',
                      border: `1px solid ${isHighRisk ? theme.ringColor + '30' : 'rgba(74,222,128,0.25)'}`,
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <ShieldCheck className="size-5 flex-shrink-0 mt-0.5" style={{ color: isHighRisk ? theme.ringColor : '#4ade80' }} />
                      <p className="text-sm font-semibold leading-relaxed" style={{ color: isHighRisk ? theme.ringColor : '#4ade80' }}>
                        {recommendation}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="space-y-3 pb-6">
                    <button
                      type="button"
                      onClick={handleGoOutside}
                      className="w-full flex items-center justify-center gap-3 rounded-2xl py-4 font-bold text-sm transition-all active:scale-[0.98]"
                      style={{
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border-default)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <DoorOpen className="size-5" />
                      I'm Going Outside
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      className="w-full rounded-2xl py-3.5 font-bold text-sm"
                      style={{
                        background: isHighRisk ? `${theme.ringColor}15` : 'rgba(56,189,248,0.1)',
                        border: `1px solid ${isHighRisk ? theme.ringColor + '35' : 'rgba(56,189,248,0.25)'}`,
                        color: isHighRisk ? theme.ringColor : 'var(--accent-cyan)',
                      }}
                    >
                      Stay Inside (Safer)
                    </button>
                  </div>
                </>
              ) : (
                /* Confirmed: going outside */
                <div className="text-center py-8 space-y-4 animate-fade-in pb-10">
                  <div className="size-16 mx-auto rounded-full grid place-items-center" style={{ background: 'rgba(56,189,248,0.12)', border: '1px solid rgba(56,189,248,0.3)' }}>
                    <ShieldCheck className="size-8" style={{ color: 'var(--accent-cyan)' }} />
                  </div>
                  <div>
                    <h4 className="text-lg font-black" style={{ color: 'var(--text-primary)' }}>
                      Stay safe out there.
                    </h4>
                    <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>
                      HeatShield will keep monitoring conditions.
                      {saferHour && ` Conditions improve around ${saferHour.time}.`}
                    </p>
                  </div>
                  <button
                    onClick={() => setOpen(false)}
                    className="mt-4 rounded-xl px-6 py-3 font-bold text-sm"
                    style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
