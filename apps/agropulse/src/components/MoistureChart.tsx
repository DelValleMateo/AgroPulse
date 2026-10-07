import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Svg, { Path, Circle, Line, Text as SvgText, Rect, G } from 'react-native-svg';
import { Reading } from '../types/database';

interface MoistureChartProps {
  readings: Reading[];
  thresholdMin?: number;
  thresholdMax?: number;
  height?: number;
}

export const MoistureChart: React.FC<MoistureChartProps> = ({
  readings,
  thresholdMin = 25,
  thresholdMax = 45,
  height = 180,
}) => {
  const screenWidth = Dimensions.get('window').width;
  const chartWidth = Math.max(300, Math.min(screenWidth - 48, 600));
  const paddingLeft = 40;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 30;

  const innerWidth = chartWidth - paddingLeft - paddingRight;
  const innerHeight = height - paddingTop - paddingBottom;

  if (!readings || readings.length === 0) {
    return (
      <View style={[styles.emptyContainer, { height }]}>
        <Text style={styles.emptyText}>Sin datos suficientes para el gráfico (últimas 6 h)</Text>
      </View>
    );
  }

  // Sort readings chronologically (oldest first)
  const sorted = [...readings].sort(
    (a, b) => new Date(a.measured_at).getTime() - new Date(b.measured_at).getTime()
  );

  // Determine min and max Y values
  const minMoisture = 0;
  const maxMoisture = 60; // Standard 0-60% volumetric range

  const getY = (val: number) => {
    const clamped = Math.max(minMoisture, Math.min(maxMoisture, val));
    return paddingTop + innerHeight - ((clamped - minMoisture) / (maxMoisture - minMoisture)) * innerHeight;
  };

  const getX = (index: number) => {
    if (sorted.length <= 1) return paddingLeft + innerWidth / 2;
    return paddingLeft + (index / (sorted.length - 1)) * innerWidth;
  };

  // Build line path
  let pathD = '';
  sorted.forEach((r, idx) => {
    const x = getX(idx);
    const y = getY(r.moisture_pct);
    if (idx === 0) {
      pathD += `M ${x} ${y}`;
    } else {
      pathD += ` L ${x} ${y}`;
    }
  });

  const thresholdMinY = getY(thresholdMin);
  const thresholdMaxY = getY(thresholdMax);

  return (
    <View style={styles.container}>
      <Svg width={chartWidth} height={height}>
        {/* Background grid */}
        {[0, 20, 40, 60].map((level) => {
          const y = getY(level);
          return (
            <G key={`grid-${level}`}>
              <Line
                x1={paddingLeft}
                y1={y}
                x2={chartWidth - paddingRight}
                y2={y}
                stroke="#E5E7EB"
                strokeWidth={1}
              />
              <SvgText
                x={paddingLeft - 8}
                y={y + 4}
                fill="#9CA3AF"
                fontSize={10}
                textAnchor="end"
              >
                {`${level}%`}
              </SvgText>
            </G>
          );
        })}

        {/* Threshold Min Line (Red dashed) */}
        <Line
          x1={paddingLeft}
          y1={thresholdMinY}
          x2={chartWidth - paddingRight}
          y2={thresholdMinY}
          stroke="#EF4444"
          strokeWidth={1.5}
          strokeDasharray="4, 4"
        />
        <SvgText
          x={chartWidth - paddingRight}
          y={thresholdMinY - 4}
          fill="#EF4444"
          fontSize={10}
          textAnchor="end"
          fontWeight="bold"
        >
          {`Mín ${thresholdMin}%`}
        </SvgText>

        {/* Threshold Max Line (Blue dashed) */}
        <Line
          x1={paddingLeft}
          y1={thresholdMaxY}
          x2={chartWidth - paddingRight}
          y2={thresholdMaxY}
          stroke="#3B82F6"
          strokeWidth={1.5}
          strokeDasharray="4, 4"
        />
        <SvgText
          x={chartWidth - paddingRight}
          y={thresholdMaxY - 4}
          fill="#3B82F6"
          fontSize={10}
          textAnchor="end"
          fontWeight="bold"
        >
          {`Máx ${thresholdMax}%`}
        </SvgText>

        {/* Main Moisture Line */}
        <Path d={pathD} fill="none" stroke="#10B981" strokeWidth={2.5} />

        {/* Data points */}
        {sorted.map((r, idx) => {
          const x = getX(idx);
          const y = getY(r.moisture_pct);
          const isLatest = idx === sorted.length - 1;

          return (
            <G key={`pt-${r.id || idx}`}>
              <Circle
                cx={x}
                cy={y}
                r={isLatest ? 5 : 3.5}
                fill={isLatest ? '#047857' : '#10B981'}
                stroke="#FFFFFF"
                strokeWidth={1.5}
              />
              {isLatest && (
                <SvgText
                  x={x}
                  y={y - 10}
                  fill="#065F46"
                  fontSize={11}
                  fontWeight="bold"
                  textAnchor="middle"
                >
                  {`${r.moisture_pct.toFixed(1)}%`}
                </SvgText>
              )}
            </G>
          );
        })}

        {/* X Axis Time Labels */}
        <SvgText x={paddingLeft} y={height - 8} fill="#9CA3AF" fontSize={10} textAnchor="start">
          -6h
        </SvgText>
        <SvgText x={chartWidth / 2} y={height - 8} fill="#9CA3AF" fontSize={10} textAnchor="middle">
          -3h
        </SvgText>
        <SvgText x={chartWidth - paddingRight} y={height - 8} fill="#065F46" fontSize={10} fontWeight="bold" textAnchor="end">
          Ahora
        </SvgText>
      </Svg>

      {/* Footer Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#10B981' }]} />
          <Text style={styles.legendText}>Humedad suelo</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDash, { borderColor: '#EF4444' }]} />
          <Text style={styles.legendText}>Umbral sequedad</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDash, { borderColor: '#3B82F6' }]} />
          <Text style={styles.legendText}>Umbral saturación</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  emptyContainer: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  emptyText: {
    color: '#6B7280',
    fontSize: 13,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 8,
    gap: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendDash: {
    width: 14,
    height: 0,
    borderTopWidth: 2,
    borderStyle: 'dashed',
  },
  legendText: {
    fontSize: 11,
    color: '#4B5563',
  },
});
