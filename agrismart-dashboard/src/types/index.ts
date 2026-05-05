export type SensorType = 'soil_moisture' | 'temperature' | 'humidity';
export type SensorStatus = 'normal' | 'warning' | 'critical';
export type PumpMode = 'automatic' | 'manual';
export type AlertType = 'critical' | 'warning' | 'info';
export type IrrigationAction = 'water_now' | 'standby' | 'wait_for_rain';
export type DeviceCommand = 'start_pump' | 'stop_pump' | 'standby';

export interface SensorReading {
  id: string;
  type: SensorType;
  value: number;
  unit: string;
  timestamp: string;
  status: SensorStatus;
  rawValue?: number;
}

export interface PumpStatus {
  id: string;
  isRunning: boolean;
  mode: PumpMode;
  uptime: number;
  power: number;
  lastCommand?: string;
  updatedAt?: string;
}

export interface WeatherContext {
  location: string;
  timezone: string;
  season: string;
  localHour: number;
  temperature: number;
  humidity: number;
  rainChance: number;
  evaporationRisk: 'low' | 'medium' | 'high';
  condition: string;
}

export interface IrrigationAdvice {
  action: IrrigationAction;
  command: DeviceCommand;
  label: string;
  durationMinutes: number;
  reason: string;
  pumpRunning: boolean;
  shouldIrrigate: boolean;
  threshold: number;
  effectiveThreshold: number;
  dryThreshold: number;
  wetThreshold: number;
  recommendedStart: string;
  weather: WeatherContext;
}

export interface CropRecommendation {
  id: string;
  name: string;
  confidence: number;
  reason: string;
  waterRequirement: number;
  image: string;
  bestSeason: string;
  yieldExpectation: string;
  inputs?: {
    soilMoisture: number;
    temperature: number;
    humidity: number;
    location: string;
    timezone?: string;
    season?: string;
    weather?: WeatherContext;
  };
}

export interface AlertNotification {
  id: string;
  type: AlertType;
  title: string;
  message: string;
  timestamp: string;
  isRead: boolean;
}

export interface SystemSettings {
  deviceName: string;
  location: string;
  batteryLevel: number;
  firmwareVersion: string;
  uptime: number;
  autoMode: boolean;
  irrigationThreshold: number;
  timezone?: string;
  unitSystem?: string;
}

export interface HistoricalData {
  date: string;
  soilMoisture: number;
  temperature: number;
  humidity: number;
  pumpUsage: number;
}

export interface Calibration {
  soilThreshold: {
    dry: number;
    wet: number;
  };
}
