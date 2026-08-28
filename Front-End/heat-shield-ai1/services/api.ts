import axios from 'axios'

const baseURL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

const client = axios.create({
  baseURL,
  timeout: 15000,
  headers: {
    Accept: 'application/json',
  },
})

export function isUSLocation(lat: number, lon: number): boolean {
  // Contiguous US
  if (lat >= 24.0 && lat <= 50.0 && lon >= -125.0 && lon <= -66.0) return true
  // Alaska
  if (lat >= 51.0 && lat <= 72.0 && lon >= -180.0 && lon <= -129.0) return true
  // Hawaii
  if (lat >= 18.0 && lat <= 29.0 && lon >= -180.0 && lon <= -154.0) return true
  // Puerto Rico / US Virgin Islands
  if (lat >= 17.5 && lat <= 18.6 && lon >= -67.5 && lon <= -64.5) return true
  return false
}

export type AuthUser = {
  id: number
  name: string
  email: string
  initials: string
}

export type AuthResponse = {
  token: string
  user: AuthUser
}

export type SavedLocation = {
  id: number
  name: string
  lat: number
  lon: number
  created_at: string
}

// ── AUTH APIS ──────────────────────────────────────────────────────
export async function registerApi(name: string, email: string, password: string): Promise<AuthResponse> {
  const { data } = await client.post<AuthResponse>('/api/auth/register', { name, email, password })
  return data
}

export async function loginApi(email: string, password: string): Promise<AuthResponse> {
  const { data } = await client.post<AuthResponse>('/api/auth/login', { email, password })
  return data
}

export async function getMeApi(token: string): Promise<AuthUser> {
  const { data } = await client.get<{ user: AuthUser }>('/api/auth/me', {
    headers: { Authorization: `Bearer ${token}` },
  })
  return data.user
}

export async function logoutApi(token: string): Promise<void> {
  await client.post('/api/auth/logout', {}, {
    headers: { Authorization: `Bearer ${token}` },
  })
}

// ── SAVED LOCATIONS APIS ───────────────────────────────────────────
export async function getSavedLocationsApi(token: string): Promise<SavedLocation[]> {
  const { data } = await client.get<SavedLocation[]>('/api/user/saved-locations', {
    headers: { Authorization: `Bearer ${token}` },
  })
  return data
}

export async function addSavedLocationApi(token: string, name: string, lat: number, lon: number): Promise<SavedLocation> {
  const { data } = await client.post<SavedLocation>('/api/user/saved-locations', { name, lat, lon }, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return data
}

export async function deleteSavedLocationApi(token: string, locationId: number): Promise<void> {
  await client.delete(`/api/user/saved-locations/${locationId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
}

// ── HEAT RISK TYPES & APIS ─────────────────────────────────────────

// Raw API response types (snake_case from backend)
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
  historical_average?: number
  is_unusual?: boolean
  isUnusual?: boolean
  diff?: number
  message?: string
  anomaly_description?: string
}

type HeatRiskApiPeak = {
  peak_temp?: number
  peak_time?: string
  window_start?: string
  window_end?: string
  duration_hours?: number
  peak_risk_level?: string
}

type HeatRiskApiExplainability = {
  model_version?: string
  confidence?: number
  top_drivers?: string[]
  factor_contributions?: {
    thermal?: number
    anomaly?: number
    persistence?: number
  }
  data_quality?: string
}

type HeatRiskApiPersistenceDetail = {
  high_risk_hours?: number
  very_high_risk_hours?: number
  extreme_hours?: number
  longest_continuous_high_risk_hours?: number
}

type HeatRiskApiForecastItem = {
  hour_offset?: number
  time?: string
  temp_c?: number
  level?: string
  emoji?: string
  label?: string
  risk_score?: number
  thermal_score?: number
}

type HeatRiskApiResponse = {
  location?: HeatRiskApiLocation
  current_temp_c?: number
  current_temp_f?: number
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
  // New backend fields (heatshield-risk-v1)
  explainability?: HeatRiskApiExplainability
  persistence_detail?: HeatRiskApiPersistenceDetail
  data_source?: string
}

// ── PUBLIC TYPES (camelCase for frontend) ──────────────────────────

export type HeatExplainability = {
  modelVersion: string
  confidence: number
  topDrivers: string[]
  factorContributions: {
    thermal: number
    anomaly: number
    persistence: number
  }
  dataQuality: string
}

export type HeatPersistenceDetail = {
  highRiskHours: number
  veryHighRiskHours: number
  extremeHours: number
  longestContinuousHighRiskHours: number
}

export type HeatRiskResponse = {
  location: {
    lat: number
    lon: number
  }
  current: {
    temperature: number
    temperatureF: number
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
    durationHours: number
    peakRiskLevel: string
  }
  forecast: Array<{
    hourOffset: number
    time: string
    temperature: number
    level: string
    emoji: string
    label: string
    riskScore: number
    thermalScore: number
  }>
  recommendation: string
  // New fields from heatshield-risk-v1
  explainability: HeatExplainability
  persistenceDetail: HeatPersistenceDetail
  dataSource: 'FORTYGUARD_LIVE' | 'MOCK_DETERMINISTIC' | 'UNKNOWN'
}

export type NearbySaferResponse = {
  base_temp_c: number
  safer_temp_c: number
  delta_c: number
  distance_m: number
  direction: string
  lat: number
  lon: number
  is_meaningfully_cooler: boolean
  maps_url: string
}

// ── HELPER FUNCTIONS ───────────────────────────────────────────────

function toNumber(value: number | string | undefined, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function toStringOrDefault(value: string | undefined, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback
}

function mapExplainability(raw?: HeatRiskApiExplainability): HeatExplainability {
  return {
    modelVersion: toStringOrDefault(raw?.model_version, 'heatshield-risk-v1'),
    confidence: toNumber(raw?.confidence, 85),
    topDrivers: Array.isArray(raw?.top_drivers) ? raw!.top_drivers : [],
    factorContributions: {
      thermal: toNumber(raw?.factor_contributions?.thermal, 0),
      anomaly: toNumber(raw?.factor_contributions?.anomaly, 0),
      persistence: toNumber(raw?.factor_contributions?.persistence, 0),
    },
    dataQuality: toStringOrDefault(raw?.data_quality, 'standard'),
  }
}

function mapPersistenceDetail(raw?: HeatRiskApiPersistenceDetail): HeatPersistenceDetail {
  return {
    highRiskHours: toNumber(raw?.high_risk_hours, 0),
    veryHighRiskHours: toNumber(raw?.very_high_risk_hours, 0),
    extremeHours: toNumber(raw?.extreme_hours, 0),
    longestContinuousHighRiskHours: toNumber(raw?.longest_continuous_high_risk_hours, 0),
  }
}

function mapHeatRiskData(data: HeatRiskApiResponse, fallbackLat: number, fallbackLon: number): HeatRiskResponse {
  const location = data.location ?? { lat: fallbackLat, lon: fallbackLon }
  const vsHistorical = data.vs_historical ?? {}

  // Resolve historical message from either field
  const historicalMessage =
    toStringOrDefault(vsHistorical.message, '') ||
    toStringOrDefault(vsHistorical.anomaly_description, 'No historical comparison available.')

  // Resolve historical average from either field
  const historicalAvg =
    toNumber(vsHistorical.historical_average, 0) ||
    toNumber(data.historical_avg_c, 0)

  const dataSource = (data.data_source ?? 'UNKNOWN') as HeatRiskResponse['dataSource']

  return {
    location: {
      lat: toNumber(location.lat, fallbackLat),
      lon: toNumber(location.lon, fallbackLon),
    },
    current: {
      temperature: toNumber(data.current_temp_c, 0),
      temperatureF: toNumber(data.current_temp_f, 0),
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
      averageTemperature: historicalAvg,
      isUnusual: Boolean(vsHistorical.is_unusual ?? vsHistorical.isUnusual),
      difference: toNumber(vsHistorical.diff, 0),
      message: historicalMessage,
    },
    peak: {
      temperature: toNumber(data.peak_next_12h?.peak_temp, 0),
      time: toStringOrDefault(data.peak_next_12h?.peak_time, '--:--'),
      windowStart: toStringOrDefault(data.peak_next_12h?.window_start, '--:--'),
      windowEnd: toStringOrDefault(data.peak_next_12h?.window_end, '--:--'),
      durationHours: toNumber(data.peak_next_12h?.duration_hours, 0),
      peakRiskLevel: toStringOrDefault(data.peak_next_12h?.peak_risk_level, 'unknown'),
    },
    forecast: Array.isArray(data.forecast_12h)
      ? data.forecast_12h.map((item) => ({
          hourOffset: toNumber(item.hour_offset, 0),
          time: toStringOrDefault(item.time, '--:--'),
          temperature: toNumber(item.temp_c, 0),
          level: toStringOrDefault(item.level, 'unknown'),
          emoji: toStringOrDefault(item.emoji, '—'),
          label: toStringOrDefault(item.label, 'Unknown'),
          riskScore: toNumber(item.risk_score, 0),
          thermalScore: toNumber(item.thermal_score, 0),
        }))
      : [],
    recommendation: toStringOrDefault(data.ai_recommendation, 'No recommendation available.'),
    explainability: mapExplainability(data.explainability),
    persistenceDetail: mapPersistenceDetail(data.persistence_detail),
    dataSource,
  }
}

export async function getHeatRisk(lat: number, lon: number): Promise<HeatRiskResponse> {
  const { data } = await client.get<HeatRiskApiResponse>('/api/heat-risk', {
    params: { lat, lon },
  })
  return mapHeatRiskData(data, lat, lon)
}

export async function getNearbySafer(lat: number, lon: number, radiusM = 300): Promise<NearbySaferResponse> {
  const { data } = await client.get<NearbySaferResponse>('/api/nearby-safer', {
    params: { lat, lon, radius_m: radiusM },
  })
  return data
}