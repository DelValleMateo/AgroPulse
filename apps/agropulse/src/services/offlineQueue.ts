import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { OfflineReading } from '../types/database';
import { generateUUID } from './commandService';

const QUEUE_STORAGE_KEY = '@agropulse_offline_readings';

/**
 * Saves a manual field reading to the local offline queue
 */
export async function enqueueManualReading(
  reading: Omit<OfflineReading, 'client_reading_id' | 'synced'>
): Promise<OfflineReading> {
  const item: OfflineReading = {
    ...reading,
    client_reading_id: generateUUID(),
    synced: false,
  };

  const currentQueue = await getOfflineQueue();
  currentQueue.push(item);
  await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(currentQueue));

  return item;
}

export async function getOfflineQueue(): Promise<OfflineReading[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

/**
 * Attempts to flush and synchronize all pending offline readings with Supabase (RF-21, H3)
 */
export async function flushOfflineQueue(): Promise<{
  syncedCount: number;
  remainingCount: number;
  errors: string[];
}> {
  const queue = await getOfflineQueue();
  if (queue.length === 0) {
    return { syncedCount: 0, remainingCount: 0, errors: [] };
  }

  const unSynced = queue.filter((item) => !item.synced);
  const stillPending: OfflineReading[] = [];
  const errors: string[] = [];
  let syncedCount = 0;

  for (const item of unSynced) {
    try {
      // Upsert using client_reading_id to prevent duplicates upon reconnection (RF-21)
      const { error } = await supabase.from('readings').upsert(
        {
          station_id: item.station_id,
          moisture_pct: item.moisture_pct,
          temp_c: item.temp_c,
          rain_mm: item.rain_mm,
          source: 'manual',
          client_reading_id: item.client_reading_id,
          measured_at: item.measured_at,
        },
        { onConflict: 'client_reading_id' }
      );

      if (error) {
        errors.push(`Error en lectura ${item.client_reading_id}: ${error.message}`);
        stillPending.push(item);
      } else {
        syncedCount++;
      }
    } catch (err: any) {
      errors.push(err.message || 'Error de conexión');
      stillPending.push(item);
    }
  }

  await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(stillPending));

  return {
    syncedCount,
    remainingCount: stillPending.length,
    errors,
  };
}

export async function clearSyncedReadings(): Promise<void> {
  const queue = await getOfflineQueue();
  const unSynced = queue.filter((item) => !item.synced);
  await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(unSynced));
}
