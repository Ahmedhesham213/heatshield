import axios from 'axios'

const baseURL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

const client = axios.create({
  baseURL,
  timeout: 15000,
  headers: {
    Accept: 'application/json',
  },
})

type HeatRiskApiLocation = {
  lat?: number
  lon?: number
}

type HeatRiskApiRiskFactors = {
  temperature?: number
  historical_gap?: number
  heat_duration?: number
}

type HeatRiskApiHistorical = {
  averageTemperature?: number
  isUnusual?: boolean
  diff?: number
  message?: string
}

type HeatRiskApiPeak = {
  peak_temp?: number
  peak_time?: string
  window_start?: string
  window_end?: string
}

type HeatRiskApiForecastItem = {
  hour_offset?: number
  time?: string
  temp_c?: number
  level?: string
  emoji?: string
  label?: string
}

type HeatRiskApiResponse = {
  location?: HeatRiskApiLocation
  current_temp_c?: number
  feels_like_c?: number
  risk_score?: number
  risk_level?: string
  risk_label?: string
  risk_emoji?: string
  risk_factors?: HeatRiskApiRiskFactors
  historical_avg_c?: number
  vs_historical?: HeatRiskApiHistorical
  peak_next_12h?: HeatRiskApiPeak
  forecast_12h?: HeatRiskApiForecastItem[]
  ai_recommendation?: string
}

export type HeatRiskResponse = {
  location: {
    lat: number
    lon: number
  }
  current: {
    temperature: number
    feelsLike: number
    riskScore: number
    riskLevel: string
    riskLabel: string
    riskEmoji: string
  }
  riskFactors: {
    temperature: number
    historicalGap: number
    heatDuration: number
  }
  historical: {
    averageTemperature: number
    isUnusual: boolean
    difference: number
    message: string
  }
  peak: {
    temperature: number
    time: string
    windowStart: string
    windowEnd: string
  }
  forecast: Array<{
    hourOffset: number
    time: string
    temperature: number
    level: string
    emoji: string
    label: string
  }>
  recommendation: string
}

function toNumber(value: number | string | undefined, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function toStringOrDefault(value: string | undefined, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback
}

function mapHeatRiskData(data: HeatRiskApiResponse, fallbackLat: number, fallbackLon: number): HeatRiskResponse {
  const location = data.location ?? { lat: fallbackLat, lon: fallbackLon }

  return {
    location: {
      lat: toNumber(location.lat, fallbackLat),
      lon: toNumber(location.lon, fallbackLon),
    },
    current: {
      temperature: toNumber(data.current_temp_c, 0),
      feelsLike: toNumber(data.feels_like_c, 0),
      riskScore: toNumber(data.risk_score, 0),
      riskLevel: toStringOrDefault(data.risk_level, 'unknown'),
      riskLabel: toStringOrDefault(data.risk_label, 'Unknown'),
      riskEmoji: toStringOrDefault(data.risk_emoji, '—'),
    },
    riskFactors: {
      temperature: toNumber(data.risk_factors?.temperature, 0),
      historicalGap: toNumber(data.risk_factors?.historical_gap, 0),
      heatDuration: toNumber(data.risk_factors?.heat_duration, 0),
    },
    historical: {
      averageTemperature: toNumber(data.historical_avg_c, 0),
      isUnusual: Boolean(data.vs_historical?.isUnusual),
      difference: toNumber(data.vs_historical?.diff, 0),
      message: toStringOrDefault(data.vs_historical?.message, 'No historical comparison available.'),
    },
    peak: {
      temperature: toNumber(data.peak_next_12h?.peak_temp, 0),
      time: toStringOrDefault(data.peak_next_12h?.peak_time, '--:--'),
      windowStart: toStringOrDefault(data.peak_next_12h?.window_start, '--:--'),
      windowEnd: toStringOrDefault(data.peak_next_12h?.window_end, '--:--'),
    },
    forecast: Array.isArray(data.forecast_12h)
      ? data.forecast_12h.map((item) => ({
          hourOffset: toNumber(item.hour_offset, 0),
          time: toStringOrDefault(item.time, '--:--'),
          temperature: toNumber(item.temp_c, 0),
          level: toStringOrDefault(item.level, 'unknown'),
          emoji: toStringOrDefault(item.emoji, '—'),
          label: toStringOrDefault(item.label, 'Unknown'),
        }))
      : [],
    recommendation: toStringOrDefault(data.ai_recommendation, 'No recommendation available.'),
  }
}

export async function getHeatRisk(lat: number, lon: number): Promise<HeatRiskResponse> {
  const { data } = await client.get<HeatRiskApiResponse>('/api/heat-risk', {
    params: {
      lat,
      lon,
    },
  })

  return mapHeatRiskData(data, lat, lon)
}

export async function getCoolerRoutes(
  origin: { lat: number; lon: number },
  destination: { lat: number; lon: number },
) {
  return [
    {
      id: 'coolest',
      label: 'Coolest route',
      durationMinutes: 24,
      distanceKm: 4.8,
      averageTemperature: 36.4,
      maxExposure: 61,
      recommended: true,
    },
    {
      id: 'fastest',
      label: 'Fastest route',
      durationMinutes: 22,
      distanceKm: 4.2,
      averageTemperature: 40.2,
      maxExposure: 84,
      recommended: false,
    },
  ]
}