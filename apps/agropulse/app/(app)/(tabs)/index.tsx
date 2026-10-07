import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../../src/context/AuthContext';
import { supabase } from '../../../src/lib/supabase';
import { Plot, Coordinate } from '../../../src/types/database';
import { calculateSemaphore } from '../../../src/services/semaphore';
import { getCurrentDeviceLocation, isPointInPolygon } from '../../../src/services/geoService';
import { MapViewComponent, PlotWithStatus } from '../../../src/components/MapViewComponent';
import { SemaphoreBadge } from '../../../src/components/SemaphoreBadge';
import { Navigation, AlertCircle, RefreshCw, ChevronRight, Check } from 'lucide-react-native';

export default function MapTabScreen() {
  const router = useRouter();
  const { activeOrg, activeRole, setLastTickTime } = useAuth();

  const [plots, setPlots] = useState<PlotWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userLocation, setUserLocation] = useState<Coordinate | null>(null);
  const [locationStatus, setLocationStatus] = useState<string | null>(null);
  const [activeLoteInside, setActiveLoteInside] = useState<string | null>(null);

  // Fetch plots and recent readings
  const loadMapData = useCallback(async () => {
    if (!activeOrg) return;

    try {
      // 1. Fetch plots for active establishment
      const { data: plotData, error: plotErr } = await supabase
        .from('plots')
        .select('*')
        .eq('organization_id', activeOrg.id);

      if (plotErr || !plotData) {
        console.error('Error fetching plots:', plotErr);
        return;
      }

      // 2. Fetch latest reading per station for these plots
      const plotIds = plotData.map((p) => p.id);
      const { data: stationData } = await supabase
        .from('stations')
        .select('id, plot_id')
        .in('plot_id', plotIds);

      const stationIds = stationData?.map((s) => s.id) || [];
      const stationToPlot = new Map(stationData?.map((s) => [s.id, s.plot_id]) || []);

      const latestReadingsByPlot = new Map<string, { moisture: number; measured_at: string }>();

      if (stationIds.length > 0) {
        const { data: readings } = await supabase
          .from('readings')
          .select('station_id, moisture_pct, measured_at')
          .in('station_id', stationIds)
          .order('measured_at', { ascending: false });

        if (readings) {
          readings.forEach((r) => {
            const pId = stationToPlot.get(r.station_id);
            if (pId && !latestReadingsByPlot.has(pId)) {
              latestReadingsByPlot.set(pId, {
                moisture: r.moisture_pct,
                measured_at: r.measured_at,
              });
            }
          });
        }
      }

      // 3. Compute semaphore and user inclusion for each plot
      const processed: PlotWithStatus[] = plotData.map((p: any) => {
        const latest = latestReadingsByPlot.get(p.id);
        const geom: Coordinate[] = Array.isArray(p.geom) ? p.geom : [];
        const semaphore = calculateSemaphore(
          latest?.measured_at,
          latest?.moisture,
          p.threshold_min,
          p.threshold_max
        );

        const inside = userLocation ? isPointInPolygon(userLocation, geom) : false;

        return {
          ...p,
          geom,
          status: semaphore.status,
          currentMoisture: latest?.moisture,
          isUserInside: inside,
        };
      });

      setPlots(processed);

      // Check if user is currently inside any plot
      const insidePlot = processed.find((p) => p.isUserInside);
      setActiveLoteInside(insidePlot ? insidePlot.name : null);
    } catch (err) {
      console.error('Failed to load map data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeOrg, userLocation]);

  useEffect(() => {
    loadMapData();

    // 4. Supabase Realtime subscription on readings & valves (RNF-04: <= 3s updates)
    const channel = supabase
      .channel('realtime_map_feed')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'readings' },
        (payload) => {
          setLastTickTime(new Date());
          loadMapData();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'valves' },
        () => {
          loadMapData();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'plots' },
        () => {
          loadMapData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeOrg, loadMapData, setLastTickTime]);

  // Handle GPS "Estoy en el lote" (RF-06)
  const handleCheckLocation = async () => {
    setLocationStatus('Obteniendo posición GPS...');
    const result = await getCurrentDeviceLocation();

    if (!result.hasPermission || !result.location) {
      setLocationStatus(result.errorMessage || 'Ubicación no disponible');
      return;
    }

    setUserLocation(result.location);

    // Test against all plots
    let foundInside: string | null = null;
    for (const p of plots) {
      if (isPointInPolygon(result.location, p.geom)) {
        foundInside = p.name;
        break;
      }
    }

    if (foundInside) {
      setLocationStatus(`¡Estás dentro del lote "${foundInside}"!`);
      setActiveLoteInside(foundInside);
    } else {
      setLocationStatus(`GPS obtenido (${result.location.latitude.toFixed(4)}, ${result.location.longitude.toFixed(4)}): Fuera de los lotes del establecimiento.`);
      setActiveLoteInside(null);
    }
  };

  const handleSelectPlot = (plot: PlotWithStatus) => {
    router.push({
      pathname: '/plot/[id]',
      params: { id: plot.id },
    });
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadMapData(); }} />
      }
    >
      {/* Header Info */}
      <View style={styles.topInfo}>
        <View>
          <Text style={styles.orgTitle}>{activeOrg?.name || 'Cargando establecimiento...'}</Text>
          <Text style={styles.orgSubtitle}>{activeOrg?.region || 'Región Concordia'}</Text>
        </View>
        <View style={styles.roleBadge}>
          <Text style={styles.roleText}>{activeRole?.toUpperCase() || 'USUARIO'}</Text>
        </View>
      </View>

      {/* GPS Location Status Banner (RF-06) */}
      {locationStatus && (
        <View style={[styles.locationBanner, activeLoteInside ? styles.locationSuccess : styles.locationInfo]}>
          {activeLoteInside ? (
            <Check size={16} color="#065F46" />
          ) : (
            <AlertCircle size={16} color="#1E40AF" />
          )}
          <Text style={[styles.locationBannerText, activeLoteInside ? styles.locationSuccessText : styles.locationInfoText]}>
            {locationStatus}
          </Text>
        </View>
      )}

      {/* Map Card */}
      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#059669" />
          <Text style={styles.loadingText}>Cargando coordenadas y telemetría...</Text>
        </View>
      ) : (
        <View style={styles.mapCard}>
          <MapViewComponent
            plots={plots}
            userLocation={userLocation}
            onSelectPlot={handleSelectPlot}
            height={340}
          />

          {/* FAB "Mi ubicación" (RF-06) */}
          <TouchableOpacity
            style={styles.fabLocation}
            onPress={handleCheckLocation}
            activeOpacity={0.8}
            accessibilityLabel="Verificar si estoy en el lote con mi ubicación GPS"
          >
            <Navigation size={18} color="#FFFFFF" />
            <Text style={styles.fabText}>¿Estoy en el lote?</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Plots Status Overview List */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Semáforo de Lotes ({plots.length})</Text>
        <Text style={styles.sectionHint}>Toca un lote para ver lecturas y regar</Text>
      </View>

      {plots.map((plot) => (
        <TouchableOpacity
          key={plot.id}
          style={styles.plotCard}
          onPress={() => handleSelectPlot(plot)}
          activeOpacity={0.7}
        >
          <View style={styles.plotCardLeft}>
            <View style={styles.plotNameRow}>
              <Text style={styles.plotName}>{plot.name}</Text>
              {plot.isUserInside && (
                <View style={styles.insidePill}>
                  <Text style={styles.insidePillText}>📍 En este lote</Text>
                </View>
              )}
            </View>
            <Text style={styles.cropText}>Cultivo: {plot.crop}</Text>
            <Text style={styles.moistureText}>
              Humedad actual:{' '}
              <Text style={styles.bold}>
                {plot.currentMoisture !== undefined ? `${plot.currentMoisture.toFixed(1)}%` : 'Sin datos'}
              </Text>{' '}
              (Umbrales: {plot.threshold_min}% - {plot.threshold_max}%)
            </Text>
          </View>

          <View style={styles.plotCardRight}>
            <SemaphoreBadge status={plot.status} size="sm" />
            <ChevronRight size={18} color="#9CA3AF" style={{ marginTop: 8 }} />
          </View>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  topInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  orgTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  orgSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  roleBadge: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  roleText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0369A1',
    letterSpacing: 0.5,
  },
  locationBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
    gap: 8,
  },
  locationSuccess: {
    backgroundColor: '#D1FAE5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  locationInfo: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  locationBannerText: {
    fontSize: 12,
    flex: 1,
    fontWeight: '500',
  },
  locationSuccessText: {
    color: '#065F46',
  },
  locationInfoText: {
    color: '#1E40AF',
  },
  mapCard: {
    position: 'relative',
    marginBottom: 16,
  },
  loadingBox: {
    height: 280,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 16,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 13,
    color: '#6B7280',
  },
  fabLocation: {
    position: 'absolute',
    bottom: 48,
    left: 14,
    backgroundColor: '#059669',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 5,
  },
  fabText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  sectionHeader: {
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
  },
  sectionHint: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
  },
  plotCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  plotCardLeft: {
    flex: 1,
    paddingRight: 10,
  },
  plotNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  plotName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  insidePill: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  insidePillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#047857',
  },
  cropText: {
    fontSize: 12,
    color: '#4B5563',
    marginBottom: 2,
  },
  moistureText: {
    fontSize: 11,
    color: '#6B7280',
  },
  bold: {
    fontWeight: '700',
    color: '#111827',
  },
  plotCardRight: {
    alignItems: 'flex-end',
  },
});
