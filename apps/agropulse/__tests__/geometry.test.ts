import { isPointInPolygon } from '../src/services/geoService';
import { Coordinate } from '../src/types/database';

describe('RF-06: Geographic Point-in-Polygon Tests', () => {
  // Test polygon: Square around Concordia
  const plotCosta1: Coordinate[] = [
    { latitude: -31.382, longitude: -58.012 },
    { latitude: -31.382, longitude: -58.019 },
    { latitude: -31.388, longitude: -58.019 },
    { latitude: -31.388, longitude: -58.012 },
  ];

  test('should return true when GPS point is strictly inside the polygon', () => {
    // Point inside Costa 1
    const userLocation: Coordinate = {
      latitude: -31.385,
      longitude: -58.015,
    };

    expect(isPointInPolygon(userLocation, plotCosta1)).toBe(true);
  });

  test('should return false when GPS point is outside the polygon', () => {
    // Point far away
    const outsideLocation: Coordinate = {
      latitude: -31.45,
      longitude: -58.1,
    };

    expect(isPointInPolygon(outsideLocation, plotCosta1)).toBe(false);
  });

  test('should return false safely for empty or invalid polygons without crashing', () => {
    const point: Coordinate = { latitude: -31.385, longitude: -58.015 };
    expect(isPointInPolygon(point, [])).toBe(false);
    expect(isPointInPolygon(point, [{ latitude: 0, longitude: 0 }])).toBe(false);
  });
});
