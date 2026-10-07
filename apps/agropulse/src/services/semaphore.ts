import { PlotStatus } from '../types/database';

export interface SemaphoreResult {
  status: PlotStatus;
  label: string;
  color: string;
  badgeBg: string;
  textColor: string;
  ageMinutes: number | null;
  ageText: string;
  recommendation: string | null;
}

export const SEMAPHORE_CONFIG = {
  stale: {
    label: 'Sin datos confiables',
    shortLabel: 'Stale',
    color: '#6B7280', // Gray
    badgeBg: '#F3F4F6',
    textColor: '#374151',
  },
  dry: {
    label: 'Seco (Requiere riego)',
    shortLabel: 'Seco',
    color: '#EF4444', // Red
    badgeBg: '#FEE2E2',
    textColor: '#991B1B',
  },
  optimal: {
    label: 'Humedad óptima',
    shortLabel: 'Óptimo',
    color: '#10B981', // Green
    badgeBg: '#D1FAE5',
    textColor: '#065F46',
  },
  wet: {
    label: 'Saturado / Húmedo',
    shortLabel: 'Húmedo',
    color: '#3B82F6', // Blue
    badgeBg: '#DBEAFE',
    textColor: '#1E40AF',
  }
};

/**
 * Calculates plot status based on PRD §08:
 * 1. stale: No reading or now - measured_at > 15 min
 * 2. dry: moisture_pct < threshold_min
 * 3. optimal: threshold_min <= moisture_pct <= threshold_max
 * 4. wet: moisture_pct > threshold_max
 */
export function calculateSemaphore(
  lastMeasuredAt: string | Date | null | undefined,
  moisturePct: number | null | undefined,
  thresholdMin: number = 25.0,
  thresholdMax: number = 45.0,
  referenceNow: Date = new Date()
): SemaphoreResult {
  // If no reading at all -> stale
  if (!lastMeasuredAt || moisturePct === null || moisturePct === undefined) {
    return {
      status: 'stale',
      label: SEMAPHORE_CONFIG.stale.label,
      color: SEMAPHORE_CONFIG.stale.color,
      badgeBg: SEMAPHORE_CONFIG.stale.badgeBg,
      textColor: SEMAPHORE_CONFIG.stale.textColor,
      ageMinutes: null,
      ageText: 'Sin lecturas registradas',
      recommendation: 'Verificar estado del sensor o enlace de red.',
    };
  }

  const measuredDate = typeof lastMeasuredAt === 'string' ? new Date(lastMeasuredAt) : lastMeasuredAt;
  const diffMs = referenceNow.getTime() - measuredDate.getTime();
  const ageMinutes = Math.max(0, Math.floor(diffMs / 60000));
  const ageSeconds = Math.max(0, Math.floor(diffMs / 1000));

  let ageText = '';
  if (ageSeconds < 60) {
    ageText = `hace ${ageSeconds} s`;
  } else if (ageMinutes < 60) {
    ageText = `hace ${ageMinutes} min`;
  } else {
    const ageHours = Math.floor(ageMinutes / 60);
    ageText = `hace ${ageHours} h`;
  }

  // 1. Check stale condition (> 15 minutes)
  if (ageMinutes > 15) {
    return {
      status: 'stale',
      label: SEMAPHORE_CONFIG.stale.label,
      color: SEMAPHORE_CONFIG.stale.color,
      badgeBg: SEMAPHORE_CONFIG.stale.badgeBg,
      textColor: SEMAPHORE_CONFIG.stale.textColor,
      ageMinutes,
      ageText,
      recommendation: 'Estación sin ticks > 15 min. No se recomienda basar riego en este valor.',
    };
  }

  // 2. Check dry condition
  if (moisturePct < thresholdMin) {
    return {
      status: 'dry',
      label: SEMAPHORE_CONFIG.dry.label,
      color: SEMAPHORE_CONFIG.dry.color,
      badgeBg: SEMAPHORE_CONFIG.dry.badgeBg,
      textColor: SEMAPHORE_CONFIG.dry.textColor,
      ageMinutes,
      ageText,
      recommendation: 'Humedad bajo umbral: considerar riego.', // RF-22 rule
    };
  }

  // 3. Check optimal condition
  if (moisturePct >= thresholdMin && moisturePct <= thresholdMax) {
    return {
      status: 'optimal',
      label: SEMAPHORE_CONFIG.optimal.label,
      color: SEMAPHORE_CONFIG.optimal.color,
      badgeBg: SEMAPHORE_CONFIG.optimal.badgeBg,
      textColor: SEMAPHORE_CONFIG.optimal.textColor,
      ageMinutes,
      ageText,
      recommendation: 'Nivel hídrico en rango ideal para el cultivo.',
    };
  }

  // 4. Wet condition (moisturePct > thresholdMax)
  return {
    status: 'wet',
    label: SEMAPHORE_CONFIG.wet.label,
    color: SEMAPHORE_CONFIG.wet.color,
    badgeBg: SEMAPHORE_CONFIG.wet.badgeBg,
    textColor: SEMAPHORE_CONFIG.wet.textColor,
    ageMinutes,
    ageText,
    recommendation: 'Suelo saturado o lluvia reciente. Riego innecesario.',
  };
}
