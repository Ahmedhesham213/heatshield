'use client'

import React, { useState } from 'react'
import {
  Award,
  CheckCircle2,
  Flame,
  ShieldCheck,
  Sparkles,
  Trophy,
  Zap,
} from 'lucide-react'

export function GamificationBadge() {
  const [streakDays, setStreakDays] = useState<number>(4)
  const [checklist, setChecklist] = useState<Record<string, boolean>>({
    water: true,
    shade: false,
    sunscreen: true,
    peakAvoid: false,
  })

  const badges = [
    { id: 1, title: 'Peak Heat Dodger', icon: '🛡️', desc: 'Avoided outdoor exposure during 1-4 PM peak heat', unlocked: true },
    { id: 2, title: 'Hydration Master', icon: '💧', desc: 'Maintained 20-min hydration intervals', unlocked: true },
    { id: 3, title: 'Cool Route Pioneer', icon: '🗺️', desc: 'Selected Heat-Safe route saving 34% heat strain', unlocked: true },
    { id: 4, title: 'Early Bird Athlete', icon: '🌅', desc: 'Completed outdoor workout before 8:00 AM', unlocked: true },
  ]

  const safetyItems = [
    { id: 'water', label: 'Hydration: Carrying at least 1L water', icon: '💧' },
    { id: 'shade', label: 'Shade Planning: Rest stops planned under trees/canopies', icon: '🌳' },
    { id: 'sunscreen', label: 'UV Protection: Broad spectrum SPF 50+ applied', icon: '🧢' },
    { id: 'peakAvoid', label: 'Peak Heat: Storing outdoor tasks outside 1–4 PM window', icon: '⏰' },
  ]

  const completedCount = Object.values(checklist).filter(Boolean).length

  return (
    <section id="safety" className="hs-card p-6 sm:p-8 space-y-8">
      {/* SECTION HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Trophy className="size-4 text-amber-400" />
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>
              Heat Smart Status & Safety Checklist
            </span>
          </div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            Personal HeatShield Score & Checklist
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Track your outdoor safety readiness and unlock heat resilience achievements
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-xs font-bold"
            style={{
              background: 'rgba(251,146,60,0.12)',
              borderColor: 'rgba(251,146,60,0.25)',
              color: '#fb923c',
            }}
          >
            <Flame className="size-3.5 fill-orange-400 text-orange-500" />
            {streakDays} Day Safe Streak
          </div>
        </div>
      </div>

      {/* PERSONAL SAFETY CHECKLIST */}
      <div className="p-5 rounded-2xl border" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4" style={{ color: 'var(--accent-cyan)' }} />
            <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-primary)' }}>
              Pre-Departure Heat Safety Checklist ({completedCount}/{safetyItems.length})
            </h3>
          </div>
          <span className="font-mono text-xs font-bold" style={{ color: completedCount === 4 ? '#4ade80' : 'var(--text-tertiary)' }}>
            {Math.round((completedCount / safetyItems.length) * 100)}% Ready
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {safetyItems.map((item) => {
            const isChecked = Boolean(checklist[item.id])
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setChecklist((prev) => ({ ...prev, [item.id]: !prev[item.id] }))}
                className="flex items-center gap-3 p-3 rounded-xl border text-left transition-all"
                style={{
                  background: isChecked ? 'rgba(74,222,128,0.08)' : 'var(--bg-surface)',
                  borderColor: isChecked ? 'rgba(74,222,128,0.25)' : 'var(--border-subtle)',
                }}
              >
                <div
                  className="grid size-5 place-items-center rounded-md flex-shrink-0 transition-all"
                  style={{
                    background: isChecked ? '#4ade80' : 'transparent',
                    border: isChecked ? 'none' : '1px solid var(--border-strong)',
                    color: '#080b10',
                  }}
                >
                  {isChecked && <CheckCircle2 className="size-3.5 stroke-[3]" />}
                </div>
                <span className="text-xs font-medium" style={{ color: isChecked ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                  {item.icon} {item.label}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ACHIEVEMENTS & BADGES */}
      <div>
        <p className="text-[10px] font-extrabold uppercase tracking-widest mb-3" style={{ color: 'var(--text-tertiary)' }}>
          Unlocked Heat Safety Badges
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {badges.map((b) => (
            <div
              key={b.id}
              className="rounded-2xl p-4 border transition-all flex items-start gap-3"
              style={{
                background: b.unlocked ? 'rgba(56,189,248,0.06)' : 'var(--bg-elevated)',
                borderColor: b.unlocked ? 'rgba(56,189,248,0.2)' : 'var(--border-subtle)',
              }}
            >
              <span className="text-2xl flex-shrink-0">{b.icon}</span>
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>{b.title}</p>
                  {b.unlocked && <CheckCircle2 className="size-3 text-sky-400" />}
                </div>
                <p className="text-[10px] mt-1 leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
                  {b.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
