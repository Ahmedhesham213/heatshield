import type { HeatRiskResponse } from '@/services/api'

export function mapHeatData(data: HeatRiskResponse, fallbackName = 'Current Location') {
  return {
    locationName: fallbackName,
    temperature: data.current.temperature,
    feelsLike: data.current.feelsLike ?? data.current.temperature,
    score: Math.max(0, Math.min(100, data.current.riskScore)),
    level: data.current.riskLevel,
    peakTemperature: data.peak.temperature,
    peakTime: data.peak.time,
    forecast: data.forecast.map((item) => ({
      time: item.time,
      temp: item.temperature,
      risk: item.riskScore,
    })),
    recommendation: data.recommendation,
  }
}

