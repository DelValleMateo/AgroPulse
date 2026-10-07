import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useAuth } from '../../../src/context/AuthContext';
import { supabase } from '../../../src/lib/supabase';
import { Plot, Reading, Valve } from '../../../src/types/database';
import { calculateSemaphore, SemaphoreResult } from '../../../src/services/semaphore';
import { SemaphoreBadge } from '../../../src/components/SemaphoreBadge';
import { MoistureChart } from '../../../src/components/MoistureChart';
import {
  Droplets,
  Thermometer,
  CloudRain,
  Sliders,
  History,
  AlertTriangle,
  Play,
  Save,
  Check,
  Radio,
  Lock,
} from 'lucide-react-native';

export default function PlotDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { activeRole, setLastTickTime } = useAuth();

  const [plot, setPlot] = useState<Plot | null>(null);
  const [stationId, setStationId] = useState<string | null>(null);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [valves, setValves] = useState<Valve[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Threshold editing state (RF-11)
  const [minThresholdInput, setMinThresholdInput] = useState('25');
  const [maxThresholdInput, setMaxThresholdInput] = useState('45');
  const [savingThreshold, setSavingThreshold] = useState(false);

  const loadPlotDetails = useCallback(async () => {
    if (!id) return;

    try {
      // 1. Fetch plot info
      const { data: plotData, error: plotErr } = await supabase
        .from('plots')
        .select('*')
        .eq('id', id)
        .single();

      if (plotErr || !plotData) {
        console.error('Error fetching plot:', plotErr);
        return;
      }

      setPlot(plotData);
      setMinThresholdInput(String(plotData.threshold_min));
      setMaxThresholdInput(String(plotData.threshold_max));

      // 2. Fetch station
      const { data: stationData } = await supabase
        .from('stations')
        .select('id')
        .eq('plot_id', id)
        .limit(1)
        .single();

      if (stationData) {
        setStationId(stationData.id);

        // 3. Fetch readings for last 6-24 hours
        const { data: readingsData } = await supabase
          .from('readings')
          .select('*')
          .eq('station_id', stationData.id)
          .order('measured_at', { ascending: false })
          .limit(30);

        if (readingsData) {
          setReadings(readingsData);
        }
      }

      // 4. Fetch valves (RF-13)
      const { data: valveData } = await supabase
        .from('valves')
        .select('*')
        .eq('plot_id', id);

      if (valveData) {
        setValves(valveData);
      }
    } catch (err) {
      console.error('Error loading plot details:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    loadPlotDetails();

    // Setup Realtime subscriptions on readings and valves for this plot
    const channel = supabase
      .channel(`plot_realtime_${id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'readings' },
        (payload) => {
          if (stationId && payload.new.station_id === stationId) {
            setLastTickTime(new Date());
            setReadings((prev) => [payload.new as Reading, ...prev]);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'valves' },
        (payload) => {
          if (payload.new.plot_id === id) {
            setValves((prev) =>
              prev.map((v) => (v.id === payload.new.id ? (payload.new as Valve) : v))
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, stationId, loadPlotDetails, setLastTickTime]);

  // Derive latest reading and semaphore
  const latestReading = readings.length > 0 ? readings[0] : null;
  const semaphore: SemaphoreResult = calculateSemaphore(
    latestReading?.measured_at,
    latestReading?.moisture_pct,
    plot?.threshold_min,
    plot?.threshold_max
  );

  // Save threshold changes (RF-11)
  const handleSaveThreshold = async () => {
    if (!plot) return;

    if (activeRole === 'advisor') {
      Alert.alert('Acceso Denegado', 'Los usuarios con rol Asesor no pueden modificar umbrales.');
      return;
    }

    const min = parseFloat(minThresholdInput);
    const max = parseFloat(maxThresholdInput);

    if (isNaN(min) || isNaN(max) || min < 0 || max > 100 || min >= max) {
      Alert.alert('Valor inválido', 'El umbral mínimo debe ser menor al máximo y estar entre 0 y 100.');
      return;
    }

    setSavingThreshold(true);
    const { error } = await supabase
      .from('plots')
      .update({ threshold_min: min, threshold_max: max })
      .eq('id', plot.id);

    setSavingThreshold(false);

    if (error) {
      Alert.alert('Error al guardar', error.message);
    } else {
      setPlot((prev) => (prev ? { ...prev, threshold_min: min, threshold_max: max } : null));
      Alert.alert('Éxito', 'Umbrales de humedad actualizados correctamente.');
    }
  };

  const handleCommandPress = (valve: Valve) => {
    // H2: Asesor check
    if (activeRole === 'advisor') {
      Alert.alert(
        'Acceso Restringido (H2)',
        'Tu rol actual es Asesor Agrónomo (solo lectura). No tienes permiso para comandar actuadores ni válvulas de riego.',
        [{ text: 'Entendido' }]
      );
      return;
    }

    router.push({
      pathname: '/command-confirm',
      params: {
        plotId: plot?.id,
        plotName: plot?.name,
        valveId: valve.id,
        valveName: valve.name,
        currentStatus: valve.status,
      },
    });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#059669" />
      </View>
    );
  }

  if (!plot) {
    return (
      <View style={styles.notFoundContainer}>
        <Text style={styles.notFoundText}>Lote no encontrado</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: plot.name,
          headerBackTitle: 'Lotes',
          headerRight: () => (
            <TouchableOpacity
              onPress={() => router.push({ pathname: '/plot/[id]/history', params: { id: plot.id } })}
              style={styles.headerHistoryBtn}
            >
              <History size={20} color="#059669" />
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadPlotDetails();
            }}
          />
        }
      >
        {/* Top Status Header Card */}
        <View style={styles.headerCard}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.plotTitle}>{plot.name}</Text>
              <Text style={styles.cropSubtitle}>Cultivo: {plot.crop}</Text>
            </View>
            <SemaphoreBadge status={semaphore.status} label={semaphore.label} size="md" />
          </View>

          {/* Stale Warning Banner (RF-09, RF-20) */}
          {semaphore.status === 'stale' && (
            <View style={styles.staleAlertBanner}>
              <AlertTriangle size={16} color="#B45309" />
              <Text style={styles.staleAlertText}>
                ⚠️ Estación sin ticks &gt; 15 min ({semaphore.ageText}). Estado stale: datos no confiables para riego automático.
              </Text>
            </View>
          )}

          {/* Reading Metrics Box */}
          <View style={styles.telemetryGrid}>
            <View style={styles.telemetryCard}>
              <View style={styles.telemetryIconRow}>
                <Droplets size={16} color="#059669" />
                <Text style={styles.telemetryLabel}>Humedad Suelo</Text>
              </View>
              <Text style={styles.telemetryValue}>
                {latestReading ? `${latestReading.moisture_pct.toFixed(1)}%` : '--'}
              </Text>
              <Text style={styles.telemetrySub}>
                {latestReading ? semaphore.ageText : 'Sin señal'}
              </Text>
            </View>

            <View style={styles.telemetryCard}>
              <View style={styles.telemetryIconRow}>
                <Thermometer size={16} color="#D97706" />
                <Text style={styles.telemetryLabel}>Temperatura</Text>
              </View>
              <Text style={styles.telemetryValue}>
                {latestReading ? `${latestReading.temp_c.toFixed(1)}°C` : '--'}
              </Text>
              <Text style={styles.telemetrySub}>Ambiente</Text>
            </View>

            <View style={styles.telemetryCard}>
              <View style={styles.telemetryIconRow}>
                <CloudRain size={16} color="#2563EB" />
                <Text style={styles.telemetryLabel}>Lluvia</Text>
              </View>
              <Text style={styles.telemetryValue}>
                {latestReading ? `${latestReading.rain_mm} mm` : '0 mm'}
              </Text>
              <Text style={styles.telemetrySub}>Acumulada</Text>
            </View>
          </View>

          {/* Agronomic Rule Suggestion (RF-22) */}
          {semaphore.recommendation && (
            <View style={styles.recommendationBox}>
              <Text style={styles.recommendationTitle}>Recomendación Agronómica (RF-22):</Text>
              <Text style={styles.recommendationText}>{semaphore.recommendation}</Text>
            </View>
          )}
        </View>

        {/* Moisture Temporal Series Chart (RF-10) */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionHeading}>Serie Temporal de Humedad (Últimas 6 h)</Text>
            <View style={styles.realtimePulse}>
              <Radio size={14} color="#059669" />
              <Text style={styles.realtimeText}>Realtime</Text>
            </View>
          </View>
          <Text style={styles.chartSubtitle}>
            Monitoreo continuo de {readings.length} lecturas con límites de umbral.
          </Text>

          <MoistureChart
            readings={readings}
            thresholdMin={plot.threshold_min}
            thresholdMax={plot.threshold_max}
            height={190}
          />
        </View>

        {/* Valves & Irrigation Commands (RF-13, RF-14, H1, H2) */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionHeading}>Válvulas & Actuadores ({valves.length})</Text>
            {activeRole === 'advisor' && (
              <View style={styles.advisorNotice}>
                <Lock size={12} color="#B45309" />
                <Text style={styles.advisorNoticeText}>Solo lectura</Text>
              </View>
            )}
          </View>

          {valves.map((valve) => {
            const isOpen = valve.status === 'open';

            return (
              <View key={valve.id} style={styles.valveCard}>
                <View style={styles.valveInfo}>
                  <Text style={styles.valveName}>{valve.name}</Text>
                  <View style={styles.valveStatusPill}>
                    <View
                      style={[
                        styles.valveStatusDot,
                        { backgroundColor: isOpen ? '#059669' : '#6B7280' },
                      ]}
                    />
                    <Text style={[styles.valveStatusText, { color: isOpen ? '#065F46' : '#4B5563' }]}>
                      {isOpen ? 'Abierta (Regando)' : 'Cerrada'}
                    </Text>
                  </View>
                </View>

                {/* Irrigation CTA Button */}
                <TouchableOpacity
                  style={[
                    styles.commandButton,
                    isOpen ? styles.commandButtonStop : styles.commandButtonStart,
                    activeRole === 'advisor' && styles.commandButtonAdvisor,
                  ]}
                  onPress={() => handleCommandPress(valve)}
                >
                  <Play size={14} color="#FFFFFF" />
                  <Text style={styles.commandButtonText}>
                    {isOpen ? 'Cerrar Válvula' : 'Comandar Riego'}
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>

        {/* Threshold Configuration (RF-11) */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Sliders size={18} color="#111827" />
              <Text style={styles.sectionHeading}>Configurar Umbrales de Riego (RF-11)</Text>
            </View>
            {activeRole === 'advisor' && (
              <View style={styles.advisorNotice}>
                <Lock size={12} color="#B45309" />
                <Text style={styles.advisorNoticeText}>Bloqueado para Asesor</Text>
              </View>
            )}
          </View>
          <Text style={styles.chartSubtitle}>
            Determina los límites para la activación del semáforo (Seco vs Óptimo vs Saturado).
          </Text>

          <View style={styles.thresholdInputsRow}>
            <View style={styles.thresholdInputBox}>
              <Text style={styles.thresholdLabel}>Umbral Mínimo (%)</Text>
              <TextInput
                style={[styles.inputField, activeRole === 'advisor' && styles.inputFieldDisabled]}
                keyboardType="numeric"
                value={minThresholdInput}
                onChangeText={setMinThresholdInput}
                editable={activeRole !== 'advisor'}
              />
              <Text style={styles.thresholdHint}>Por debajo de este valor se considera Seco.</Text>
            </View>

            <View style={styles.thresholdInputBox}>
              <Text style={styles.thresholdLabel}>Umbral Máximo (%)</Text>
              <TextInput
                style={[styles.inputField, activeRole === 'advisor' && styles.inputFieldDisabled]}
                keyboardType="numeric"
                value={maxThresholdInput}
                onChangeText={setMaxThresholdInput}
                editable={activeRole !== 'advisor'}
              />
              <Text style={styles.thresholdHint}>Por encima se considera Suelo Húmedo.</Text>
            </View>
          </View>

          {activeRole !== 'advisor' && (
            <TouchableOpacity
              style={[styles.saveThresholdBtn, savingThreshold && styles.saveThresholdBtnDisabled]}
              onPress={handleSaveThreshold}
              disabled={savingThreshold}
            >
              {savingThreshold ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <Save size={16} color="#FFFFFF" />
                  <Text style={styles.saveThresholdBtnText}>Guardar Umbrales</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Link to Historical Commands (RF-18) */}
        <TouchableOpacity
          style={styles.historyLinkCard}
          onPress={() => router.push({ pathname: '/plot/[id]/history', params: { id: plot.id } })}
        >
          <View style={styles.historyLinkLeft}>
            <History size={18} color="#059669" />
            <Text style={styles.historyLinkText}>Ver Historial de los últimos 20 Comandos (RF-18)</Text>
          </View>
        </TouchableOpacity>
      </ScrollView>
    </>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notFoundContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notFoundText: {
    color: '#6B7280',
    fontSize: 16,
  },
  headerHistoryBtn: {
    padding: 8,
    marginRight: 4,
  },
  headerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  plotTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
  },
  cropSubtitle: {
    fontSize: 13,
    color: '#047857',
    fontWeight: '600',
    marginTop: 2,
  },
  staleAlertBanner: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 8,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  staleAlertText: {
    color: '#92400E',
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  telemetryGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  telemetryCard: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  telemetryIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
  },
  telemetryLabel: {
    fontSize: 10,
    color: '#6B7280',
    fontWeight: '600',
  },
  telemetryValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  telemetrySub: {
    fontSize: 10,
    color: '#9CA3AF',
    marginTop: 2,
  },
  recommendationBox: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 8,
    padding: 10,
  },
  recommendationTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#065F46',
    textTransform: 'uppercase',
  },
  recommendationText: {
    fontSize: 13,
    color: '#047857',
    fontWeight: '600',
    marginTop: 2,
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  sectionHeading: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  realtimePulse: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  realtimeText: {
    fontSize: 11,
    color: '#059669',
    fontWeight: '700',
  },
  chartSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 8,
  },
  advisorNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
  },
  advisorNoticeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#B45309',
  },
  valveCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  valveInfo: {
    flex: 1,
  },
  valveName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  valveStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  valveStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  valveStatusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  commandButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  commandButtonStart: {
    backgroundColor: '#059669',
  },
  commandButtonStop: {
    backgroundColor: '#DC2626',
  },
  commandButtonAdvisor: {
    backgroundColor: '#9CA3AF',
  },
  commandButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  thresholdInputsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 10,
  },
  thresholdInputBox: {
    flex: 1,
  },
  thresholdLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
  },
  inputField: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 40,
    fontSize: 14,
    backgroundColor: '#FFFFFF',
    color: '#111827',
  },
  inputFieldDisabled: {
    backgroundColor: '#F3F4F6',
    color: '#9CA3AF',
  },
  thresholdHint: {
    fontSize: 10,
    color: '#9CA3AF',
    marginTop: 4,
  },
  saveThresholdBtn: {
    backgroundColor: '#059669',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    borderRadius: 8,
    paddingVertical: 10,
    marginTop: 14,
  },
  saveThresholdBtnDisabled: {
    opacity: 0.7,
  },
  saveThresholdBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  historyLinkCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  historyLinkLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  historyLinkText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#059669',
  },
});
