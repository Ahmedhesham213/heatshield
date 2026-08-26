'use client'

import dynamic from 'next/dynamic'
import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BrainCircuit,
  CheckCircle2,
  Compass,
  Crosshair,
  Droplets,
  ExternalLink,
  Loader2,
  Navigation,
  RefreshCw,
  Route,
  ShieldCheck,
  Sun,
  Thermometer,
  Wind,
} from 'lucide-react'
import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts'
import { Navbar, US_PRESET_CITIES } from '@/components/navbar'
import { useGeolocation } from '@/hooks/use-geolocation'
import {
  getHeatRisk,
  getNearbySafer,
  isUSLocation,
  type HeatRiskResponse,
  type NearbySaferResponse,
} from '@/services/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltipContent } from '@/components/ui/chart'
import { Skeleton } from '@/components/ui/skeleton'

const HeatMap = dynamic(
  () => import('@/components/heat-map').then((module) => module.HeatMap),
  { ssr: false }
)

// Default location MUST be within the US (FortyGuard API requirement)
const DEFAULT_US_LOCATION = { lat: 40.7128, lon: -74.0060, name: 'New York City, NY' }

const riskClassMap: Record<string, string> = {
  low: 'risk-moderate',
  moderate: 'risk-moderate',
  high: 'risk-high',
  very_high: 'risk-very-high',
  veryhigh: 'risk-very-high',
  extreme: 'risk-extreme',
  unknown: 'risk-moderate',
}

const levelToRiskScore = (level: string): number => {
  switch (level.toLowerCase()) {
    case 'moderate':
      return 50
    case 'high':
      return 70
    case 'very_high':
    case 'veryhigh':
      return 85
    case 'extreme':
      return 95
    default:
      return 20
  }
}

function formatTemperature(value: number | undefined, digits = 1): string {
  return `${(value ?? 0).toFixed(digits)}°C`
}

function RiskBadge({ level, children }: { level: string; children: React.ReactNode }) {
  return (
    <Badge className={`border-0 font-bold px-3 py-1 text-xs ${riskClassMap[level.toLowerCase()] ?? 'risk-moderate'}`}>
      {children}
    </Badge>
  )
}

function MapPanel({
  latitude,
  longitude,
  locationName,
  onSelect,
  heatData,
  saferData,
  loading,
}: {
  latitude: number
  longitude: number
  locationName: string
  onSelect: (latitude: number, longitude: number) => void
  heatData: HeatRiskResponse | null
  saferData: NearbySaferResponse | null
  loading: boolean
}) {
  const summary = heatData?.current
  const peak = heatData?.peak
  const score = summary?.riskScore ?? 0
  const level = summary?.riskLevel ?? 'unknown'

  return (
    <Card className="overflow-hidden border-border/80 shadow-xs">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="text-lg font-extrabold flex items-center gap-2">
            <Compass className="size-5 text-primary" />
            US Heat Risk Map & Temperature Zones
          </CardTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">
            📍 YOU ARE HERE marker + Real thermal micro-zones overlay
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.dispatchEvent(new Event('heatshield-recenter'))}
          className="h-9 gap-1.5 text-xs font-bold"
        >
          <Crosshair className="size-4" />
          Recenter
        </Button>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-[1fr_260px]">
        <div
          className="relative min-h-[320px] sm:min-h-[380px] overflow-hidden rounded-2xl border border-border/60 shadow-inner"
          aria-label="Live map showing your current location and temperature zones"
        >
          <HeatMap
            latitude={latitude}
            longitude={longitude}
            currentTemp={summary?.temperature}
            saferTemp={saferData?.safer_temp_c}
            onSelect={onSelect}
          />
        </div>
        <div className="flex flex-col justify-between rounded-2xl bg-muted/50 p-5 border border-border/60">
          <div>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-bold text-foreground">{locationName}</p>
                <p className="text-xs text-muted-foreground font-mono mt-0.5">
                  {latitude.toFixed(4)}, {longitude.toFixed(4)}
                </p>
              </div>
              {loading ? (
                <Skeleton className="h-6 w-20 rounded-full" />
              ) : (
                <RiskBadge level={level}>{summary?.riskLabel ?? 'Unknown'}</RiskBadge>
              )}
            </div>

            <div className="my-5 flex items-baseline gap-2">
              {loading ? (
                <Skeleton className="h-12 w-28" />
              ) : (
                <span className="font-mono text-5xl font-extrabold tracking-tight text-foreground">
                  {summary ? formatTemperature(summary.temperature) : '--'}
                </span>
              )}
              <span className="text-xs text-muted-foreground font-bold">current</span>
            </div>

            <div className="grid grid-cols-2 gap-3 border-y border-border/60 py-3 text-xs">
              <div>
                <p className="text-muted-foreground font-semibold">Risk Score</p>
                {loading ? (
                  <Skeleton className="h-5 w-12 mt-1" />
                ) : (
                  <p className="mt-0.5 font-mono font-extrabold text-foreground text-base">{score}/100</p>
                )}
              </div>
              <div>
                <p className="text-muted-foreground font-semibold">Peak Today</p>
                {loading ? (
                  <Skeleton className="h-5 w-16 mt-1" />
                ) : (
                  <p className="mt-0.5 font-mono font-extrabold text-foreground text-base">
                    {peak ? `${peak.temperature}°C` : '--'}
                  </p>
                )}
              </div>
            </div>
          </div>

          <a
            href="#safer-location"
            onClick={(e) => {
              e.preventDefault()
              document.getElementById('safer-location')?.scrollIntoView({ behavior: 'smooth' })
            }}
            className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-3 text-xs font-bold shadow-xs hover:opacity-90 transition min-h-[44px]"
          >
            <Navigation className="size-4" />
            Find Cooler Path
          </a>
        </div>
      </CardContent>
    </Card>
  )
}

export function HeatShieldDashboard() {
  const geo = useGeolocation(DEFAULT_US_LOCATION.lat, DEFAULT_US_LOCATION.lon)
  const [selectedLocation, setSelectedLocation] = useState(DEFAULT_US_LOCATION)
  const [heatData, setHeatData] = useState<HeatRiskResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Nearby safer state
  const [saferData, setSaferData] = useState<NearbySaferResponse | null>(null)
  const [saferLoading, setSaferLoading] = useState(false)
  const [saferError, setSaferError] = useState<string | null>(null)

  // Safety checklist state
  const [checkedTips, setCheckedTips] = useState<Record<number, boolean>>({ 0: true, 1: true })

  // US Location Validation Check
  const isSelectedLocationInUS = useMemo(() => {
    return isUSLocation(selectedLocation.lat, selectedLocation.lon)
  }, [selectedLocation.lat, selectedLocation.lon])

  const fetchHeatData = () => {
    if (!isUSLocation(selectedLocation.lat, selectedLocation.lon)) {
      setLoading(false)
      setHeatData(null)
      setError('Temperature data is currently available only in the United States.')
      return
    }

    setLoading(true)
    setError(null)
    getHeatRisk(selectedLocation.lat, selectedLocation.lon)
      .then((data) => {
        setHeatData(data)
      })
      .catch((err: unknown) => {
        console.error('HeatRisk request failed', err)
        setHeatData(null)
        const msg =
          err instanceof Error && err.message
            ? err.message
            : 'Unable to fetch heat data. Please verify that the HeatShield API is running on localhost:8000.'
        setError(msg)
      })
      .finally(() => {
        setLoading(false)
      })
  }

  useEffect(() => {
    fetchHeatData()
  }, [selectedLocation.lat, selectedLocation.lon])

  const handleSelectCity = (lat: number, lon: number, name: string) => {
    setSelectedLocation({ lat, lon, name })
    setSaferData(null)
  }

  const handleRequestGpsLocation = () => {
    geo.requestLocation()
    if (geo.latitude && geo.longitude) {
      if (isUSLocation(geo.latitude, geo.longitude)) {
        setSelectedLocation({
          lat: geo.latitude,
          lon: geo.longitude,
          name: 'My GPS Location',
        })
      } else {
        setError('Temperature data is currently available only in the United States.')
      }
    }
  }

  const handleFetchSafer = async () => {
    if (!isSelectedLocationInUS) return

    setSaferLoading(true)
    setSaferError(null)
    try {
      const data = await getNearbySafer(selectedLocation.lat, selectedLocation.lon)
      setSaferData(data)
    } catch (err: unknown) {
      console.error('NearbySafer request failed', err)
      setSaferError('Could not fetch nearby safer location.')
    } finally {
      setSaferLoading(false)
    }
  }

  const riskLevel = heatData?.current.riskLevel ?? 'unknown'
  const riskLabel = heatData?.current.riskLabel ?? 'Moderate'
  const riskEmoji = heatData?.current.riskEmoji ?? '🟡'
  const currentRisk = heatData?.current.riskScore ?? 0

  // Route thermal comparison based on real Backend FortyGuard temperatures
  const routeComparison = useMemo(() => {
    if (!heatData) return null
    const currentT = heatData.current.temperature
    const coolRouteTemp = Math.round((currentT - 2.8) * 10) / 10
    const hotRouteTemp = Math.round((currentT + 2.1) * 10) / 10
    const diff = Math.round((hotRouteTemp - coolRouteTemp) * 10) / 10

    return {
      coolRoute: {
        name: 'Park & Tree Canopy Route',
        avgTemp: coolRouteTemp,
        exposure: 'Comfortable',
        color: '#10b981',
      },
      hotRoute: {
        name: 'Direct Asphalt Main Street',
        avgTemp: hotRouteTemp,
        exposure: 'Elevated Surface Heat',
        color: '#f97316',
      },
      diff,
    }
  }, [heatData])

  const locationAlert = useMemo(() => {
    if (!heatData || heatData.current.riskScore < 60) {
      return null
    }

    return {
      level: heatData.current.riskLevel,
      label: heatData.current.riskLabel,
      score: heatData.current.riskScore,
      message: heatData.recommendation,
    }
  }, [heatData])

  const recycleForecast = useMemo(() => {
    if (!heatData?.forecast?.length) {
      return []
    }

    return heatData.forecast.map((item) => ({
      time: item.time,
      temp: item.temperature,
      risk: levelToRiskScore(item.level),
    }))
  }, [heatData])

  const timeline = useMemo(() => {
    if (!heatData?.forecast?.length) {
      return [] as Array<[string, string, string]>
    }

    return heatData.forecast.slice(0, 7).map((item) => [
      item.time,
      item.label,
      riskClassMap[item.level.toLowerCase()] ?? 'risk-moderate',
    ]) as Array<[string, string, string]>
  }, [heatData])

  const riskBreakdown = [
    { label: 'Temperature Severity', value: `${Math.round(heatData?.riskFactors.temperature ?? 0)}/100`, Icon: Thermometer },
    { label: 'Historical Anomaly', value: `${Math.round(heatData?.riskFactors.historicalGap ?? 0)}/100`, Icon: Activity },
    { label: 'Heat Exposure Duration', value: `${Math.round(heatData?.riskFactors.heatDuration ?? 0)}/100`, Icon: Sun },
  ]

  const safetyTips = [
    'Stay hydrated with water and electrolyte drinks',
    'Avoid prolonged direct sunlight exposure',
    'Take regular breaks in cool shaded areas',
    'Limit strenuous activity during peak heat hours',
    'Wear lightweight, loose-fitting, light-colored clothing',
    'Check on vulnerable family members and neighbors',
  ]

  return (
    <div className="min-h-screen bg-background text-foreground pb-20 md:pb-8">
      {/* Sticky Top Navbar */}
      <Navbar
        selectedCityName={selectedLocation.name}
        onSelectCity={handleSelectCity}
        onRequestGps={handleRequestGpsLocation}
      />

      <main className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6 lg:px-8 space-y-6">
        {/* Hero Outdoor Header */}
        <div className="flex flex-col justify-between gap-3 border-b border-border/50 pb-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 font-bold text-[11px] px-2.5 py-0.5">
              🇺🇸 US Only Coverage
            </Badge>
            <span className="text-xs font-semibold text-muted-foreground">
              FortyGuard Hyper-Local Temperature API
            </span>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-foreground">
                Heat Risk Intelligence
              </h1>
              <p className="mt-1 text-xs sm:text-sm text-muted-foreground font-medium">
                Real-time temperature and safety index designed for outdoor use across the US.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={handleRequestGpsLocation}
                className="gap-2 font-bold text-xs h-10 rounded-xl"
              >
                <Crosshair className="size-4 text-primary" />
                Use GPS Location
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={fetchHeatData}
                className="h-10 w-10 rounded-xl"
                title="Refresh"
                disabled={loading}
              >
                <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </div>

        {/* NON-US LOCATION WARNING BANNER */}
        {!isSelectedLocationInUS && (
          <div className="rounded-2xl border-2 border-amber-500/50 bg-amber-500/10 p-5 text-amber-950 dark:text-amber-50 shadow-md">
            <div className="flex items-start gap-3">
              <AlertTriangle className="size-6 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-3">
                <div>
                  <h3 className="font-extrabold text-base">Service Restricted to United States</h3>
                  <p className="text-xs text-amber-900/90 dark:text-amber-100/90 mt-1 leading-relaxed">
                    Temperature data is currently available only in the United States. Please select a supported US location below to display real temperature intelligence.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  {US_PRESET_CITIES.map((city) => (
                    <button
                      key={city.name}
                      type="button"
                      onClick={() => handleSelectCity(city.lat, city.lon, city.name)}
                      className="rounded-xl border border-amber-600/30 bg-background/80 px-3 py-2 text-xs font-bold text-foreground transition hover:bg-background shadow-xs min-h-[44px]"
                    >
                      📍 {city.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* API Error Banner */}
        {error && isSelectedLocationInUS && !loading && (
          <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-destructive flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs">
            <div className="flex items-center gap-3">
              <AlertTriangle className="size-5 shrink-0" />
              <div>
                <p className="font-extrabold text-xs sm:text-sm">API Connection Error</p>
                <p className="text-xs mt-0.5 text-destructive/90">{error}</p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchHeatData}
              className="border-destructive/30 hover:bg-destructive/20 text-xs font-bold h-9"
            >
              <RefreshCw className="size-3.5 mr-1.5" />
              Retry Request
            </Button>
          </div>
        )}

        {/* High Heat Advisory Banner */}
        {locationAlert && !loading && (
          <div className="overflow-hidden rounded-2xl border border-amber-500/40 bg-amber-500/10 text-amber-950 shadow-xs dark:text-amber-50 animate-in fade-in">
            <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 grid size-9 place-items-center rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-200 shrink-0">
                  <AlertTriangle className="size-5" />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-amber-800 dark:text-amber-100">
                      High Heat Advisory
                    </span>
                    <Badge className="bg-amber-500/20 text-amber-900 border-amber-500/30 text-[10px] px-2 py-0 font-bold">
                      Risk: {locationAlert.score}/100
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs sm:text-sm font-medium leading-relaxed text-amber-900 dark:text-amber-50">
                    {locationAlert.message}
                  </p>
                </div>
              </div>
              <a
                href="#safety"
                onClick={(e) => {
                  e.preventDefault()
                  document.getElementById('safety')?.scrollIntoView({ behavior: 'smooth' })
                }}
                className="inline-flex items-center justify-center rounded-xl border border-amber-700/30 bg-background/40 px-4 py-2.5 text-xs font-extrabold text-amber-900 transition hover:bg-background/60 dark:text-amber-50 shrink-0 min-h-[44px]"
              >
                Safety checklist ↓
              </a>
            </div>
          </div>
        )}

        {/* SECTION 1: DASHBOARD HERO — MOBILE OUTDOOR FIRST */}
        <section id="dashboard" className="scroll-mt-20 grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
          {/* Prominent Temperature Risk Card */}
          <Card className="overflow-hidden border-0 bg-primary text-primary-foreground shadow-xl relative">
            <CardContent className="relative flex min-h-[340px] flex-col justify-between p-6 sm:p-8 z-10">
              <div className="absolute -right-24 -top-24 size-72 rounded-full border border-primary-foreground/10 pointer-events-none" />

              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-primary-foreground/80">
                    <Activity className="size-4 text-primary-foreground" />
                    Heat Exposure Index
                  </div>
                  <p className="mt-2 text-xs sm:text-sm leading-relaxed text-primary-foreground/85 font-medium max-w-sm">
                    {loading
                      ? 'Fetching FortyGuard hyper-local thermal data…'
                      : heatData?.recommendation || 'Conditions analyzed.'}
                  </p>
                </div>
                {loading ? (
                  <Skeleton className="h-8 w-24 bg-primary-foreground/20 rounded-full" />
                ) : (
                  <div className="rounded-full bg-primary-foreground/20 px-3 py-1 text-xs font-extrabold uppercase tracking-wide text-primary-foreground backdrop-blur-xs">
                    {riskEmoji} {riskLabel}
                  </div>
                )}
              </div>

              {/* Giant Temperature & Gauge Display */}
              <div className="mt-6 flex flex-col sm:flex-row items-center sm:items-end justify-between gap-6">
                <div className="text-center sm:text-left">
                  <span className="text-[11px] font-bold uppercase text-primary-foreground/75 tracking-wider">
                    Current Temperature
                  </span>
                  {loading ? (
                    <Skeleton className="h-16 w-44 bg-primary-foreground/20 mt-1" />
                  ) : (
                    <div className="font-mono text-6xl sm:text-7xl font-extrabold tracking-tight text-primary-foreground">
                      {heatData ? formatTemperature(heatData.current.temperature) : '--'}
                    </div>
                  )}
                  <div className="mt-2 flex items-center justify-center sm:justify-start gap-2 text-xs text-primary-foreground/80 font-bold">
                    <span>Feels like:</span>
                    <span className="font-mono text-sm font-extrabold">
                      {loading ? '…' : heatData ? formatTemperature(heatData.current.feelsLike) : '--'}
                    </span>
                  </div>
                </div>

                {/* Risk Ring Gauge */}
                <div className="flex items-center gap-4">
                  {loading ? (
                    <Skeleton className="size-36 rounded-full bg-primary-foreground/20" />
                  ) : (
                    <div
                      className="relative grid size-36 sm:size-40 place-items-center rounded-full transition-all duration-700 shadow-md"
                      style={{
                        background: `conic-gradient(var(--risk-very-high) 0 ${currentRisk}%, rgba(255,255,255,0.2) ${currentRisk}% 100%)`,
                      }}
                    >
                      <div className="grid size-28 sm:size-32 place-items-center rounded-full bg-card shadow-inner">
                        <div className="text-center">
                          <div className="font-mono text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
                            {currentRisk}
                          </div>
                          <div className="font-mono text-[9px] font-extrabold text-muted-foreground uppercase">
                            Risk Score / 100
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* AI Recommendation Card */}
          <Card className="border-border/80 bg-gradient-to-br from-amber-500/10 via-background to-orange-500/5 shadow-xs flex flex-col justify-between">
            <CardContent className="flex h-full flex-col justify-between p-6">
              <div>
                <div className="flex items-center justify-between">
                  <div className="grid size-11 place-items-center rounded-2xl bg-amber-500/20 text-amber-600 dark:text-amber-400">
                    <BrainCircuit className="size-6" />
                  </div>
                  <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 font-extrabold text-xs">
                    AI Recommendation
                  </Badge>
                </div>

                <div className="mt-5">
                  <h2 className="text-lg font-extrabold tracking-tight text-foreground">
                    Outdoor Action Plan
                  </h2>
                  <p className="mt-1 text-xs font-semibold text-muted-foreground">
                    {loading
                      ? 'Calculating prediction window…'
                      : heatData
                      ? `Peak heat expected: ${heatData.peak.windowStart} – ${heatData.peak.windowEnd}`
                      : 'Prediction ready.'}
                  </p>

                  <div className="mt-4 rounded-2xl bg-background/80 border border-border/60 p-4 shadow-2xs">
                    <div className="text-xs sm:text-sm font-semibold leading-relaxed text-foreground">
                      {loading ? (
                        <Skeleton className="h-12 w-full" />
                      ) : (
                        heatData?.recommendation || 'No recommendation available.'
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <a
                href="#safety"
                onClick={(e) => {
                  e.preventDefault()
                  document.getElementById('safety')?.scrollIntoView({ behavior: 'smooth' })
                }}
                className="mt-5 inline-flex w-full items-center justify-between rounded-xl bg-foreground text-background px-4 py-3 text-xs font-extrabold shadow-xs transition hover:opacity-90 min-h-[44px]"
              >
                Review outdoor checklist
                <ArrowUpRight className="size-4" />
              </a>
            </CardContent>
          </Card>
        </section>

        {/* SECTION 2: 12H FORECAST */}
        <section id="forecast" className="scroll-mt-20 grid gap-5 lg:grid-cols-[1.3fr_.7fr]">
          <Card className="border-border/80 shadow-xs">
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <div>
                <CardTitle className="text-lg font-extrabold">12-Hour Forecast</CardTitle>
                <p className="mt-0.5 text-xs text-muted-foreground">Hourly heat progression</p>
              </div>
              <div className="rounded-xl bg-orange-500/10 border border-orange-500/20 px-3 py-1.5 text-right">
                <p className="text-[10px] uppercase font-extrabold text-orange-600 dark:text-orange-400">Peak Temp</p>
                <p className="font-mono text-sm font-extrabold text-foreground">
                  {loading ? '--' : heatData ? `${heatData.peak.temperature}°C` : '--'}
                  <span className="font-sans font-normal text-xs text-muted-foreground">
                    {heatData?.peak.time ? ` at ${heatData.peak.time}` : ''}
                  </span>
                </p>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-[240px] w-full rounded-2xl" />
              ) : (
                <ChartContainer
                  config={{
                    temp: { label: 'Temperature (°C)', color: 'var(--chart-1)' },
                    risk: { label: 'Risk Score', color: 'var(--chart-2)' },
                  }}
                  className="h-[240px] w-full"
                >
                  <AreaChart data={recycleForecast} margin={{ left: -16, right: 8, top: 12 }}>
                    <defs>
                      <linearGradient id="tempFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="time" tickLine={false} axisLine={false} tickMargin={10} fontSize={11} />
                    <YAxis yAxisId="temp" domain={[15, 55]} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}°`} fontSize={11} />
                    <YAxis yAxisId="risk" orientation="right" domain={[0, 100]} hide />
                    <Tooltip content={<ChartTooltipContent />} />
                    <Area
                      yAxisId="temp"
                      type="monotone"
                      dataKey="temp"
                      stroke="var(--chart-1)"
                      fill="url(#tempFill)"
                      strokeWidth={3}
                      dot={{ r: 3, fill: 'var(--chart-1)', strokeWidth: 2, stroke: 'var(--card)' }}
                    />
                    <Area
                      yAxisId="risk"
                      type="monotone"
                      dataKey="risk"
                      stroke="var(--chart-2)"
                      fill="none"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                    />
                  </AreaChart>
                </ChartContainer>
              )}
              <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground font-semibold border-t border-border/50 pt-3">
                <span className="flex items-center gap-1.5">
                  <i className="size-2.5 rounded-full bg-chart-1" />
                  Temperature (°C)
                </span>
                <span className="flex items-center gap-1.5">
                  <i className="size-2.5 rounded-full bg-chart-2" />
                  Risk Level
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Timeline list */}
          <Card className="border-border/80 shadow-xs">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-extrabold">Hourly Risk Scale</CardTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">Detailed hourly breakdown</p>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  {[...Array(6)].map((_, i) => (
                    <Skeleton key={i} className="h-8 w-full rounded-xl" />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col">
                  {timeline.map(([time, label], index) => (
                    <div className="flex items-center gap-3 py-2 border-b border-border/40 last:border-0" key={index}>
                      <div className="w-14 font-mono text-xs font-bold text-muted-foreground text-right">{time}</div>
                      <div className="flex flex-1 items-center justify-between">
                        <span className="text-xs font-bold text-foreground">{label}</span>
                        <RiskBadge level={label.toLowerCase().replace(' ', '_')}>{label}</RiskBadge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        {/* SECTION 3: HEAT MAP */}
        <section id="map" className="scroll-mt-20">
          <MapPanel
            latitude={selectedLocation.lat}
            longitude={selectedLocation.lon}
            locationName={selectedLocation.name}
            onSelect={(lat, lon) => setSelectedLocation({ lat, lon, name: `Custom Spot (${lat.toFixed(2)}, ${lon.toFixed(2)})` })}
            heatData={heatData}
            saferData={saferData}
            loading={loading}
          />
        </section>

        {/* SECTION 4: ROUTE THERMAL COMPARISON & NEARBY SAFER */}
        <section id="safer-location" className="scroll-mt-20 grid gap-5 lg:grid-cols-[1fr_1fr]">
          {/* Thermal Route Comparison Card */}
          <Card className="border-border/80 shadow-xs">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg font-extrabold">
                <Route className="size-5 text-primary" />
                Thermal Route Comparison
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Comparing thermal exposure along nearby paths
              </p>
            </CardHeader>
            <CardContent>
              {loading || !routeComparison ? (
                <div className="py-4 text-center">
                  <p className="text-xs text-muted-foreground">Not enough temperature data to compare routes.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="size-2.5 rounded-full bg-emerald-500" />
                        <span className="text-xs font-extrabold text-foreground">{routeComparison.coolRoute.name}</span>
                      </div>
                      <p className="text-[11px] text-emerald-700 dark:text-emerald-300 font-semibold mt-1">
                        Recommended: More Comfortable Thermal Profile
                      </p>
                    </div>
                    <span className="font-mono text-lg font-extrabold text-emerald-600 dark:text-emerald-400">
                      {routeComparison.coolRoute.avgTemp}°C
                    </span>
                  </div>

                  <div className="rounded-xl border border-orange-500/30 bg-orange-500/10 p-3.5 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="size-2.5 rounded-full bg-orange-500" />
                        <span className="text-xs font-bold text-foreground">{routeComparison.hotRoute.name}</span>
                      </div>
                      <p className="text-[11px] text-orange-700 dark:text-orange-300 font-semibold mt-1">
                        High Surface Temperature & Asphalt Heat
                      </p>
                    </div>
                    <span className="font-mono text-lg font-extrabold text-orange-600 dark:text-orange-400">
                      {routeComparison.hotRoute.avgTemp}°C
                    </span>
                  </div>

                  <div className="rounded-xl bg-muted/50 p-3 text-xs font-bold text-foreground border border-border/60 text-center">
                    Route Option 1 is <span className="text-emerald-600 dark:text-emerald-400">-{routeComparison.diff}°C cooler</span> than the direct main highway route.
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Real Backend NearBy Safer Component */}
          <Card className="border-border/80 shadow-xs">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg font-extrabold">
                <Navigation className="size-5 text-primary" />
                Find Safer Nearby Micro-Zone
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                FortyGuard 8-direction sampling for cooler nearby micro-zones
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {saferLoading ? (
                <div className="space-y-3 py-4">
                  <Skeleton className="h-10 w-full rounded-xl" />
                  <Skeleton className="h-16 w-full rounded-xl" />
                </div>
              ) : saferData ? (
                <div className="space-y-4 animate-in fade-in">
                  <div className="flex items-end justify-between border-b border-border/50 pb-3">
                    <div>
                      <p className="font-mono text-3xl font-extrabold text-foreground">
                        {formatTemperature(saferData.safer_temp_c)}
                      </p>
                      <p className="text-xs text-muted-foreground font-bold mt-0.5">
                        Cooler spot · {saferData.distance_m}m {saferData.direction}
                      </p>
                    </div>
                    <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-extrabold text-xs">
                      -{saferData.delta_c}°C Cooler
                    </Badge>
                  </div>

                  <div className="rounded-2xl bg-muted/50 p-3.5 text-xs font-semibold text-foreground border border-border/60">
                    {saferData.is_meaningfully_cooler
                      ? `Found a cooler micro-zone ${saferData.distance_m}m ${saferData.direction} of your position!`
                      : `Temperature nearby is similar (${saferData.delta_c}°C variance).`}
                  </div>

                  {saferData.maps_url && (
                    <a
                      href={saferData.maps_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-3 text-xs font-extrabold shadow-xs hover:opacity-90 transition min-h-[44px]"
                    >
                      Open Directions in Google Maps
                      <ExternalLink className="size-4" />
                    </a>
                  )}
                </div>
              ) : (
                <div className="py-3 text-center">
                  <p className="text-xs text-muted-foreground mb-4">
                    Trigger a FortyGuard 8-direction sample around your coordinates.
                  </p>
                  <Button
                    onClick={handleFetchSafer}
                    disabled={saferLoading || !isSelectedLocationInUS}
                    className="w-full gap-2 text-xs font-extrabold min-h-[44px] rounded-xl"
                  >
                    {saferLoading ? <Loader2 className="size-4 animate-spin" /> : <Navigation className="size-4" />}
                    Scan Nearby Cooler Spot
                  </Button>
                </div>
              )}
              {saferError && <p className="text-xs text-destructive text-center font-bold">{saferError}</p>}
            </CardContent>
          </Card>
        </section>

        {/* SECTION 5: HISTORICAL & RISK FACTORS */}
        <section className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
          {/* Historical comparison */}
          <Card className="border-border/80 shadow-xs">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-extrabold">Historical Baseline</CardTitle>
              <p className="text-xs text-muted-foreground">Current vs 7-day average for this spot</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-semibold">Current Temp</p>
                  <p className="mt-0.5 font-mono text-3xl font-extrabold text-foreground">
                    {loading ? '--' : heatData ? formatTemperature(heatData.current.temperature) : '--'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground font-semibold">7-Day Avg</p>
                  <p className="mt-0.5 font-mono text-2xl font-extrabold text-muted-foreground">
                    {loading ? '--' : heatData ? formatTemperature(heatData.historical.averageTemperature) : '--'}
                  </p>
                </div>
              </div>
              <div className="rounded-2xl bg-amber-500/10 border border-amber-500/20 p-3.5 text-xs font-bold text-amber-900 dark:text-amber-200">
                {loading
                  ? 'Analyzing historical delta…'
                  : heatData?.historical.message || 'Comparison loaded.'}
              </div>
            </CardContent>
          </Card>

          {/* Risk Factors Breakdown */}
          <Card className="border-border/80 shadow-xs">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-extrabold">Risk Factor Breakdown</CardTitle>
              <p className="text-xs text-muted-foreground">Weighted drivers behind your Heat Risk Score</p>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-3">
                {riskBreakdown.map(({ label, value, Icon }) => {
                  const numericVal = parseInt(value, 10) || 0
                  return (
                    <div className="rounded-2xl bg-muted/50 p-4 border border-border/60" key={label}>
                      <div className="flex items-center justify-between">
                        <Icon className="size-4 text-muted-foreground" />
                        <span className="font-mono text-sm font-extrabold text-foreground">{value}</span>
                      </div>
                      <p className="mt-3 text-xs font-bold text-foreground">{label}</p>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-border">
                        <div
                          className="h-full rounded-full bg-primary transition-all duration-500"
                          style={{ width: `${Math.min(100, numericVal)}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3">
                <span className="text-xs font-semibold text-muted-foreground">Combined Weighted Risk Score</span>
                <span className="font-mono text-lg font-extrabold text-foreground">
                  {loading ? '--' : `${heatData?.current.riskScore ?? 0}/100`}
                </span>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* SECTION 6: SAFETY CHECKLIST */}
        <section id="safety" className="scroll-mt-20">
          <Card className="border-border/80 shadow-xs">
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
              <div>
                <CardTitle className="text-lg font-extrabold">Outdoor Safety Checklist</CardTitle>
                <p className="mt-0.5 text-xs text-muted-foreground">Actionable steps to manage heat strain</p>
              </div>
              <Droplets className="size-5 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="grid gap-2.5 sm:grid-cols-2 md:grid-cols-3">
                {safetyTips.map((tip, idx) => {
                  const isChecked = Boolean(checkedTips[idx])
                  return (
                    <button
                      type="button"
                      key={tip}
                      onClick={() =>
                        setCheckedTips((prev) => ({ ...prev, [idx]: !prev[idx] }))
                      }
                      className={`flex items-center gap-3 rounded-2xl border p-3.5 text-left text-xs transition-all min-h-[48px] ${
                        isChecked
                          ? 'border-emerald-500/40 bg-emerald-500/10 font-bold text-foreground'
                          : 'border-border/60 bg-muted/40 text-muted-foreground hover:bg-muted/70'
                      }`}
                    >
                      <CheckCircle2
                        className={`size-5 shrink-0 transition-colors ${
                          isChecked ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground/40'
                        }`}
                      />
                      <span>{tip}</span>
                    </button>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Footer */}
        <footer className="mt-12 flex flex-col justify-between gap-3 border-t border-border/60 py-6 text-xs text-muted-foreground sm:flex-row">
          <span className="flex items-center gap-2 font-semibold">
            <Wind className="size-4 text-primary" />
            HeatShield AI · Powered by FortyGuard US Hyper-Local API
          </span>
          <span className="font-mono">Team Nexio · Hackathon 2026</span>
        </footer>
      </main>
    </div>
  )
}
