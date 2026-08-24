import type { HeatRiskResponse } from '@/services/api'

export function mapHeatData(data: HeatRiskResponse) {
  return { locationName: data.location.name ?? 'Current location', temperature: data.current.temperature, feelsLike: data.current.feelsLike ?? data.current.temperature, score: Math.max(0, Math.min(100, data.current.riskScore)), level: data.current.riskLevel, peakTemperature: data.peak.temperature, peakTime: data.peak.time, forecast: data.forecast.map((item) => ({ time: item.time, temp: item.temperature, risk: item.risk })), recommendation: data.recommendation }
}
