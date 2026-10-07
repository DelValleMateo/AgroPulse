import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Stack } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { supabase } from '../../src/lib/supabase';
import {
  Activity,
  Server,
  User,
  Building2,
  Clock,
  Radio,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Cpu,
} from 'lucide-react-native';

export default function DiagnosisScreen() {
  const { user, activeOrg, activeRole, lastTickTime, setLastTickTime } = useAuth();

  const [realtimeState, setRealtimeState] = useState<'CONNECTING' | 'SUBSCRIBED' | 'DISCONNECTED'>('CONNECTING');
  const [lastReceivedReading, setLastReceivedReading] = useState<{
    station_id: string;
    moisture_pct: number;
    measured_at: string;
  } | null>(null);

  const [apparentLagMs, setApparentLagMs] = useState<number | null>(null);
  const [totalTicksCount, setTotalTicksCount] = useState(0);

  useEffect(() => {
    // 1. Fetch latest reading from DB to initialize
    async function fetchLatest() {
      const { data } = await supabase
        .from('readings')
        .select('station_id, moisture_pct, measured_at')
        .order('measured_at', { ascending: false })
        .limit(1)
        .single();

      if (data) {
        setLastReceivedReading(data);
        const diff = Date.now() - new Date(data.measured_at).getTime();
        setApparentLagMs(Math.max(0, diff));
      }
    }

    fetchLatest();

    // 2. Setup Realtime listener with latency tracker
    const channel = supabase
      .channel('diagnosis_realtime_tracker')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'readings' },
        (payload) => {
          const now = new Date();
          setLastTickTime(now);
          setTotalTicksCount((c) => c + 1);

          const r = payload.new;
          setLastReceivedReading(r);

          if (r.measured_at) {
            const lag = now.getTime() - new Date(r.measured_at).getTime();
            setApparentLagMs(Math.max(0, lag));
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setRealtimeState('SUBSCRIBED');
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          setRealtimeState('DISCONNECTED');
        } else {
          setRealtimeState('CONNECTING');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [setLastTickTime]);

  return (
    <>
      <Stack.Screen options={{ title: 'Diagnóstico & Observabilidad' }} />

      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        {/* Academic Card */}
        <View style={styles.academicBanner}>
          <Activity size={18} color="#059669" />
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerTitle}>Observabilidad Mínima (RF-23)</Text>
            <Text style={styles.bannerText}>
              Diagnóstico en vivo de la frontera móvil &harr; Supabase Realtime &harr; Redpanda Broker.
            </Text>
          </View>
        </View>

        {/* Realtime Status Card */}
        <View style={styles.metricCard}>
          <View style={styles.metricHeader}>
            <View style={styles.headerLeft}>
              <Radio size={18} color={realtimeState === 'SUBSCRIBED' ? '#059669' : '#D97706'} />
              <Text style={styles.cardTitle}>Canal Supabase Realtime</Text>
            </View>
            <View
              style={[
                styles.badge,
                realtimeState === 'SUBSCRIBED' ? styles.badgeSuccess : styles.badgeWarn,
              ]}
            >
              <Text
                style={[
                  styles.badgeText,
                  realtimeState === 'SUBSCRIBED' ? styles.badgeTextSuccess : styles.badgeTextWarn,
                ]}
              >
                {realtimeState}
              </Text>
            </View>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Ticks recibidos en esta sesión:</Text>
            <Text style={styles.valHighlight}>{totalTicksCount} eventos</Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Último tick recibido:</Text>
            <Text style={styles.val}>
              {lastTickTime ? lastTickTime.toLocaleTimeString() : 'Esperando telemetría...'}
            </Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Lag aparente (RNF-04):</Text>
            <Text style={[styles.val, apparentLagMs && apparentLagMs < 3000 ? styles.valSuccess : styles.valWarn]}>
              {apparentLagMs !== null ? `${(apparentLagMs / 1000).toFixed(2)} s` : '--'}
            </Text>
          </View>
          <Text style={styles.metricSub}>
            RNF-04 exige que el tick sea visible en UI &le; 3 s después del insert en DB.
          </Text>
        </View>

        {/* User Identity & Multi-tenant Context */}
        <View style={styles.metricCard}>
          <View style={styles.metricHeader}>
            <View style={styles.headerLeft}>
              <User size={18} color="#2563EB" />
              <Text style={styles.cardTitle}>Contexto de Autenticación & RLS</Text>
            </View>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Usuario ID (auth.uid()):</Text>
            <Text style={styles.monoVal}>{user?.id || 'No autenticado'}</Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Email del actor:</Text>
            <Text style={styles.val}>{user?.email || '--'}</Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Rol activo (RBAC):</Text>
            <Text style={[styles.val, { fontWeight: '700', color: '#059669' }]}>
              {activeRole?.toUpperCase() || 'DESCONOCIDO'}
            </Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Establecimiento activo:</Text>
            <Text style={styles.val}>{activeOrg?.name || '--'}</Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Organización ID:</Text>
            <Text style={styles.monoVal}>{activeOrg?.id || '--'}</Text>
          </View>
        </View>

        {/* Backend Streaming Topology */}
        <View style={styles.metricCard}>
          <View style={styles.metricHeader}>
            <View style={styles.headerLeft}>
              <Cpu size={18} color="#7C3AED" />
              <Text style={styles.cardTitle}>Topología de Streaming Backend</Text>
            </View>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Broker Eventos:</Text>
            <Text style={styles.val}>Redpanda v24 (API Kafka 9092)</Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Topics de Telemetría:</Text>
            <Text style={styles.monoVal}>soil.moisture | weather.tick</Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Worker Ingesta:</Text>
            <Text style={styles.val}>Node.js Consumer &rarr; Supabase Service Role</Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Cliente Móvil acoplado a Kafka:</Text>
            <Text style={[styles.val, { color: '#059669', fontWeight: '800' }]}>
              NO (Regla de Arquitectura OA-7)
            </Text>
          </View>
        </View>

        {/* Latest Reading Telemetry Raw Data */}
        {lastReceivedReading && (
          <View style={styles.metricCard}>
            <Text style={styles.cardTitle}>Última Lectura de Telemetría Recibida</Text>
            <View style={styles.codeBlock}>
              <Text style={styles.codeText}>
                {JSON.stringify(lastReceivedReading, null, 2)}
              </Text>
            </View>
          </View>
        )}
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
  academicBanner: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
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
  },
  metricCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  metricHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  badgeSuccess: {
    backgroundColor: '#D1FAE5',
  },
  badgeWarn: {
    backgroundColor: '#FEF3C7',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  badgeTextSuccess: {
    color: '#065F46',
  },
  badgeTextWarn: {
    color: '#92400E',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  label: {
    fontSize: 12,
    color: '#6B7280',
    flex: 1,
  },
  val: {
    fontSize: 12,
    fontWeight: '600',
    color: '#111827',
  },
  valSuccess: {
    color: '#059669',
    fontWeight: '700',
  },
  valWarn: {
    color: '#D97706',
    fontWeight: '700',
  },
  valHighlight: {
    fontSize: 13,
    fontWeight: '800',
    color: '#059669',
  },
  monoVal: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: '#374151',
  },
  metricSub: {
    fontSize: 10,
    color: '#9CA3AF',
    marginTop: 8,
    fontStyle: 'italic',
  },
  codeBlock: {
    backgroundColor: '#1E293B',
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
  },
  codeText: {
    color: '#38BDF8',
    fontSize: 11,
    fontFamily: 'monospace',
  },
});
