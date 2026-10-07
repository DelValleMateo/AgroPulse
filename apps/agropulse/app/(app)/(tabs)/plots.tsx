import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../../src/context/AuthContext';
import { supabase } from '../../../src/lib/supabase';
import { Plot, PlotStatus } from '../../../src/types/database';
import { calculateSemaphore } from '../../../src/services/semaphore';
import { SemaphoreBadge } from '../../../src/components/SemaphoreBadge';
import { Search, Plus, ChevronRight, Droplets, Thermometer, CloudRain } from 'lucide-react-native';

interface PlotItem extends Plot {
  status: PlotStatus;
  currentMoisture?: number;
  currentTemp?: number;
  currentRain?: number;
  lastMeasuredAt?: string;
  ageText?: string;
}

export default function PlotsTabScreen() {
  const router = useRouter();
  const { activeOrg, activeRole } = useAuth();

  const [plots, setPlots] = useState<PlotItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<'all' | PlotStatus>('all');

  const loadPlots = useCallback(async () => {
    if (!activeOrg) return;

    try {
      const { data: plotData, error: plotErr } = await supabase
        .from('plots')
        .select('*')
        .eq('organization_id', activeOrg.id)
        .order('name');

      if (plotErr || !plotData) return;

      const plotIds = plotData.map((p) => p.id);
      const { data: stationData } = await supabase
        .from('stations')
        .select('id, plot_id')
        .in('plot_id', plotIds);

      const stationIds = stationData?.map((s) => s.id) || [];
      const stationToPlot = new Map(stationData?.map((s) => [s.id, s.plot_id]) || []);

      const latestReadings = new Map<string, any>();
      if (stationIds.length > 0) {
        const { data: readings } = await supabase
          .from('readings')
          .select('station_id, moisture_pct, temp_c, rain_mm, measured_at')
          .in('station_id', stationIds)
          .order('measured_at', { ascending: false });

        if (readings) {
          readings.forEach((r) => {
            const pId = stationToPlot.get(r.station_id);
            if (pId && !latestReadings.has(pId)) {
              latestReadings.set(pId, r);
            }
          });
        }
      }

      const items: PlotItem[] = plotData.map((p: any) => {
        const r = latestReadings.get(p.id);
        const sem = calculateSemaphore(r?.measured_at, r?.moisture_pct, p.threshold_min, p.threshold_max);

        return {
          ...p,
          status: sem.status,
          currentMoisture: r?.moisture_pct,
          currentTemp: r?.temp_c,
          currentRain: r?.rain_mm,
          lastMeasuredAt: r?.measured_at,
          ageText: sem.ageText,
        };
      });

      setPlots(items);
    } catch (err) {
      console.error('Error loading plots:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeOrg]);

  useEffect(() => {
    loadPlots();
  }, [loadPlots]);

  const filteredPlots = plots.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.crop.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = selectedFilter === 'all' || p.status === selectedFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <View style={styles.container}>
      {/* Search and Filter Bar */}
      <View style={styles.topBar}>
        <View style={styles.searchWrapper}>
          <Search size={16} color="#9CA3AF" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar por lote o cultivo..."
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {/* Filter Pills */}
        <View style={styles.filterRow}>
          {[
            { id: 'all', label: 'Todos' },
            { id: 'dry', label: '🔴 Seco' },
            { id: 'optimal', label: '🟢 Óptimo' },
            { id: 'wet', label: '🔵 Húmedo' },
            { id: 'stale', label: '⚪ Sin datos' },
          ].map((f) => (
            <TouchableOpacity
              key={f.id}
              style={[styles.filterChip, selectedFilter === f.id && styles.filterChipActive]}
              onPress={() => setSelectedFilter(f.id as any)}
            >
              <Text style={[styles.filterChipText, selectedFilter === f.id && styles.filterChipTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Plot List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#059669" />
        </View>
      ) : (
        <FlatList
          data={filteredPlots}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadPlots(); }} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>No se encontraron lotes</Text>
              <Text style={styles.emptySubtitle}>Intenta ajustar el término de búsqueda o el filtro.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.plotCard}
              onPress={() => router.push({ pathname: '/plot/[id]', params: { id: item.id } })}
              activeOpacity={0.7}
            >
              <View style={styles.cardHeader}>
                <View>
                  <Text style={styles.plotName}>{item.name}</Text>
                  <Text style={styles.cropBadge}>{item.crop}</Text>
                </View>
                <SemaphoreBadge status={item.status} size="sm" />
              </View>

              <View style={styles.metricsRow}>
                <View style={styles.metricItem}>
                  <Droplets size={14} color="#059669" />
                  <Text style={styles.metricLabel}>Humedad:</Text>
                  <Text style={styles.metricValue}>
                    {item.currentMoisture !== undefined ? `${item.currentMoisture.toFixed(1)}%` : '--'}
                  </Text>
                </View>

                <View style={styles.metricItem}>
                  <Thermometer size={14} color="#D97706" />
                  <Text style={styles.metricLabel}>Temp:</Text>
                  <Text style={styles.metricValue}>
                    {item.currentTemp !== undefined ? `${item.currentTemp.toFixed(1)}°C` : '--'}
                  </Text>
                </View>

                <View style={styles.metricItem}>
                  <CloudRain size={14} color="#2563EB" />
                  <Text style={styles.metricLabel}>Lluvia:</Text>
                  <Text style={styles.metricValue}>
                    {item.currentRain !== undefined ? `${item.currentRain} mm` : '0 mm'}
                  </Text>
                </View>
              </View>

              <View style={styles.cardFooter}>
                <Text style={styles.ageText}>Lectura: {item.ageText}</Text>
                <View style={styles.viewDetailLink}>
                  <Text style={styles.viewDetailText}>Ver detalle y riego</Text>
                  <ChevronRight size={14} color="#059669" />
                </View>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {/* FAB Create Plot (RF-07) - only for producer */}
      {activeRole === 'producer' && (
        <TouchableOpacity
          style={styles.fabAdd}
          onPress={() => router.push('/plot-edit')}
          activeOpacity={0.8}
        >
          <Plus size={22} color="#FFFFFF" />
          <Text style={styles.fabAddText}>Nuevo Lote</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  topBar: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 42,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#111827',
  },
  filterRow: {
    flexDirection: 'row',
    marginTop: 10,
    gap: 6,
    flexWrap: 'wrap',
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  filterChipActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#059669',
  },
  filterChipText: {
    fontSize: 11,
    color: '#4B5563',
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#059669',
    fontWeight: '700',
  },
  listContent: {
    padding: 16,
    paddingBottom: 80,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 40,
    padding: 20,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#374151',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 4,
    textAlign: 'center',
  },
  plotCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  plotName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
  },
  cropBadge: {
    fontSize: 12,
    color: '#047857',
    fontWeight: '600',
    marginTop: 2,
  },
  metricsRow: {
    flexDirection: 'row',
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 10,
    justifyContent: 'space-around',
    marginBottom: 12,
  },
  metricItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metricLabel: {
    fontSize: 11,
    color: '#6B7280',
  },
  metricValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111827',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 10,
  },
  ageText: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  viewDetailLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewDetailText: {
    fontSize: 12,
    color: '#059669',
    fontWeight: '600',
  },
  fabAdd: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    backgroundColor: '#059669',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 24,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 6,
  },
  fabAddText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
