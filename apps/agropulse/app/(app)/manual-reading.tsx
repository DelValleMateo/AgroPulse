import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Switch,
} from 'react-native';
import { Stack } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { supabase } from '../../src/lib/supabase';
import { getCurrentDeviceLocation } from '../../src/services/geoService';
import {
  enqueueManualReading,
  flushOfflineQueue,
  getOfflineQueue,
} from '../../src/services/offlineQueue';
import { Station, OfflineReading } from '../../src/types/database';
import {
  WifiOff,
  Wifi,
  Navigation,
  Save,
  RefreshCw,
  Clock,
  CheckCircle2,
  FileText,
  Droplet,
} from 'lucide-react-native';

export default function ManualReadingScreen() {
  const { activeOrg } = useAuth();

  const [stations, setStations] = useState<Station[]>([]);
  const [selectedStationId, setSelectedStationId] = useState<string>('');
  const [moistureInput, setMoistureInput] = useState('22.0'); // 22% as specified in H3
  const [note, setNote] = useState('Medición con tensiómetro manual en lote');
  const [gpsLocation, setGpsLocation] = useState<{ lat: number; lng: number } | null>(null);

  const [simulateOffline, setSimulateOffline] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [queue, setQueue] = useState<OfflineReading[]>([]);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    async function loadStations() {
      if (!activeOrg) return;

      const { data: plotData } = await supabase
        .from('plots')
        .select('id')
        .eq('organization_id', activeOrg.id);

      if (plotData && plotData.length > 0) {
        const plotIds = plotData.map((p) => p.id);
        const { data: stationData } = await supabase
          .from('stations')
          .select('*')
          .in('plot_id', plotIds);

        if (stationData && stationData.length > 0) {
          setStations(stationData);
          setSelectedStationId(stationData[0].id);
        }
      }
    }

    async function loadQueue() {
      const q = await getOfflineQueue();
      setQueue(q);
    }

    loadStations();
    loadQueue();
  }, [activeOrg]);

  // Fetch current GPS automatically for the manual reading (RF-21)
  const handleGetLocation = async () => {
    const locResult = await getCurrentDeviceLocation();
    if (locResult.location) {
      setGpsLocation({
        lat: locResult.location.latitude,
        lng: locResult.location.longitude,
      });
      Alert.alert('GPS Capturado', `Lat: ${locResult.location.latitude.toFixed(4)}, Lng: ${locResult.location.longitude.toFixed(4)}`);
    } else {
      Alert.alert('Aviso', locResult.errorMessage || 'No se pudo obtener coordenadas GPS.');
    }
  };

  const handleSubmit = async () => {
    const val = parseFloat(moistureInput);
    if (isNaN(val) || val < 0 || val > 100) {
      Alert.alert('Error', 'Ingresa un porcentaje válido de humedad (0 - 100%).');
      return;
    }

    if (!selectedStationId) {
      Alert.alert('Error', 'Selecciona una estación de monitoreo.');
      return;
    }

    setSubmitting(true);

    const readingData = {
      station_id: selectedStationId,
      moisture_pct: val,
      temp_c: 24.0,
      rain_mm: 0.0,
      note,
      lat: gpsLocation?.lat,
      lng: gpsLocation?.lng,
      measured_at: new Date().toISOString(),
    };

    if (simulateOffline) {
      // Offline mode (H3): Enqueue locally
      const enqueued = await enqueueManualReading(readingData);
      setSubmitting(false);
      setQueue((prev) => [...prev, enqueued]);
      Alert.alert(
        'Modo Sin Señal (H3)',
        `Lectura manual de ${val}% encolada localmente en dispositivo.\nUUID: ${enqueued.client_reading_id.slice(0, 16)}...\nSe transmitirá automáticamente al volver la red.`
      );
    } else {
      // Online mode: Direct upsert to Supabase
      try {
        const enqueued = await enqueueManualReading(readingData);
        const flushResult = await flushOfflineQueue();
        setSubmitting(false);

        const updatedQ = await getOfflineQueue();
        setQueue(updatedQ);

        if (flushResult.errors.length > 0) {
          Alert.alert('Aviso', 'Error de red, la lectura quedó encolada localmente.');
        } else {
          Alert.alert('Lectura Registrada', `Lectura manual de ${val}% guardada y transmitida a Supabase.`);
        }
      } catch (err: any) {
        setSubmitting(false);
        Alert.alert('Error', err.message);
      }
    }
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    const result = await flushOfflineQueue();
    setSyncing(false);

    const updatedQ = await getOfflineQueue();
    setQueue(updatedQ);

    Alert.alert(
      'Sincronización de Campo (RF-21)',
      `Sincronizadas: ${result.syncedCount}\nPendientes: ${result.remainingCount}\n\nLos registros se insertaron mediante upsert sin duplicarse.`
    );
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Lectura Manual en Campo' }} />

      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        {/* Banner */}
        <View style={styles.banner}>
          <FileText size={18} color="#059669" />
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerTitle}>Degradación Offline & Lectura Manual (RF-21, H3)</Text>
            <Text style={styles.bannerText}>
              Permite cargar muestras cuando no hay cobertura 3G/4G en el lote. Los datos se encolan con UUID de cliente y se sincronizan al recuperar señal.
            </Text>
          </View>
        </View>

        {/* Offline Mode Simulator Toggle */}
        <View style={styles.simCard}>
          <View style={styles.simLeft}>
            {simulateOffline ? (
              <WifiOff size={22} color="#DC2626" />
            ) : (
              <Wifi size={22} color="#059669" />
            )}
            <View style={{ marginLeft: 10, flex: 1 }}>
              <Text style={styles.simTitle}>
                {simulateOffline ? 'Modo Sin Señal (OFFLINE)' : 'Modo Conectado (ONLINE)'}
              </Text>
              <Text style={styles.simSub}>
                {simulateOffline
                  ? 'Las lecturas se guardan en cola local (AsyncStorage)'
                  : 'Las lecturas se transmiten directamente al BaaS'}
              </Text>
            </View>
          </View>
          <Switch
            value={simulateOffline}
            onValueChange={setSimulateOffline}
            trackColor={{ false: '#D1D5DB', true: '#FCA5A5' }}
            thumbColor={simulateOffline ? '#DC2626' : '#059669'}
          />
        </View>

        {/* Form Card */}
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>Datos de la Muestra de Suelo</Text>

          {/* Station Selection */}
          <Text style={styles.label}>Estación / Punto de Medición:</Text>
          <View style={styles.stationsRow}>
            {stations.map((st) => (
              <TouchableOpacity
                key={st.id}
                style={[
                  styles.stationPill,
                  selectedStationId === st.id && styles.stationPillActive,
                ]}
                onPress={() => setSelectedStationId(st.id)}
              >
                <Text
                  style={[
                    styles.stationPillText,
                    selectedStationId === st.id && styles.stationPillTextActive,
                  ]}
                >
                  {st.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Moisture Input */}
          <Text style={styles.label}>Humedad Volumétrica Estimada (%):</Text>
          <View style={styles.inputWrapper}>
            <Droplet size={18} color="#059669" style={{ marginRight: 8 }} />
            <TextInput
              style={styles.input}
              value={moistureInput}
              onChangeText={setMoistureInput}
              keyboardType="numeric"
              placeholder="Ej: 22.0"
            />
          </View>

          {/* GPS Coordinates */}
          <Text style={styles.label}>Coordenadas GPS de Campo (RF-21):</Text>
          <View style={styles.gpsRow}>
            <Text style={styles.gpsText}>
              {gpsLocation
                ? `${gpsLocation.lat.toFixed(4)}, ${gpsLocation.lng.toFixed(4)}`
                : 'Sin coordenadas adjuntas'}
            </Text>
            <TouchableOpacity style={styles.gpsBtn} onPress={handleGetLocation}>
              <Navigation size={14} color="#059669" />
              <Text style={styles.gpsBtnText}>Tomar GPS</Text>
            </TouchableOpacity>
          </View>

          {/* Note Input */}
          <Text style={styles.label}>Nota u Observación Agronómica:</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={note}
            onChangeText={setNote}
            multiline
            numberOfLines={2}
            placeholder="Observaciones visuales de suelo..."
          />

          {/* Submit Button */}
          <TouchableOpacity
            style={[styles.saveBtn, submitting && styles.saveBtnDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <Save size={18} color="#FFFFFF" />
                <Text style={styles.saveBtnText}>
                  {simulateOffline ? 'Guardar en Cola Offline' : 'Registrar Lectura Manual'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Offline Queue Display */}
        <View style={styles.queueCard}>
          <View style={styles.queueHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Clock size={16} color="#4B5563" />
              <Text style={styles.queueTitle}>Cola Local de Lecturas ({queue.length})</Text>
            </View>
            {queue.length > 0 && !simulateOffline && (
              <TouchableOpacity
                style={[styles.flushBtn, syncing && styles.flushBtnDisabled]}
                onPress={handleSyncNow}
                disabled={syncing}
              >
                <RefreshCw size={14} color="#FFFFFF" />
                <Text style={styles.flushBtnText}>Sincronizar</Text>
              </TouchableOpacity>
            )}
          </View>

          {queue.length === 0 ? (
            <Text style={styles.queueEmptyText}>
              No hay lecturas pendientes en la cola local del dispositivo.
            </Text>
          ) : (
            queue.map((item, idx) => (
              <View key={item.client_reading_id || idx} style={styles.queueItem}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.queueItemTitle}>
                    Humedad: <Text style={{ fontWeight: '800' }}>{item.moisture_pct}%</Text>
                  </Text>
                  <Text style={styles.queueItemSub}>
                    UUID: {item.client_reading_id?.slice(0, 16)}...
                  </Text>
                  <Text style={styles.queueItemSub}>
                    Hora: {new Date(item.measured_at).toLocaleTimeString()}
                  </Text>
                </View>
                <View style={styles.queueStatusBadge}>
                  <Text style={styles.queueStatusText}>Encolada</Text>
                </View>
              </View>
            ))
          )}
        </View>
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
  banner: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  bannerTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#065F46',
  },
  bannerText: {
    fontSize: 11,
    color: '#047857',
    marginTop: 2,
    lineHeight: 16,
  },
  simCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  simLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  simTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#111827',
  },
  simSub: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
  },
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 14,
  },
  formTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 12,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    marginTop: 10,
    marginBottom: 6,
  },
  stationsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  stationPill: {
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  stationPillActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#059669',
  },
  stationPillText: {
    fontSize: 11,
    color: '#4B5563',
    fontWeight: '500',
  },
  stationPillTextActive: {
    color: '#059669',
    fontWeight: '700',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 44,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: '#111827',
  },
  textArea: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 10,
    height: 60,
    textAlignVertical: 'top',
  },
  gpsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  gpsText: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '500',
  },
  gpsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  gpsBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  saveBtn: {
    backgroundColor: '#059669',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    paddingVertical: 12,
    marginTop: 18,
  },
  saveBtnDisabled: {
    opacity: 0.7,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  queueCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  queueHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  queueTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
  },
  flushBtn: {
    backgroundColor: '#2563EB',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  flushBtnDisabled: {
    opacity: 0.7,
  },
  flushBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  queueEmptyText: {
    fontSize: 12,
    color: '#9CA3AF',
    fontStyle: 'italic',
  },
  queueItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  queueItemTitle: {
    fontSize: 13,
    color: '#111827',
  },
  queueItemSub: {
    fontSize: 10,
    color: '#6B7280',
    marginTop: 2,
  },
  queueStatusBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  queueStatusText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#B45309',
  },
});
