import * as Location from 'expo-location';
import { Coordinate } from '../types/database';

/**
 * Point-in-polygon algorithm using Ray-casting.
 * Determines if point (lat, lng) is inside the polygon coordinates.
 */
export function isPointInPolygon(point: Coordinate, polygon: Coordinate[]): boolean {
  if (!polygon || polygon.length < 3) return false;

  const x = point.longitude;
  const y = point.latitude;
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].longitude;
    const yi = polygon[i].latitude;
    const xj = polygon[j].longitude;
    const yj = polygon[j].latitude;

    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) {
      inside = !inside;
    }
  }

  return inside;
}

/**
 * Calculates polygon center coordinate (centroid)
 */
export function getPolygonCenter(polygon: Coordinate[]): Coordinate {
  if (!polygon || polygon.length === 0) {
    return { latitude: -31.392, longitude: -58.020 }; // Default Concordia
  }

  let sumLat = 0;
  let sumLng = 0;

  for (const p of polygon) {
    sumLat += p.latitude;
    sumLng += p.longitude;
  }

  return {
    latitude: sumLat / polygon.length,
    longitude: sumLng / polygon.length,
  };
}

export interface UserLocationResult {
  location: Coordinate | null;
  hasPermission: boolean;
  errorMessage: string | null;
}

/**
 * Safe GPS fetcher that does not crash if permissions are missing or rejected (RF-06).
 */
export async function getCurrentDeviceLocation(): Promise<UserLocationResult> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      return {
        location: null,
        hasPermission: false,
        errorMessage: 'Permiso de ubicación denegado por el usuario',
      };
    }

    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    return {
      location: {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      },
      hasPermission: true,
      errorMessage: null,
    };
  } catch (err: any) {
    return {
      location: null,
      hasPermission: false,
      errorMessage: err.message || 'Ubicación no disponible en este dispositivo',
    };
  }
}
