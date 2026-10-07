import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../../src/context/AuthContext';
import { supabase } from '../../../src/lib/supabase';
import { AlertTriangle, Clock, CheckCheck, BellOff, ChevronRight } from 'lucide-react-native';

interface AlertItem {
  id: string;
  plot_id: string;
  plot_name: string;
  type: 'dry' | 'stale';
  payload: any;
  created_at: string;
  read_at?: string | null;
}

export default function AlertsTabScreen() {
  const router = useRouter();
  const { activeOrg } = useAuth();

  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadAlerts = useCallback(async () => {
    if (!activeOrg) return;

    try {
      // 1. Fetch plots of active organization
      const { data: plots } = await supabase
        .from('plots')
        .select('id, name')
        .eq('organization_id', activeOrg.id);

      if (!plots || plots.length === 0) {
        setAlerts([]);
        return;
      }

      const plotMap = new Map(plots.map((p) => [p.id, p.name]));
      const plotIds = plots.map((p) => p.id);

      // 2. Fetch alerts
      const { data: alertData, error } = await supabase
        .from('alerts')
        .select('*')
        .in('plot_id', plotIds)
        .order('created_at', { ascending: false });

      if (error || !alertData) return;

      const formatted: AlertItem[] = alertData.map((a: any) => ({
        ...a,
        plot_name: plotMap.get(a.plot_id) || 'Lote',
      }));

      setAlerts(formatted);
    } catch (err) {
      console.error('Error loading alerts:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeOrg]);

  useEffect(() => {
    loadAlerts();

    const channel = supabase
      .channel('realtime_alerts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts' }, () => {
        loadAlerts();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadAlerts]);

  const handleMarkAsRead = async (alertId: string) => {
    try {
      await supabase
        .from('alerts')
        .update({ read_at: new Date().toISOString() })
        .eq('id', alertId);

      setAlerts((prev) =>
        prev.map((a) => (a.id === alertId ? { ...a, read_at: new Date().toISOString() } : a))
      );
    } catch (err) {
      console.error('Failed to mark alert as read:', err);
    }
  };

  const getRelativeTime = (isoString: string) => {
    const diffMs = Date.now() - new Date(isoString).getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'hace un momento';
    if (diffMin < 60) return `hace ${diffMin} min`;
    const diffH = Math.floor(diffMin / 60);
    return `hace ${diffH} h`;
  };

  return (
    <View style={styles.container}>
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#059669" />
        </View>
      ) : (
        <FlatList
          data={alerts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadAlerts(); }} />
          }
          ListHeaderComponent={
            <View style={styles.headerBox}>
              <Text style={styles.headerTitle}>Bandeja de Eventos y Notificaciones</Text>
              <Text style={styles.headerSubtitle}>
                Monitoreo continuo de sequedad extrema (RF-19) y estaciones inactivas (RF-20).
              </Text>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <BellOff size={40} color="#9CA3AF" />
              <Text style={styles.emptyTitle}>Sin alertas pendientes</Text>
              <Text style={styles.emptySubtitle}>Todos los lotes reportan telemetría y niveles adecuados.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const isDry = item.type === 'dry';
            const isRead = Boolean(item.read_at);

            return (
              <View style={[styles.alertCard, isRead && styles.alertCardRead]}>
                <View style={styles.cardTop}>
                  <View style={styles.typeBadge}>
                    {isDry ? (
                      <AlertTriangle size={16} color="#B91C1C" />
                    ) : (
                      <Clock size={16} color="#4B5563" />
                    )}
                    <Text style={[styles.typeText, isDry ? styles.typeTextDry : styles.typeTextStale]}>
                      {isDry ? 'Alerta: Suelo Seco (RF-19)' : 'Aviso: Estación Inactiva (RF-20)'}
                    </Text>
                  </View>
                  <Text style={styles.timeText}>{getRelativeTime(item.created_at)}</Text>
                </View>

                <Text style={styles.plotTarget}>Lote: {item.plot_name}</Text>
                <Text style={styles.messageText}>
                  {item.payload?.message || (isDry ? 'Humedad por debajo del umbral mínimo.' : 'Sin ticks recibidos > 15 min.')}
                </Text>

                <View style={styles.cardActions}>
                  <TouchableOpacity
                    style={styles.inspectButton}
                    onPress={() => router.push({ pathname: '/plot/[id]', params: { id: item.plot_id } })}
                  >
                    <Text style={styles.inspectButtonText}>Inspeccionar lote</Text>
                    <ChevronRight size={14} color="#059669" />
                  </TouchableOpacity>

                  {!isRead && (
                    <TouchableOpacity
                      style={styles.markReadButton}
                      onPress={() => handleMarkAsRead(item.id)}
                    >
                      <CheckCheck size={14} color="#6B7280" />
                      <Text style={styles.markReadText}>Marcar leída</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  headerBox: {
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 60,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#374151',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
    maxWidth: 260,
  },
  alertCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  alertCardRead: {
    opacity: 0.7,
    backgroundColor: '#F9FAFB',
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  typeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  typeTextDry: {
    color: '#B91C1C',
  },
  typeTextStale: {
    color: '#4B5563',
  },
  timeText: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  plotTarget: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  messageText: {
    fontSize: 13,
    color: '#4B5563',
    lineHeight: 18,
    marginBottom: 12,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 10,
  },
  inspectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  inspectButtonText: {
    fontSize: 13,
    color: '#059669',
    fontWeight: '700',
  },
  markReadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  markReadText: {
    fontSize: 12,
    color: '#6B7280',
  },
});
