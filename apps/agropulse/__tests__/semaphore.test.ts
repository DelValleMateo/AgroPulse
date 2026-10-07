import { calculateSemaphore } from '../src/services/semaphore';

describe('RNF-08: Semaphore Business Logic Tests', () => {
  const now = new Date('2026-09-23T12:00:00Z');

  test('should return "stale" if last reading was more than 15 minutes ago (RF-09, RF-12)', () => {
    // 16 minutes ago
    const sixteenMinAgo = new Date(now.getTime() - 16 * 60 * 1000);
    const result = calculateSemaphore(sixteenMinAgo, 32.0, 25.0, 45.0, now);

    expect(result.status).toBe('stale');
    expect(result.color).toBe('#6B7280'); // Gray
    expect(result.ageMinutes).toBe(16);
  });

  test('should return "stale" if there are no readings recorded', () => {
    const result = calculateSemaphore(null, null, 25.0, 45.0, now);

    expect(result.status).toBe('stale');
    expect(result.color).toBe('#6B7280');
    expect(result.ageMinutes).toBeNull();
  });

  test('should return "dry" (red) if moisture is below minimum threshold (RF-12)', () => {
    // 2 minutes ago, moisture 18% < min 25% (Story H1)
    const twoMinAgo = new Date(now.getTime() - 2 * 60 * 1000);
    const result = calculateSemaphore(twoMinAgo, 18.0, 25.0, 45.0, now);

    expect(result.status).toBe('dry');
    expect(result.color).toBe('#EF4444'); // Red
    expect(result.recommendation).toContain('considerar riego'); // RF-22 rule
  });

  test('should return "optimal" (green) if moisture is within thresholds (RF-12)', () => {
    // 3 minutes ago, moisture 32% (between 25% and 45%)
    const threeMinAgo = new Date(now.getTime() - 3 * 60 * 1000);
    const result = calculateSemaphore(threeMinAgo, 32.0, 25.0, 45.0, now);

    expect(result.status).toBe('optimal');
    expect(result.color).toBe('#10B981'); // Green
  });

  test('should return "wet" (blue) if moisture is above maximum threshold (RF-12)', () => {
    // 1 minute ago, moisture 52% > max 45%
    const oneMinAgo = new Date(now.getTime() - 1 * 60 * 1000);
    const result = calculateSemaphore(oneMinAgo, 52.0, 25.0, 45.0, now);

    expect(result.status).toBe('wet');
    expect(result.color).toBe('#3B82F6'); // Blue
  });

  test('should prioritize stale over dry condition if data is older than 15 minutes (H4)', () => {
    // 20 minutes ago, moisture 10% (would be dry if recent, but MUST be stale because sensor fell)
    const twentyMinAgo = new Date(now.getTime() - 20 * 60 * 1000);
    const result = calculateSemaphore(twentyMinAgo, 10.0, 25.0, 45.0, now);

    expect(result.status).toBe('stale');
    expect(result.color).toBe('#6B7280');
  });
});
