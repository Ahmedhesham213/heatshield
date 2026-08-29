'use client'

import React, { useState } from 'react'
import {
  Bell,
  Check,
  Globe,
  Sliders,
  Sparkles,
  Thermometer,
  User,
  X,
} from 'lucide-react'
import {
  ACTIVITY_PROFILES,
  TempUnit,
} from '@/utils/risk-theme'

type SettingsModalProps = {
  isOpen: boolean
  onClose: () => void
  tempUnit: TempUnit
  setTempUnit: (unit: TempUnit) => void
  selectedActivity: string
  setSelectedActivity: (activity: string) => void
  notificationsEnabled: boolean
  setNotificationsEnabled: (enabled: boolean) => void
  alertThreshold: number
  setAlertThreshold: (threshold: number) => void
  onRequestNotificationPermission: () => Promise<boolean>
}

export function SettingsModal({
  isOpen,
  onClose,
  tempUnit,
  setTempUnit,
  selectedActivity,
  setSelectedActivity,
  notificationsEnabled,
  setNotificationsEnabled,
  alertThreshold,
  setAlertThreshold,
  onRequestNotificationPermission,
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'preferences' | 'safety' | 'alerts'>('preferences')
  const [notificationMsg, setNotificationMsg] = useState<string | null>(null)

  if (!isOpen) return null

  const handleToggleNotifications = async () => {
    if (!notificationsEnabled) {
      const granted = await onRequestNotificationPermission()
      if (granted) {
        setNotificationsEnabled(true)
        setNotificationMsg('Browser notifications enabled successfully!')
      } else {
        setNotificationMsg('Notification permission was denied by browser.')
      }
    } else {
      setNotificationsEnabled(false)
      setNotificationMsg('Browser notifications turned off.')
    }
    setTimeout(() => setNotificationMsg(null), 3000)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div
        className="relative z-10 w-full max-w-lg rounded-3xl p-6 shadow-2xl animate-in zoom-in-95 duration-200"
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          color: 'var(--text-primary)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 mb-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="flex items-center gap-3">
            <div
              className="grid size-10 place-items-center rounded-2xl"
              style={{ background: 'rgba(56,189,248,0.15)', border: '1px solid var(--border-subtle)' }}
            >
              <Sliders className="size-5" style={{ color: 'var(--accent-cyan)' }} />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
                HeatShield Preferences
              </h2>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                Customize units, personal safety, and alerts
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="grid size-8 place-items-center rounded-full transition-colors hover:bg-white/10"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex gap-2 p-1 rounded-xl mb-6" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
          <button
            onClick={() => setActiveTab('preferences')}
            className="flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all"
            style={{
              background: activeTab === 'preferences' ? 'var(--bg-surface)' : 'transparent',
              color: activeTab === 'preferences' ? 'var(--accent-cyan)' : 'var(--text-secondary)',
              boxShadow: activeTab === 'preferences' ? '0 2px 8px rgba(0,0,0,0.15)' : 'none',
            }}
          >
            <Globe className="size-3.5" />
            General
          </button>
          <button
            onClick={() => setActiveTab('safety')}
            className="flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all"
            style={{
              background: activeTab === 'safety' ? 'var(--bg-surface)' : 'transparent',
              color: activeTab === 'safety' ? 'var(--accent-cyan)' : 'var(--text-secondary)',
              boxShadow: activeTab === 'safety' ? '0 2px 8px rgba(0,0,0,0.15)' : 'none',
            }}
          >
            <User className="size-3.5" />
            Safety Profile
          </button>
          <button
            onClick={() => setActiveTab('alerts')}
            className="flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all"
            style={{
              background: activeTab === 'alerts' ? 'var(--bg-surface)' : 'transparent',
              color: activeTab === 'alerts' ? 'var(--accent-cyan)' : 'var(--text-secondary)',
              boxShadow: activeTab === 'alerts' ? '0 2px 8px rgba(0,0,0,0.15)' : 'none',
            }}
          >
            <Bell className="size-3.5" />
            Alerts
          </button>
        </div>

        {/* Tab 1: General Preferences */}
        {activeTab === 'preferences' && (
          <div className="space-y-5">
            <div>
              <label className="text-xs font-bold uppercase tracking-widest block mb-2" style={{ color: 'var(--text-tertiary)' }}>
                Temperature Unit
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setTempUnit('C')}
                  className="flex items-center justify-between p-3.5 rounded-2xl border text-left transition-all"
                  style={{
                    background: tempUnit === 'C' ? 'rgba(56,189,248,0.12)' : 'var(--bg-elevated)',
                    borderColor: tempUnit === 'C' ? 'var(--accent-cyan)' : 'var(--border-subtle)',
                  }}
                >
                  <div>
                    <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Celsius (°C)</p>
                    <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>Standard metric unit</p>
                  </div>
                  {tempUnit === 'C' && <Check className="size-4" style={{ color: 'var(--accent-cyan)' }} />}
                </button>

                <button
                  type="button"
                  onClick={() => setTempUnit('F')}
                  className="flex items-center justify-between p-3.5 rounded-2xl border text-left transition-all"
                  style={{
                    background: tempUnit === 'F' ? 'rgba(56,189,248,0.12)' : 'var(--bg-elevated)',
                    borderColor: tempUnit === 'F' ? 'var(--accent-cyan)' : 'var(--border-subtle)',
                  }}
                >
                  <div>
                    <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Fahrenheit (°F)</p>
                    <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>US standard unit</p>
                  </div>
                  {tempUnit === 'F' && <Check className="size-4" style={{ color: 'var(--accent-cyan)' }} />}
                </button>
              </div>
            </div>

            <div className="p-4 rounded-2xl" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
              <div className="flex items-center gap-3">
                <Thermometer className="size-5" style={{ color: 'var(--accent-cyan)' }} />
                <div>
                  <p className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>Live Unit Conversion Active</p>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                    All dashboard metrics, forecasts, peak windows, and routes update instantly.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Personal Safety Mode */}
        {activeTab === 'safety' && (
          <div className="space-y-4">
            <p className="text-xs font-medium leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              Select your primary outdoor activity. HeatShield customizes hydration intervals and safety recommendations accordingly.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[260px] overflow-y-auto pr-1">
              {Object.values(ACTIVITY_PROFILES).map((profile) => {
                const isSelected = selectedActivity === profile.id
                return (
                  <button
                    key={profile.id}
                    onClick={() => setSelectedActivity(profile.id)}
                    className="flex items-start gap-3 p-3 rounded-2xl text-left border transition-all"
                    style={{
                      background: isSelected ? 'rgba(56,189,248,0.12)' : 'var(--bg-elevated)',
                      borderColor: isSelected ? 'var(--accent-cyan)' : 'var(--border-subtle)',
                    }}
                  >
                    <span className="text-2xl flex-shrink-0">{profile.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold truncate" style={{ color: 'var(--text-primary)' }}>{profile.title}</p>
                        {isSelected && <Check className="size-3.5 flex-shrink-0" style={{ color: 'var(--accent-cyan)' }} />}
                      </div>
                      <p className="text-[10px] mt-1 line-clamp-2" style={{ color: 'var(--text-tertiary)' }}>
                        {profile.guidance}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Tab 3: Alerts & Notifications */}
        {activeTab === 'alerts' && (
          <div className="space-y-5">
            <div className="flex items-center justify-between p-4 rounded-2xl" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
              <div>
                <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Browser Heat Notifications</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>Receive real-time alerts when peak heat begins</p>
              </div>
              <button
                type="button"
                onClick={handleToggleNotifications}
                className="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out"
                style={{ background: notificationsEnabled ? 'var(--accent-cyan)' : 'var(--border-default)' }}
              >
                <span
                  className="pointer-events-none inline-block size-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out"
                  style={{ transform: notificationsEnabled ? 'translateX(20px)' : 'translateX(0px)' }}
                />
              </button>
            </div>

            {notificationMsg && (
              <p className="text-xs font-bold text-center px-3 py-2 rounded-xl" style={{ background: 'rgba(56,189,248,0.15)', color: 'var(--accent-cyan)' }}>
                {notificationMsg}
              </p>
            )}

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>
                  Alert Risk Threshold
                </label>
                <span className="font-mono text-sm font-bold" style={{ color: '#fb923c' }}>
                  Risk &gt; {alertThreshold}/100
                </span>
              </div>
              <input
                type="range"
                min="40"
                max="85"
                step="5"
                value={alertThreshold}
                onChange={(e) => setAlertThreshold(Number(e.target.value))}
                className="w-full h-2 rounded-lg appearance-none cursor-pointer"
                style={{ background: 'var(--border-subtle)', accentColor: 'var(--accent-cyan)' }}
              />
              <div className="flex justify-between text-[10px] mt-1.5" style={{ color: 'var(--text-tertiary)' }}>
                <span>40 (Moderate)</span>
                <span>60 (High)</span>
                <span>80 (Very High)</span>
              </div>
            </div>
          </div>
        )}

        {/* Footer Action */}
        <div className="mt-6 pt-4 flex justify-end" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <button
            onClick={onClose}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all"
            style={{ background: 'var(--accent-cyan)', color: 'var(--primary-foreground)' }}
          >
            <Sparkles className="size-3.5" />
            Done & Save
          </button>
        </div>
      </div>
    </div>
  )
}
