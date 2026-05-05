const defaultCropRules = [
  {
    id: '1',
    name: 'Maize',
    image: 'Maize',
    bestSeason: 'Summer',
    yieldExpectation: 'High',
    waterRequirement: 500,
    ideal: { soilMoisture: [25, 65], temperature: [22, 32], humidity: [45, 75] },
    reason: 'Suitable for warm conditions and current soil moisture.',
  },
  {
    id: '2',
    name: 'Wheat',
    image: 'Wheat',
    bestSeason: 'Winter',
    yieldExpectation: 'Medium-High',
    waterRequirement: 400,
    ideal: { soilMoisture: [30, 70], temperature: [12, 25], humidity: [40, 65] },
    reason: 'Good option for cooler temperatures and moderate water demand.',
  },
  {
    id: '3',
    name: 'Soybeans',
    image: 'Soybeans',
    bestSeason: 'Summer',
    yieldExpectation: 'Medium',
    waterRequirement: 450,
    ideal: { soilMoisture: [35, 75], temperature: [20, 30], humidity: [50, 80] },
    reason: 'Nitrogen-fixing crop that fits humid summer growing conditions.',
  },
  {
    id: '4',
    name: 'Sorghum',
    image: 'Sorghum',
    bestSeason: 'Summer',
    yieldExpectation: 'Medium-High',
    waterRequirement: 320,
    ideal: { soilMoisture: [15, 45], temperature: [25, 36], humidity: [30, 65] },
    reason: 'Drought-tolerant crop for warmer and drier field conditions.',
  },
];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function scoreRange(value, [min, max]) {
  if (value >= min && value <= max) return 1;
  const distance = value < min ? min - value : value - max;
  return clamp(1 - distance / 40, 0, 1);
}

function latestValue(readings, type, fallback) {
  const reading = readings
    .filter((item) => item.type === type)
    .sort((a, b) => {
      const timeDifference = new Date(b.timestamp) - new Date(a.timestamp);
      if (timeDifference !== 0) return timeDifference;
      return readingSequence(b) - readingSequence(a);
    })[0];

  return reading ? Number(reading.value) : fallback;
}

function readingSequence(reading) {
  const numericId = Number(reading.id);
  if (Number.isFinite(numericId)) return numericId;
  const leadingNumber = Number(String(reading.id || '').split('-')[0]);
  return Number.isFinite(leadingNumber) ? leadingNumber : 0;
}

function localDateParts(timezone) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone || 'Africa/Harare',
      month: 'numeric',
      hour: 'numeric',
      hour12: false,
    }).formatToParts(new Date());

    return {
      month: Number(parts.find((part) => part.type === 'month')?.value || new Date().getMonth() + 1),
      hour: Number(parts.find((part) => part.type === 'hour')?.value || new Date().getHours()),
    };
  } catch (error) {
    return { month: new Date().getMonth() + 1, hour: new Date().getHours() };
  }
}

function isSouthernHemisphere(settings) {
  const text = `${settings.location || ''} ${settings.timezone || ''}`.toLowerCase();
  return [
    'zimbabwe',
    'harare',
    'south africa',
    'botswana',
    'zambia',
    'mozambique',
    'namibia',
    'australia',
    'argentina',
    'brazil',
    'chile',
  ].some((hint) => text.includes(hint));
}

function seasonForMonth(month, southernHemisphere) {
  if (southernHemisphere) {
    if ([12, 1, 2, 3].includes(month)) return 'Summer';
    if ([4, 5].includes(month)) return 'Autumn';
    if ([6, 7, 8].includes(month)) return 'Winter';
    return 'Spring';
  }

  if ([12, 1, 2].includes(month)) return 'Winter';
  if ([3, 4, 5].includes(month)) return 'Spring';
  if ([6, 7, 8].includes(month)) return 'Summer';
  return 'Autumn';
}

function buildWeatherContext(readings, settings) {
  const temperature = latestValue(readings, 'temperature', 27.5);
  const humidity = latestValue(readings, 'humidity', 58);
  const { month, hour } = localDateParts(settings.timezone);
  const season = seasonForMonth(month, isSouthernHemisphere(settings));

  let rainChance = humidity * 0.82 - Math.max(0, temperature - 28) * 3;
  if (season === 'Summer') rainChance += 8;
  if (season === 'Winter') rainChance -= 10;
  rainChance = Math.round(clamp(rainChance, 5, 90));

  const evaporationRisk =
    temperature >= 35 && humidity <= 45
      ? 'high'
      : temperature >= 30 || humidity <= 38
        ? 'medium'
        : 'low';

  let condition = 'Stable field weather';
  if (evaporationRisk === 'high') condition = 'Hot and dry';
  else if (rainChance >= 65) condition = 'Humid with rain risk';
  else if (temperature >= 30) condition = 'Warm';
  else if (humidity >= 75) condition = 'Humid';

  return {
    location: settings.location,
    timezone: settings.timezone || 'Africa/Harare',
    season,
    localHour: hour,
    temperature,
    humidity,
    rainChance,
    evaporationRisk,
    condition,
  };
}

function normalizeCrops(crops) {
  const source = Array.isArray(crops) && crops.length > 0 ? crops : defaultCropRules;

  return source.map((crop) => ({
    id: String(crop.id),
    name: crop.name,
    image: crop.image || crop.name,
    bestSeason: crop.bestSeason || crop.best_season,
    yieldExpectation: crop.yieldExpectation || crop.yield_expectation,
    waterRequirement: Number(crop.waterRequirement || crop.water_requirement_liters || 0),
    ideal: crop.ideal || {
      soilMoisture: [Number(crop.minSoilMoisture), Number(crop.maxSoilMoisture)],
      temperature: [Number(crop.minTemperature), Number(crop.maxTemperature)],
      humidity: [Number(crop.minHumidity), Number(crop.maxHumidity)],
    },
    reason: crop.reason,
  }));
}

function scoreSeason(cropSeason, currentSeason) {
  if (!cropSeason) return 0.75;
  const normalized = cropSeason.toLowerCase();
  if (normalized.includes('all')) return 0.9;
  if (normalized.includes(currentSeason.toLowerCase())) return 1;
  if (
    (currentSeason === 'Spring' && normalized.includes('summer')) ||
    (currentSeason === 'Autumn' && normalized.includes('winter')) ||
    (currentSeason === 'Summer' && normalized.includes('spring'))
  ) {
    return 0.72;
  }
  return 0.48;
}

function scoreWaterFit(crop, weather) {
  const demand = Number(crop.waterRequirement || 0);
  if (weather.evaporationRisk === 'high' && demand <= 350) return 1;
  if (weather.evaporationRisk === 'high' && demand >= 480) return 0.68;
  if (weather.rainChance >= 60 && demand >= 450) return 0.92;
  if (weather.rainChance <= 25 && demand <= 400) return 0.94;
  return 0.82;
}

function scoreLocation(crop, settings, weather) {
  const location = (settings.location || '').toLowerCase();
  const cropName = crop.name.toLowerCase();

  if (location.includes('zimbabwe') || location.includes('harare')) {
    if (['maize', 'sorghum', 'soybeans'].includes(cropName)) return 0.94;
    if (cropName === 'wheat' && weather.season === 'Winter') return 0.86;
  }

  return 0.76;
}

function buildRecommendations(readings, settings, crops) {
  const soilMoisture = latestValue(readings, 'soil_moisture', 32);
  const weather = buildWeatherContext(readings, settings);
  const cropRules = normalizeCrops(crops);

  return cropRules
    .map((crop) => {
      const soilScore = scoreRange(soilMoisture, crop.ideal.soilMoisture);
      const tempScore = scoreRange(weather.temperature, crop.ideal.temperature);
      const humidityScore = scoreRange(weather.humidity, crop.ideal.humidity);
      const seasonScore = scoreSeason(crop.bestSeason, weather.season);
      const waterScore = scoreWaterFit(crop, weather);
      const locationScore = scoreLocation(crop, settings, weather);
      const confidence = Math.round(
        (soilScore * 0.26 +
          tempScore * 0.24 +
          humidityScore * 0.16 +
          seasonScore * 0.18 +
          waterScore * 0.1 +
          locationScore * 0.06) *
          100
      );

      return {
        id: crop.id,
        name: crop.name,
        confidence,
        reason: `${crop.reason} Matched against ${settings.location}, ${weather.season.toLowerCase()} season, ${weather.condition.toLowerCase()} weather, and live sensor readings.`,
        waterRequirement: crop.waterRequirement,
        image: crop.image,
        bestSeason: crop.bestSeason,
        yieldExpectation: crop.yieldExpectation,
        inputs: {
          soilMoisture,
          temperature: weather.temperature,
          humidity: weather.humidity,
          location: settings.location,
          timezone: weather.timezone,
          season: weather.season,
          weather,
        },
      };
    })
    .sort((a, b) => b.confidence - a.confidence);
}

function buildIrrigationAdvice(readings, settings, pumpStatus, calibration) {
  const soilMoisture = latestValue(readings, 'soil_moisture', 32);
  const weather = buildWeatherContext(readings, settings);
  const threshold = Number(settings.irrigationThreshold || 30);
  const dryThreshold = Number(calibration?.soilThreshold?.dry || Math.max(10, threshold - 10));
  const wetThreshold = Number(calibration?.soilThreshold?.wet || 80);
  const hotDryBoost = weather.evaporationRisk === 'high' ? 6 : weather.evaporationRisk === 'medium' ? 3 : 0;
  const rainOffset = weather.rainChance >= 65 ? 5 : weather.rainChance >= 50 ? 2 : 0;
  const effectiveThreshold = Math.round(clamp(threshold + hotDryBoost - rainOffset, 10, 85));
  const isCritical = soilMoisture <= dryThreshold;
  const isTooWet = soilMoisture >= wetThreshold;

  let action = 'standby';
  let label = 'No Water Needed';
  let reason = `Soil moisture is safe (${soilMoisture}% >= ${effectiveThreshold}%). Weather is ${weather.condition.toLowerCase()} with ${weather.rainChance}% rain chance.`;

  if (isTooWet) {
    action = 'standby';
    label = 'Stop Irrigation';
    reason = `Soil moisture is high (${soilMoisture}% >= ${wetThreshold}%), so irrigation should stay off.`;
  } else if (isCritical) {
    action = 'water_now';
    label = 'Water Now';
    reason = `Soil moisture is critical (${soilMoisture}% <= ${dryThreshold}%). Irrigation is needed even with current weather.`;
  } else if (soilMoisture < effectiveThreshold && weather.rainChance < 65) {
    action = 'water_now';
    label = 'Water Now';
    reason = `Soil moisture is below the AI threshold (${soilMoisture}% < ${effectiveThreshold}%) and ${weather.condition.toLowerCase()} weather increases crop stress.`;
  } else if (soilMoisture < threshold && weather.rainChance >= 65) {
    action = 'wait_for_rain';
    label = 'Delay Irrigation';
    reason = `Soil moisture is low, but rain chance is ${weather.rainChance}%. Delay unless moisture drops below ${dryThreshold}%.`;
  }

  const severity = Math.max(0, effectiveThreshold - soilMoisture);
  const weatherMinutes = weather.evaporationRisk === 'high' ? 6 : weather.evaporationRisk === 'medium' ? 3 : 0;
  const rainReduction = weather.rainChance >= 50 ? 4 : 0;
  const durationMinutes =
    action === 'water_now'
      ? Math.round(clamp(10 + severity * 0.75 + weatherMinutes - rainReduction, 5, 35))
      : 0;
  const pumpRunning = Boolean(pumpStatus.isRunning);
  const command = action === 'water_now' ? 'start_pump' : pumpRunning ? 'stop_pump' : 'standby';

  return {
    action,
    command,
    label,
    durationMinutes,
    reason,
    pumpRunning,
    shouldIrrigate: action === 'water_now',
    threshold,
    effectiveThreshold,
    dryThreshold,
    wetThreshold,
    weather,
    recommendedStart: action === 'water_now' && weather.localHour >= 11 && weather.localHour <= 15 && !isCritical
      ? 'late afternoon'
      : 'now',
  };
}

module.exports = {
  buildIrrigationAdvice,
  buildRecommendations,
  buildWeatherContext,
  defaultCropRules,
};
