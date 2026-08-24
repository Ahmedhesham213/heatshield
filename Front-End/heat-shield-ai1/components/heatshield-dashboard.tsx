'use client'

import dynamic from 'next/dynamic'
import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BrainCircuit,
  ChevronDown,
  Crosshair,
  Droplets,
  MapPin,
  Menu,
  Navigation,
  ShieldCheck,
  Sun,
  Thermometer,
  Wind,
  X,
} from 'lucide-react'
import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts'
import ThemeToggle from '@/components/theme-toggle'
import { useGeolocation } from '@/hooks/use-geolocation'
import { getHeatRisk, type HeatRiskResponse } from '@/services/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltipContent } from '@/components/ui/chart'

const HeatMap = dynamic(() => import('@/components/heat-map').then((module) => module.HeatMap), { ssr: false })

const DEFAULT_LOCATION = { lat: 30.0444, lon: 31.2357 }

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
      return 0
  }
}

function formatTemperature(value: number | undefined, digits = 1): string {
  return `${(value ?? 0).toFixed(digits)}°C`
}

function RiskBadge({ level, children }: { level: string; children: React.ReactNode }) {
  return <Badge className={`border-0 ${riskClassMap[level.toLowerCase()] ?? 'risk-moderate'}`}>{children}</Badge>
}

function MapPanel({ latitude, longitude, onSelect, heatData }: { latitude: number; longitude: number; onSelect: (latitude: number, longitude: number) => void; heatData: HeatRiskResponse | null }) {
  const summary = heatData?.current
  const peak = heatData?.peak
  const score = summary?.riskScore ?? 0
  const level = summary?.riskLevel ?? 'unknown'

  return (
    <Card className="overflow-hidden border-border/80 shadow-sm">
      <CardHeader className="flex-row items-start justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="text-lg">Heat risk map</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">Live conditions across your area</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => window.dispatchEvent(new Event('heatshield-recenter'))}>
          <Crosshair className="mr-2 size-4" />
          Recenter
        </Button>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-[1fr_220px]">
        <div className="relative min-h-[300px] overflow-hidden rounded-xl border border-border/60" aria-label="Live map showing your current location">
          <HeatMap latitude={latitude} longitude={longitude} onSelect={onSelect} />
        </div>
        <div className="rounded-xl bg-muted/55 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Current location</p>
              <p className="mt-1 text-xs text-muted-foreground">Selected location</p>
            </div>
            <RiskBadge level={level}>{summary?.riskLabel ?? 'Loading...'}</RiskBadge>
          </div>
          <div className="my-5 flex items-end gap-2">
            <span className="font-mono text-3xl font-semibold">{summary ? formatTemperature(summary.temperature) : '--'}</span>
            <span className="pb-1 text-xs text-muted-foreground">current</span>
          </div>
          <div className="grid grid-cols-2 gap-3 border-y border-border/70 py-3 text-xs">
            <div>
              <p className="text-muted-foreground">Risk score</p>
              <p className="mt-1 font-mono font-semibold">{score}/100</p>
            </div>
            <div>
              <p className="text-muted-foreground">Peak today</p>
              <p className="mt-1 font-mono font-semibold">{peak ? `${peak.temperature}°C · ${peak.time}` : 'Loading...'}</p>
            </div>
          </div>
          <Button className="mt-4 w-full" variant="outline">
            <Navigation className="mr-2 size-4" />
            Find safer nearby
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export function HeatShieldDashboard() {
  const [mobileNav, setMobileNav] = useState(false)
  const geo = useGeolocation(DEFAULT_LOCATION.lat, DEFAULT_LOCATION.lon)
  const [selectedLocation, setSelectedLocation] = useState(DEFAULT_LOCATION)
  const [heatData, setHeatData] = useState<HeatRiskResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setSelectedLocation({ lat: geo.latitude, lon: geo.longitude })
  }, [geo.latitude, geo.longitude])

  useEffect(() => {
    let isCancelled = false

    setLoading(true)
    setError(null)

    getHeatRisk(selectedLocation.lat, selectedLocation.lon)
      .then((data) => {
        if (!isCancelled) {
          setHeatData(data)
        }
      })
      .catch((err: unknown) => {
        if (!isCancelled) {
          console.error('HeatRisk request failed', err)
          setHeatData(null)
          setError('Unable to load heat data. Please make sure the HeatShield backend is running.')
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setLoading(false)
        }
      })

    return () => {
      isCancelled = true
    }
  }, [selectedLocation.lat, selectedLocation.lon])

  const riskLevel = heatData?.current.riskLevel ?? 'unknown'
  const riskLabel = heatData?.current.riskLabel ?? 'Loading...'
  const riskEmoji = heatData?.current.riskEmoji ?? '—'
  const currentRisk = heatData?.current.riskScore ?? 0

  const locationAlert = useMemo(() => {
    if (!heatData || heatData.current.riskScore < 70) {
      return null
    }

    return {
      level: heatData.current.riskLevel,
      label: heatData.current.riskLabel,
      score: heatData.current.riskScore,
      message: heatData.recommendation,
    }
  }, [heatData])

  const handleSectionClick = (event: React.MouseEvent<HTMLAnchorElement>, sectionId: string) => {
    event.preventDefault()
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

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

    return heatData.forecast.slice(0, 7).map((item) => [item.time, item.label, riskClassMap[item.level.toLowerCase()] ?? 'risk-moderate']) as Array<[string, string, string]>
  }, [heatData])

  const riskBreakdown = [
    { label: 'Temperature', value: `${Math.round(heatData?.riskFactors.temperature ?? 0)}/100`, Icon: Thermometer },
    { label: 'Historical gap', value: `${Math.round(heatData?.riskFactors.historicalGap ?? 0)}/100`, Icon: Activity },
    { label: 'Heat duration', value: `${Math.round(heatData?.riskFactors.heatDuration ?? 0)}/100`, Icon: Sun },
  ]

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border/70 bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <a href="#top" className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">
              <ShieldCheck className="size-5" />
            </span>
            <span className="text-lg font-semibold tracking-tight">HeatShield</span>
          </a>

          <nav className={`${mobileNav ? 'absolute left-0 right-0 top-16 flex border-b border-border bg-background p-4 shadow-lg' : 'hidden'} flex-col gap-1 md:static md:flex md:flex-row md:items-center md:border-0 md:bg-transparent md:p-0 md:shadow-none`}>
            <a className="rounded-lg px-3 py-2 text-sm font-medium text-foreground md:bg-muted" href="#dashboard" onClick={(event) => handleSectionClick(event, 'dashboard')}>Dashboard</a>
            <a className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground" href="#map" onClick={(event) => handleSectionClick(event, 'map')}>Heat map</a>
            <a className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground" href="#forecast" onClick={(event) => handleSectionClick(event, 'forecast')}>Forecast</a>
            <a className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground" href="#safety" onClick={(event) => handleSectionClick(event, 'safety')}>Safety</a>
          </nav>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="hidden sm:flex">
              <MapPin className="mr-2 size-4" />
              New York City, USA
              <ChevronDown className="ml-1 size-4" />
            </Button>
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileNav((prev) => !prev)} aria-label="Toggle navigation">
              {mobileNav ? <X className="size-4" /> : <Menu className="size-4" />}
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main id="top" className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="mb-2 font-mono text-xs font-medium uppercase tracking-[0.18em] text-primary">Live local data</p>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Good morning.</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">Don&apos;t just know the temperature. Know the risk. Know what to do.</p>
          </div>
          <Button variant="outline" onClick={geo.requestLocation}>
            <Crosshair className="mr-2 size-4" />
            Use my location
          </Button>
        </div>

        {geo.error && <p className="mb-4 text-sm text-destructive" role="alert">{geo.error}</p>}
        {error && !loading && <p className="mb-4 text-sm text-destructive" role="alert">{error}</p>}

        {locationAlert && (
          <div className="mb-5 overflow-hidden rounded-2xl border border-amber-500/40 bg-amber-500/10 text-amber-950 shadow-sm dark:text-amber-50" role="alert" aria-live="assertive">
            <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 grid size-9 place-items-center rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-200">
                  <AlertTriangle className="size-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-800 dark:text-amber-100">Heat alert</p>
                  <p className="mt-1 text-base font-medium text-amber-900 dark:text-amber-50">
                    Your area is currently at {locationAlert.score}/100 risk ({locationAlert.label}).
                  </p>
                </div>
              </div>
              <a
                href="#safety"
                className="inline-flex items-center justify-center rounded-lg border border-amber-700/30 bg-background/20 px-3 py-2 text-sm font-medium text-amber-900 transition hover:bg-background/30 dark:text-amber-50"
                onClick={(event) => handleSectionClick(event, 'safety')}
              >
                Safety tips
              </a>
            </div>
          </div>
        )}

        <section id="dashboard" className="scroll-mt-24 grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
          <Card className="overflow-hidden border-0 bg-primary text-primary-foreground shadow-lg">
            <CardContent className="relative flex min-h-[340px] flex-col justify-between p-6 sm:p-8">
              <div className="absolute -right-24 -top-24 size-72 rounded-full border border-primary-foreground/10" />
              <div className="absolute -right-10 -top-10 size-44 rounded-full border border-primary-foreground/10" />
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 text-sm text-primary-foreground/70">
                    <Activity className="size-4" />
                    Current heat risk
                  </div>
                  <p className="mt-3 max-w-sm text-sm leading-6 text-primary-foreground/70">
                    {loading ? 'Loading current heat conditions...' : heatData ? heatData.recommendation : 'Heat exposure is currently above the safe level.'}
                  </p>
                </div>
                <div className="rounded-full bg-primary-foreground/10 px-2 py-1 text-xs font-medium uppercase tracking-wide text-primary-foreground/80">
                  {riskEmoji} {riskLabel}
                </div>
              </div>

              <div className="mt-6 flex items-end justify-between gap-6">
                <div>
                  <div className="font-mono text-5xl font-semibold tracking-tight">
                    {loading && !heatData ? '--' : heatData ? formatTemperature(heatData.current.temperature) : '--'}
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-sm text-primary-foreground/75">
                    <span>Feels like</span>
                    <span className="font-mono font-medium">
                      {loading && !heatData ? '--' : heatData ? formatTemperature(heatData.current.feelsLike) : '--'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="relative grid size-44 place-items-center rounded-full" style={{ background: `conic-gradient(var(--risk-very-high) 0 ${currentRisk}%, var(--surface-muted) ${currentRisk}% 100%)` }}>
                    <div className="grid size-36 place-items-center rounded-full bg-card">
                      <div className="text-center">
                        <div className="font-mono text-5xl font-semibold tracking-tight text-foreground">{loading && !heatData ? '--' : currentRisk}</div>
                        <div className="font-mono text-xs text-muted-foreground">/ 100</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/80 bg-[linear-gradient(135deg,oklch(0.97_0.035_85),oklch(0.99_0.015_70))] shadow-sm">
            <CardContent className="flex h-full flex-col justify-between p-6 sm:p-8">
              <div className="flex items-start justify-between">
                <div className="grid size-11 place-items-center rounded-xl bg-[#f0b44d]/20 text-[#9a5d0a]">
                  <BrainCircuit className="size-6" />
                </div>
                <Badge variant="outline" className="border-[#e1bd79] bg-background/50 text-[#8a5c12]">AI powered</Badge>
              </div>
              <div className="mt-7">
                <h2 className="text-xl font-semibold tracking-tight">AI safety recommendation</h2>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  {heatData ? `${heatData.current.riskLabel} risk is expected between ${heatData.peak.windowStart} and ${heatData.peak.windowEnd}.` : 'Gathering the latest prediction...'}
                </p>
                <p className="mt-3 text-sm leading-6 text-foreground">
                  {loading && !heatData ? 'Loading recommendation...' : heatData ? heatData.recommendation : 'No recommendation yet.'}
                </p>
              </div>
              <Button className="mt-6 w-full justify-between bg-foreground text-background hover:bg-foreground/90">
                View safety tips
                <ArrowUpRight className="size-4" />
              </Button>
            </CardContent>
          </Card>
        </section>

        <section id="forecast" className="scroll-mt-24 mt-5 grid gap-5 lg:grid-cols-[1.3fr_.7fr]">
          <Card className="border-border/80 shadow-sm">
            <CardHeader className="flex-row items-start justify-between space-y-0">
              <div>
                <CardTitle className="text-lg">12-hour heat forecast</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">Temperature and heat risk, hour by hour</p>
              </div>
              <div className="rounded-lg bg-risk-extreme/10 px-3 py-2 text-right">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Peak</p>
                <p className="font-mono text-sm font-semibold text-foreground">
                  {loading && !heatData ? '--' : heatData ? `${heatData.peak.temperature}°C` : '--'}
                  <span className="font-sans font-normal text-muted-foreground"> {heatData ? `at ${heatData.peak.time}` : ''}</span>
                </p>
              </div>
            </CardHeader>
            <CardContent>
              <ChartContainer config={{ temp: { label: 'Temperature', color: 'var(--chart-1)' }, risk: { label: 'Heat risk', color: 'var(--chart-2)' } }} className="h-[250px] w-full">
                <AreaChart data={recycleForecast.length ? recycleForecast : [{ time: 'Loading...', temp: 0, risk: 0 }]} margin={{ left: -16, right: 8, top: 12 }}>
                  <defs>
                    <linearGradient id="tempFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.22} />
                      <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="time" tickLine={false} axisLine={false} tickMargin={10} fontSize={11} />
                  <YAxis yAxisId="temp" domain={[0, 60]} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}°`} fontSize={11} />
                  <YAxis yAxisId="risk" orientation="right" domain={[0, 100]} hide />
                  <Tooltip content={<ChartTooltipContent />} />
                  <Area yAxisId="temp" type="monotone" dataKey="temp" stroke="var(--chart-1)" fill="url(#tempFill)" strokeWidth={3} dot={{ r: 3, fill: 'var(--chart-1)', strokeWidth: 2, stroke: 'var(--card)' }} />
                  <Area yAxisId="risk" type="monotone" dataKey="risk" stroke="var(--chart-2)" fill="none" strokeWidth={2} strokeDasharray="5 5" />
                </AreaChart>
              </ChartContainer>
              <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-2"><i className="size-2 rounded-full bg-chart-1" />Temperature</span>
                <span className="flex items-center gap-2"><i className="size-2 rounded-full bg-chart-2" />Heat risk</span>
                <span className="ml-auto font-medium text-risk-extreme">Peak exposure window highlighted</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/80 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Risk timeline</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">Plan around the heat</p>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-0">
                {timeline.length ? timeline.map(([time, label, color], index) => (
                  <div className="flex items-center gap-3" key={`${time}-${index}`}>
                    <div className="flex w-14 shrink-0 justify-end font-mono text-[11px] text-muted-foreground">{time}</div>
                    <div className="relative flex flex-1 items-center gap-3 py-2.5">
                      <span className={`relative z-10 size-3 rounded-full border-2 border-card shadow-sm ${color}`} />
                      {index < timeline.length - 1 && <span className="absolute left-[5px] top-6 h-7 w-px bg-border" />}
                      <span className="text-sm font-medium">{label}</span>
                    </div>
                  </div>
                )) : <div className="text-sm text-muted-foreground">Loading forecast...</div>}
              </div>
            </CardContent>
          </Card>
        </section>

        <section id="map" className="scroll-mt-24 mt-5">
          <MapPanel latitude={selectedLocation.lat} longitude={selectedLocation.lon} onSelect={(lat, lon) => setSelectedLocation({ lat, lon })} heatData={heatData} />
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
          <Card className="border-border/80 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg"><Navigation className="size-5 text-primary" />Safer location found</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end justify-between">
                <div>
                  <p className="font-mono text-4xl font-semibold">{heatData ? formatTemperature(heatData.current.temperature - 5) : '--'}</p>
                  <p className="mt-1 text-sm text-muted-foreground">Park · 320m away</p>
                </div>
                <RiskBadge level={riskLevel}>{riskLabel}</RiskBadge>
              </div>
              <div className="mt-5 rounded-lg bg-risk-moderate/10 p-3 text-sm font-medium text-foreground">
                {heatData ? `${(heatData.current.temperature - heatData.historical.averageTemperature).toFixed(1)}°C cooler than your current location` : 'Loading nearby cooler option...'}
              </div>
              <Button className="mt-4 w-full">Navigate there <ArrowUpRight className="ml-2 size-4" /></Button>
            </CardContent>
          </Card>

          <Card className="border-border/80 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Why is risk high?</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">The factors driving your current score</p>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-3">
                {riskBreakdown.map(({ label, value, Icon }) => (
                  <div className="rounded-xl bg-muted/55 p-4" key={label}>
                    <Icon className="size-4 text-muted-foreground" />
                    <p className="mt-4 text-xs text-muted-foreground">{label}</p>
                    <p className="mt-1 font-mono text-lg font-semibold">{value}</p>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-border">
                      <div className="h-full rounded-full bg-risk-very-high" style={{ width: `${Math.min(100, Number.parseInt(value, 10) || 0)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
                <span className="text-sm text-muted-foreground">Overall heat risk score</span>
                <span className="font-mono text-xl font-semibold">{heatData ? `${heatData.current.riskScore}/100` : 'Loading...'}</span>
              </div>
            </CardContent>
          </Card>
        </section>

        <section id="safety" className="scroll-mt-24 mt-5 grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
          <Card className="border-border/80 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Historical comparison</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-8">
                <div>
                  <p className="text-xs text-muted-foreground">Current</p>
                  <p className="mt-1 font-mono text-3xl font-semibold">{heatData ? formatTemperature(heatData.current.temperature) : '--'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Avg. today</p>
                  <p className="mt-1 font-mono text-2xl font-semibold text-muted-foreground">{heatData ? formatTemperature(heatData.historical.averageTemperature) : '--'}</p>
                </div>
              </div>
              <div className="mt-5 rounded-lg bg-risk-high/10 p-3 text-sm font-medium">
                {heatData ? `${heatData.historical.difference.toFixed(1)}°C ${heatData.historical.isUnusual ? 'hotter than normal' : 'within normal range'}` : 'Loading comparison...'}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/80 shadow-sm">
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-lg">Safety checklist</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">Simple actions that reduce heat exposure</p>
              </div>
              <Droplets className="size-5 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                {['Stay hydrated', 'Avoid prolonged direct sunlight', 'Take breaks in shaded areas', 'Avoid strenuous activity at peak heat', 'Wear lightweight clothing', 'Check on vulnerable people'].map((tip) => (
                  <div className="flex items-center gap-2 text-sm" key={tip}>
                    <span className="grid size-5 shrink-0 place-items-center rounded-full bg-risk-moderate/15 text-risk-moderate"><ShieldCheck className="size-3" /></span>
                    {tip}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>

        <footer className="mt-8 flex flex-col justify-between gap-3 border-t border-border py-6 text-xs text-muted-foreground sm:flex-row">
          <span className="flex items-center gap-2"><Wind className="size-3.5" />Powered by high-resolution local data</span>
          <span>HeatShield · Stay aware.</span>
        </footer>
      </main>
    </div>
  )
}
