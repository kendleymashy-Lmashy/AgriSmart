import {
  AlertNotification,
  Calibration,
  CropRecommendation,
  HistoricalData,
  IrrigationAdvice,
  PumpMode,
  PumpStatus,
  SensorReading,
  SystemSettings,
  WeatherContext,
} from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}`);
  }

  return (await response.json()) as T;
}

export const apiService = {
  getSensorReadings: () => request<SensorReading[]>('/sensors/readings'),
  getSensorCalibration: () => request<Calibration>('/sensors/calibration'),
  updateSensorCalibration: (calibration: Calibration) =>
    request<Calibration>('/sensors/calibration', { method: 'PUT', body: JSON.stringify(calibration) }),
  postSensorReadings: (readings: Partial<SensorReading>[]) =>
    request<SensorReading[]>('/sensors/readings', { method: 'POST', body: JSON.stringify({ readings }) }),
  getPumpStatus: () => request<PumpStatus>('/pump/status'),
  togglePump: (on: boolean) =>
    request<PumpStatus>('/pump/toggle', { method: 'POST', body: JSON.stringify({ on }) }),
  setPumpMode: (mode: PumpMode) =>
    request<PumpStatus>('/pump/mode', { method: 'POST', body: JSON.stringify({ mode }) }),
  getCropRecommendations: () => request<CropRecommendation[]>('/ai/recommendations'),
  getIrrigationAdvice: () => request<IrrigationAdvice>('/ai/irrigation-advice'),
  getCurrentWeather: () => request<WeatherContext>('/weather/current'),
  getAlerts: () => request<AlertNotification[]>('/alerts'),
  markAlertAsRead: (alertId: string) =>
    request<AlertNotification>(`/alerts/${alertId}`, { method: 'PATCH', body: JSON.stringify({ isRead: true }) }),
  getSystemSettings: () => request<SystemSettings>('/settings/system'),
  updateSystemSettings: (settings: Partial<SystemSettings>) =>
    request<SystemSettings>('/settings/system', { method: 'PUT', body: JSON.stringify(settings) }),
  getHistoricalData: (days = 7) => request<HistoricalData[]>(`/analytics/history?days=${days}`),
  getAnalyticsInsights: () => request('/analytics/insights'),
};
