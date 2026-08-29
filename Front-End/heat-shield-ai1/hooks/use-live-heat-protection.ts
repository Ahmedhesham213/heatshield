'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getHeatRisk, getNearbySafer, isUSLocation, type HeatRiskResponse, type NearbySaferResponse } from '@/services/api'
import { getRiskTheme } from '@/utils/risk-theme'

// Distance in metres between two lat/lon points (Haversine)
function haversineMetres(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const φ1 = (lat1 * Math.PI) / 180
  const φ2 = (lat2 * Math.PI) / 180
  const Δφ = ((lat2 - lat1) * Math.PI) / 180
  const Δλ = ((lon2 - lon1) * Math.PI) / 180
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Minimum movement (metres) before triggering a new fetch
const MOVE_THRESHOLD_M = 50
// Re-poll even without movement (milliseconds)
const POLL_INTERVAL_MS = 3 * 60 * 1000
// Cooldown per severity band before re-notifying (milliseconds)
const NOTIFY_COOLDOWN_MS = 10 * 60 * 1000

type SeverityBand = 'caution' | 'high' | 'extreme'

function scoreToBand(score: number): SeverityBand | null {
  if (score >= 80) return 'extreme'
  if (score >= 60) return 'high'
  if (score >= 40) return 'caution'
  return null
}

function buildNotification(score: number, temp: number, feelsLike: number, level: string): { title: string; body: string } | null {
  const theme = getRiskTheme(level)
  if (score >= 80) {
    return {
      title: '🆘 Extreme Heat Alert — HeatShield',
      body: `Dangerous heat at your location. ${temp.toFixed(1)}°C / feels ${feelsLike.toFixed(1)}°C. Risk ${score}/100. Avoid outdoor exposure.`,
    }
  }
  if (score >= 60) {
    return {
      title: `${theme.icon} HeatShield Warning`,
      body: `Very high heat near you. ${temp.toFixed(1)}°C / feels ${feelsLike.toFixed(1)}°C. Risk ${score}/100. Take precautions.`,
    }
  }
  if (score >= 40) {
    return {
      title: '⚠️ HeatShield Alert',
      body: `Elevated heat risk at your location. ${temp.toFixed(1)}°C / Risk ${score}/100. Stay hydrated.`,
    }
  }
  return null
}

export type LiveHeatState = {
  liveData: HeatRiskResponse | null
  liveLoading: boolean
  liveError: string | null
  isProtecting: boolean
  setIsProtecting: (v: boolean) => void
  notifPermission: NotificationPermission | 'unsupported'
  requestNotifPermission: () => Promise<boolean>
  coolerArea: NearbySaferResponse | null
  coolerAreaLoading: boolean
  findCoolerArea: () => void
  currentGpsPos: { lat: number; lon: number } | null
  isOutsideUS: boolean
}

export function useLiveHeatProtection(): LiveHeatState {
  const [isProtecting, setIsProtecting] = useState(false)
  const [liveData, setLiveData] = useState<HeatRiskResponse | null>(null)
  const [liveLoading, setLiveLoading] = useState(false)
  const [liveError, setLiveError] = useState<string | null>(null)
  const [currentGpsPos, setCurrentGpsPos] = useState<{ lat: number; lon: number } | null>(null)
  const [isOutsideUS, setIsOutsideUS] = useState(false)
  const [coolerArea, setCoolerArea] = useState<NearbySaferResponse | null>(null)
  const [coolerAreaLoading, setCoolerAreaLoading] = useState(false)

  const [notifPermission, setNotifPermission] = useState<NotificationPermission | 'unsupported'>(() => {
    if (typeof window === 'undefined') return 'unsupported'
    if (!('Notification' in window)) return 'unsupported'
    return Notification.permission
  })

  // Track last fetch position and time to debounce
  const lastFetchPos = useRef<{ lat: number; lon: number } | null>(null)
  const lastFetchTime = useRef<number>(0)
  // Cooldown timestamps per severity band
  const notifCooldown = useRef<Record<SeverityBand, number>>({ caution: 0, high: 0, extreme: 0 })
  const watchIdRef = useRef<number | null>(null)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isFetchingRef = useRef(false)

  const requestNotifPermission = useCallback(async (): Promise<boolean> => {
    if (typeof window === 'undefined' || !('Notification' in window)) return false
    const perm = await Notification.requestPermission()
    setNotifPermission(perm)
    return perm === 'granted'
  }, [])

  const maybeSendNotification = useCallback((data: HeatRiskResponse) => {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    if (Notification.permission !== 'granted') return
    const score = data.current.riskScore
    const band = scoreToBand(score)
    if (!band) return
    const now = Date.now()
    if (now - notifCooldown.current[band] < NOTIFY_COOLDOWN_MS) return
    const notif = buildNotification(score, data.current.temperature, data.current.feelsLike, data.current.riskLevel)
    if (!notif) return
    try {
      new Notification(notif.title, {
        body: notif.body,
        icon: '/favicon.ico',
        tag: `heatshield-${band}`,
      })
    } catch {
      // notification blocked silently
    }
    notifCooldown.current[band] = now
  }, [])

  const fetchForPosition = useCallback(async (lat: number, lon: number) => {
    if (isFetchingRef.current) return
    const pos = lastFetchPos.current
    if (pos) {
      const dist = haversineMetres(lat, lon, pos.lat, pos.lon)
      const elapsed = Date.now() - lastFetchTime.current
      if (dist < MOVE_THRESHOLD_M && elapsed < POLL_INTERVAL_MS) return
    }
    if (!isUSLocation(lat, lon)) {
      setIsOutsideUS(true)
      setLiveError('FortyGuard supports US locations only. Live protection unavailable here.')
      return
    }
    setIsOutsideUS(false)
    setLiveError(null)
    isFetchingRef.current = true
    setLiveLoading(true)
    try {
      const data = await getHeatRisk(lat, lon)
      setLiveData(data)
      lastFetchPos.current = { lat, lon }
      lastFetchTime.current = Date.now()
      maybeSendNotification(data)
    } catch (e: unknown) {
      setLiveError(e instanceof Error ? e.message : 'Failed to fetch heat risk data.')
    } finally {
      setLiveLoading(false)
      isFetchingRef.current = false
    }
  }, [maybeSendNotification])

  // Start/Stop GPS watch and polling
  useEffect(() => {
    if (!isProtecting) {
      // Clean up
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current)
        pollTimerRef.current = null
      }
      return
    }

    if (!navigator.geolocation) {
      setLiveError('Geolocation is not supported by this browser.')
      return
    }

    const onPosition = (pos: GeolocationPosition) => {
      const { latitude, longitude } = pos.coords
      setCurrentGpsPos({ lat: latitude, lon: longitude })
      fetchForPosition(latitude, longitude)
    }

    const onError = (err: GeolocationPositionError) => {
      setLiveError(`GPS error: ${err.message}`)
    }

    // Start continuous GPS watch
    watchIdRef.current = navigator.geolocation.watchPosition(onPosition, onError, {
      enableHighAccuracy: true,
      maximumAge: 30000,
      timeout: 20000,
    })

    // Polling timer as fallback
    pollTimerRef.current = setInterval(() => {
      if (currentGpsPos) {
        fetchForPosition(currentGpsPos.lat, currentGpsPos.lon)
      }
    }, POLL_INTERVAL_MS)

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current)
        pollTimerRef.current = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isProtecting, fetchForPosition])

  const findCoolerArea = useCallback(() => {
    const pos = currentGpsPos ?? lastFetchPos.current
    if (!pos) return
    setCoolerAreaLoading(true)
    setCoolerArea(null)
    getNearbySafer(pos.lat, pos.lon, 500)
      .then((data) => setCoolerArea(data))
      .catch(() => setCoolerArea(null))
      .finally(() => setCoolerAreaLoading(false))
  }, [currentGpsPos])

  return {
    liveData,
    liveLoading,
    liveError,
    isProtecting,
    setIsProtecting,
    notifPermission,
    requestNotifPermission,
    coolerArea,
    coolerAreaLoading,
    findCoolerArea,
    currentGpsPos,
    isOutsideUS,
  }
}
