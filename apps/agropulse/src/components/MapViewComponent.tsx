import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import Svg, { Polygon, Circle, Text as SvgText, G, Rect, Line } from 'react-native-svg';
import { Coordinate, Plot, PlotStatus } from '../types/database';
import { SEMAPHORE_CONFIG } from '../services/semaphore';
import { MapPin, Compass } from 'lucide-react-native';

export interface PlotWithStatus extends Plot {
  status: PlotStatus;
  currentMoisture?: number;
  isUserInside?: boolean;
}

interface MapViewComponentProps {
  plots: PlotWithStatus[];
  userLocation: Coordinate | null;
  onSelectPlot: (plot: PlotWithStatus) => void;
  height?: number;
}

export const MapViewComponent: React.FC<MapViewComponentProps> = ({
  plots,
  userLocation,
  onSelectPlot,
  height = 360,
}) => {
  const screenWidth = Dimensions.get('window').width;
  const width = Math.min(screenWidth, 600);

  // Geographic bounds around Concordia, Entre Ríos plots
  // Lat: ~ -31.378 to -31.415
  // Lng: ~ -58.008 to -58.038
  const minLat = -31.415;
  const maxLat = -31.378;
  const minLng = -58.038;
  const maxLng = -58.008;

  const latRange = maxLat - minLat;
  const lngRange = maxLng - minLng;

  // Project geographic coord (lat, lng) to SVG (x, y)
  const project = (coord: Coordinate) => {
    const padding = 28;
    const innerW = width - padding * 2;
    const innerH = height - padding * 2;

    const x = padding + ((coord.longitude - minLng) / lngRange) * innerW;
    // Invert latitude because SVG Y grows downwards
    const y = padding + ((maxLat - coord.latitude) / latRange) * innerH;

    return { x, y };
  };

  return (
    <View style={[styles.wrapper, { height }]}>
      <Svg width={width} height={height} style={styles.svg}>
        {/* Agricultural satellite grid background simulation */}
        <Rect x="0" y="0" width={width} height={height} fill="#1E293B" />

        {/* Subtle grid pattern */}
        {[0.2, 0.4, 0.6, 0.8].map((ratio, idx) => (
          <G key={`grid-${idx}`}>
            <Line
              x1="0"
              y1={height * ratio}
              x2={width}
              y2={height * ratio}
              stroke="#334155"
              strokeWidth="0.8"
              strokeDasharray="4, 4"
            />
            <Line
              x1={width * ratio}
              y1="0"
              x2={width * ratio}
              y2={height}
              stroke="#334155"
              strokeWidth="0.8"
              strokeDasharray="4, 4"
            />
          </G>
        ))}

        {/* Render Polygons for each plot */}
        {plots.map((plot) => {
          const config = SEMAPHORE_CONFIG[plot.status] || SEMAPHORE_CONFIG.stale;
          const pointsString = plot.geom
            .map((c) => {
              const pt = project(c);
              return `${pt.x},${pt.y}`;
            })
            .join(' ');

          // Calculate center for label
          let sumX = 0;
          let sumY = 0;
          plot.geom.forEach((c) => {
            const pt = project(c);
            sumX += pt.x;
            sumY += pt.y;
          });
          const centerX = sumX / plot.geom.length;
          const centerY = sumY / plot.geom.length;

          const fillColor = `${config.color}55`; // 33% opacity fill
          const strokeColor = config.color;

          return (
            <G key={plot.id}>
              {/* Clickable polygon */}
              <Polygon
                points={pointsString}
                fill={fillColor}
                stroke={strokeColor}
                strokeWidth={plot.isUserInside ? 3.5 : 2}
                strokeDasharray={plot.status === 'stale' ? '5, 5' : undefined}
                onPress={() => onSelectPlot(plot)}
              />

              {/* Station center marker */}
              <Circle
                cx={centerX}
                cy={centerY}
                r={plot.isUserInside ? 9 : 7}
                fill={config.color}
                stroke="#FFFFFF"
                strokeWidth={2}
                onPress={() => onSelectPlot(plot)}
              />

              {/* Accessible Plot Label (Name + Status Text + Moisture) */}
              <Rect
                x={centerX - 46}
                y={centerY + 10}
                width="92"
                height="28"
                rx="6"
                fill="#0F172A"
                opacity="0.85"
                stroke={strokeColor}
                strokeWidth="1"
              />
              <SvgText
                x={centerX}
                y={centerY + 22}
                fill="#FFFFFF"
                fontSize="10"
                fontWeight="bold"
                textAnchor="middle"
              >
                {plot.name}
              </SvgText>
              <SvgText
                x={centerX}
                y={centerY + 34}
                fill={config.color}
                fontSize="9"
                fontWeight="bold"
                textAnchor="middle"
              >
                {`${config.shortLabel} ${plot.currentMoisture ? `(${plot.currentMoisture}%)` : ''}`}
              </SvgText>
            </G>
          );
        })}

        {/* User GPS Pin (RF-06) */}
        {userLocation && (
          <G>
            {/* Pulse ripple */}
            <Circle
              cx={project(userLocation).x}
              cy={project(userLocation).y}
              r={16}
              fill="#3B82F6"
              opacity="0.35"
            />
            {/* User center marker */}
            <Circle
              cx={project(userLocation).x}
              cy={project(userLocation).y}
              r={6}
              fill="#2563EB"
              stroke="#FFFFFF"
              strokeWidth={2}
            />
            <SvgText
              x={project(userLocation).x}
              y={project(userLocation).y - 10}
              fill="#60A5FA"
              fontSize="10"
              fontWeight="bold"
              textAnchor="middle"
            >
              Tú estás aquí
            </SvgText>
          </G>
        )}
      </Svg>

      {/* Interactive overlay buttons & legends */}
      <View style={styles.overlayHeader}>
        <View style={styles.regionBadge}>
          <Compass size={14} color="#94A3B8" />
          <Text style={styles.regionText}>Concordia, Entre Ríos (Ficticio)</Text>
        </View>
      </View>

      {/* Floating Semáforo Legend */}
      <View style={styles.legendContainer}>
        <View style={styles.legendRow}>
          <View style={[styles.legendDot, { backgroundColor: '#10B981' }]} />
          <Text style={styles.legendLabel}>Óptimo</Text>
        </View>
        <View style={styles.legendRow}>
          <View style={[styles.legendDot, { backgroundColor: '#EF4444' }]} />
          <Text style={styles.legendLabel}>Seco</Text>
        </View>
        <View style={styles.legendRow}>
          <View style={[styles.legendDot, { backgroundColor: '#3B82F6' }]} />
          <Text style={styles.legendLabel}>Húmedo</Text>
        </View>
        <View style={styles.legendRow}>
          <View style={[styles.legendDot, { backgroundColor: '#6B7280' }]} />
          <Text style={styles.legendLabel}>Sin datos</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    backgroundColor: '#0F172A',
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    marginVertical: 8,
  },
  svg: {
    width: '100%',
    height: '100%',
  },
  overlayHeader: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
  },
  regionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    gap: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  regionText: {
    color: '#E2E8F0',
    fontSize: 11,
    fontWeight: '600',
  },
  legendContainer: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#334155',
    flexDirection: 'row',
    gap: 10,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    color: '#CBD5E1',
    fontSize: 10,
    fontWeight: '600',
  },
});
