import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { supabase } from '../../../../src/lib/supabase';
import { fetchPlotCommandHistory, cancelPendingCommand } from '../../../../src/services/commandService';
import { IrrigationCommand } from '../../../../src/types/database';
import { Clock, CheckCircle, XCircle, Ban, RefreshCw, Calendar, User, ArrowRight } from 'lucide-react-native';

export default function PlotCommandHistoryScreen() {
  const { id: plotId } = useLocalSearchParams<{ id: string }>();

  const [commands, setCommands] = useState<IrrigationCommand[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    if (!plotId) return;

    try {
      const data = await fetchPlotCommandHistory(plotId);
      setCommands(data);
    } catch (err) {
      console.error('Error fetching history:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [plotId]);

  useEffect(() => {
    loadHistory();

    const channel = supabase
      .channel(`history_feed_${plotId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'irrigation_commands' },
        () => {
          loadHistory();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [plotId, loadHistory]);

  const handleCancel = async (cmdId: string) => {
    Alert.alert(
      'Cancelar Comando (RF-17)',
      '¿Deseas revocar este comando antes de que sea aplicado por el actuador?',
      [
        { text: 'No, mantener', style: 'cancel' },
        {
          text: 'Sí, cancelar',
          style: 'destructive',
          onPress: async () => {
            setCancellingId(cmdId);
            const res = await cancelPendingCommand(cmdId);
            setCancellingId(null);
            if (!res.success) {
              Alert.alert('Error', res.error || 'No se pudo cancelar el comando');
            } else {
              loadHistory();
            }
          },
        },
      ]
    );
  };

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'applied':
        return (
          <View style={[styles.statusPill, styles.statusApplied]}>
            <CheckCircle size={12} color="#065F46" />
            <Text style={styles.statusAppliedText}>Aplicado</Text>
          </View>
        );
      case 'pending':
        return (
          <View style={[styles.statusPill, styles.statusPending]}>
            <Clock size={12} color="#1D4ED8" />
            <Text style={styles.statusPendingText}>Pendiente</Text>
          </View>
        );
      case 'cancelled':
        return (
          <View style={[styles.statusPill, styles.statusCancelled]}>
            <Ban size={12} color="#4B5563" />
            <Text style={styles.statusCancelledText}>Cancelado</Text>
          </View>
        );
      case 'failed':
      default:
        return (
          <View style={[styles.statusPill, styles.statusFailed]}>
            <XCircle size={12} color="#991B1B" />
            <Text style={styles.statusFailedText}>Fallido</Text>
          </View>
        );
    }
  };

  const formatDate = (isoString: string) => {
    const d = new Date(isoString);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Historial de Comandos' }} />

      <View style={styles.container}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#059669" />
          </View>
        ) : (
          <FlatList
            data={commands}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadHistory(); }} />
            }
            ListHeaderComponent={
              <View style={styles.headerInfo}>
                <Text style={styles.headerTitle}>Últimos 20 Comandos Emitidos (RF-18)</Text>
                <Text style={styles.headerSubtitle}>
                  Registro auditable de órdenes enviadas a actuadores del lote.
                </Text>
              </View>
            }
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Clock size={40} color="#9CA3AF" />
                <Text style={styles.emptyTitle}>Sin comandos registrados</Text>
                <Text style={styles.emptySubtitle}>Aún no se han enviado órdenes de riego en este lote.</Text>
              </View>
            }
            renderItem={({ item }) => (
              <View style={styles.cmdCard}>
                <View style={styles.cmdHeader}>
                  <View style={styles.actionRow}>
                    <Text style={styles.actionText}>
                      Acción: {item.action === 'open' ? 'ABRIR RIEGO' : 'CERRAR VÁLVULA'}
                    </Text>
                    {item.action === 'open' && (
                      <Text style={styles.durationTag}>({item.duration_min} min)</Text>
                    )}
                  </View>
                  {renderStatusBadge(item.status)}
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.metaLabel}>Válvula:</Text>
                  <Text style={styles.metaVal}>{item.valves?.name || item.valve_id.slice(0, 8)}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Calendar size={13} color="#6B7280" />
                  <Text style={styles.metaVal}>{formatDate(item.created_at)}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.metaLabel}>UUID Solicitud:</Text>
                  <Text style={styles.codeVal}>{item.client_request_id.slice(0, 16)}...</Text>
                </View>

                {item.status === 'pending' && (
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={() => handleCancel(item.id)}
                    disabled={cancellingId === item.id}
                  >
                    {cancellingId === item.id ? (
                      <ActivityIndicator size="small" color="#DC2626" />
                    ) : (
                      <>
                        <Ban size={14} color="#DC2626" />
                        <Text style={styles.cancelButtonText}>Cancelar comando pendiente (RF-17)</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            )}
          />
        )}
      </View>
    </>
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
  headerInfo: {
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111827',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 50,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#374151',
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  cmdCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cmdHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
  },
  durationTag: {
    fontSize: 12,
    color: '#059669',
    fontWeight: '700',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  statusApplied: {
    backgroundColor: '#D1FAE5',
  },
  statusAppliedText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#065F46',
  },
  statusPending: {
    backgroundColor: '#DBEAFE',
  },
  statusPendingText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  statusCancelled: {
    backgroundColor: '#F3F4F6',
  },
  statusCancelledText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4B5563',
  },
  statusFailed: {
    backgroundColor: '#FEE2E2',
  },
  statusFailedText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#991B1B',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  metaLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  metaVal: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '500',
  },
  codeVal: {
    fontSize: 11,
    color: '#6B7280',
    fontFamily: 'monospace',
  },
  cancelButton: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  cancelButtonText: {
    color: '#DC2626',
    fontSize: 12,
    fontWeight: '700',
  },
});
