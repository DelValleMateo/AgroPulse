import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { AlertTriangle, CheckCircle, Clock, Droplet } from 'lucide-react-native';
import { PlotStatus } from '../types/database';
import { SEMAPHORE_CONFIG } from '../services/semaphore';

interface SemaphoreBadgeProps {
  status: PlotStatus;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
}

export const SemaphoreBadge: React.FC<SemaphoreBadgeProps> = ({
  status,
  label,
  size = 'md',
  showIcon = true,
}) => {
  const config = SEMAPHORE_CONFIG[status] || SEMAPHORE_CONFIG.stale;
  const displayLabel = label || config.shortLabel;

  const iconSize = size === 'sm' ? 12 : size === 'lg' ? 20 : 16;

  const renderIcon = () => {
    switch (status) {
      case 'dry':
        return <AlertTriangle size={iconSize} color={config.textColor} />;
      case 'optimal':
        return <CheckCircle size={iconSize} color={config.textColor} />;
      case 'wet':
        return <Droplet size={iconSize} color={config.textColor} />;
      case 'stale':
      default:
        return <Clock size={iconSize} color={config.textColor} />;
    }
  };

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: config.badgeBg, borderColor: config.color },
        size === 'sm' && styles.badgeSm,
        size === 'lg' && styles.badgeLg,
      ]}
      accessibilityRole="text"
      accessibilityLabel={`Estado: ${displayLabel}`}
    >
      {showIcon && <View style={styles.iconContainer}>{renderIcon()}</View>}
      <Text
        style={[
          styles.text,
          { color: config.textColor },
          size === 'sm' && styles.textSm,
          size === 'lg' && styles.textLg,
        ]}
      >
        {displayLabel}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1.5,
    alignSelf: 'flex-start',
  },
  badgeSm: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: 1,
  },
  badgeLg: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 2,
  },
  iconContainer: {
    marginRight: 6,
  },
  text: {
    fontWeight: '700',
    fontSize: 13,
  },
  textSm: {
    fontSize: 11,
  },
  textLg: {
    fontSize: 16,
  },
});
