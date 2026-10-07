import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { supabase } from '../../src/lib/supabase';
import {
  generateUUID,
  submitIrrigationCommand,
} from '../../src/services/commandService';
import {
  Clock,
  Droplets,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Hash,
  ShieldAlert,
} from 'lucide-react-native';

export default function CommandConfirmScreen() {
  const { plotId, plotName, valveId, valveName, currentStatus } = useLocalSearchParams<{
    plotId: string;
    plotName: string;
    valveId: string;
    valveName: string;
    currentStatus: 'open' | 'closed';
  }>();

  const router = useRouter();
  const { activeRole } = useAuth();

  const isCurrentlyOpen = currentStatus === 'open';
  const defaultAction = isCurrentlyOpen ? 'close' : 'open';

  const [action, setAction] = useState<'open' | 'close'>(defaultAction);
  const [durationMin, setDurationMin] = useState(30); // Default 30 min (H1 story)
  const [clientRequestId] = useState(() => generateUUID());

  const [hasExistingPending, setHasExistingPending] = useState(false);
  const [checkingPending, setCheckingPending] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [commandId, setCommandId] = useState<string | null>(null);
  const [commandStatus, setCommandStatus] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Check RF-16 on screen load
  useEffect(() => {
    async function checkPending() {
      if (!valveId) return;

      try {
        const { data: pendingList } = await supabase
          .from('irrigation_commands')
          .select('id, created_at')
          .eq('valve_id', valveId)
          .eq('status', 'pending');

        if (pendingList && pendingList.length > 0) {
          setHasExistingPending(true);
        }
      } catch (err) {
        console.warn('Error checking pending commands:', err);
      } finally {
        setCheckingPending(false);
      }
    }

    checkPending();
  }, [valveId]);

  // Realtime subscription for this specific command transitioning (RF-15)
  useEffect(() => {
    if (!commandId) return;

    const channel = supabase
      .channel(`command_status_${commandId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'irrigation_commands',
          filter: `id=eq.${commandId}`,
        },
        (payload) => {
          const updated = payload.new;
          setCommandStatus(updated.status);
          if (updated.status === 'applied') {
            setSubmitting(false);
          } else if (updated.status === 'failed') {
            setSubmitting(false);
            setErrorMessage(updated.error_message || 'El actuador no respondió a tiempo (valve_timeout)');
          }
        }
      )
      .subscribe();

    // Fallback polling every 1.5s in case of websocket delay (RF-15 <= 3s)
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from('irrigation_commands')
        .select('status, error_message')
        .eq('id', commandId)
        .single();

      if (data && data.status !== 'pending') {
        setCommandStatus(data.status);
        setSubmitting(false);
        if (data.status === 'failed') {
          setErrorMessage(data.error_message || 'Fallo de actuador');
        }
        clearInterval(interval);
      }
    }, 1500);

    // Timeout protection: prevent infinite spinner (RNF-05)
    const timeout = setTimeout(() => {
      if (submitting && commandStatus === 'pending') {
        setSubmitting(false);
        setErrorMessage('Tiempo de espera agotado sin acuse del actuador (timeout)');
      }
    }, 10000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [commandId, submitting, commandStatus]);

  const handleExecuteCommand = async () => {
    // 1. Role validation (H2 check)
    if (activeRole === 'advisor') {
      setErrorMessage('Permiso denegado (H2): El rol Asesor no tiene autorización para emitir comandos.');
      return;
    }

    // 2. RF-16 validation check
    if (hasExistingPending) {
      setErrorMessage('No se permite un segundo comando: ya existe una orden pendiente sobre esta válvula (RF-16).');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    setCommandStatus('pending');

    const result = await submitIrrigationCommand({
      valveId: valveId!,
      action,
      durationMin,
      clientRequestId,
    });

    if (!result.success) {
      setSubmitting(false);
      setErrorMessage(result.error || 'Error al emitir comando');
      if (result.error?.includes('Ya existe un comando')) {
        setHasExistingPending(true);
      }
    } else {
      setCommandId(result.commandId || null);
      setCommandStatus(result.status || 'pending');
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Confirmar Comando de Riego' }} />

      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        {/* Command Summary Card */}
        <View style={styles.card}>
          <Text style={styles.cardHeader}>Orden de Irrigación (RF-14)</Text>

          <View style={styles.summaryRow}>
            <Text style={styles.label}>Lote:</Text>
            <Text style={styles.value}>{plotName || 'Lote seleccionado'}</Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.label}>Válvula:</Text>
            <Text style={styles.value}>{valveName || 'Válvula seleccionada'}</Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.label}>Estado Actual:</Text>
            <Text style={[styles.value, { color: isCurrentlyOpen ? '#059669' : '#6B7280' }]}>
              {isCurrentlyOpen ? 'Abierta (Regando)' : 'Cerrada'}
            </Text>
          </View>

          {/* Action Choice */}
          <View style={styles.sectionDivider} />
          <Text style={styles.inputTitle}>Acción a ejecutar:</Text>
          <View style={styles.actionButtonGroup}>
            <TouchableOpacity
              style={[styles.actionChoiceBtn, action === 'open' && styles.actionChoiceBtnActive]}
              onPress={() => setAction('open')}
              disabled={submitting || commandStatus === 'applied'}
            >
              <Droplets size={16} color={action === 'open' ? '#FFFFFF' : '#059669'} />
              <Text style={[styles.actionChoiceText, action === 'open' && styles.actionChoiceTextActive]}>
                Abrir Riego
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionChoiceBtn, action === 'close' && styles.actionChoiceBtnCloseActive]}
              onPress={() => setAction('close')}
              disabled={submitting || commandStatus === 'applied'}
            >
              <Text style={[styles.actionChoiceText, action === 'close' && styles.actionChoiceTextActive]}>
                Cerrar Válvula
              </Text>
            </TouchableOpacity>
          </View>

          {/* Duration Selector (1-120 min) */}
          {action === 'open' && (
            <View style={styles.durationSection}>
              <Text style={styles.inputTitle}>Duración del Riego: {durationMin} minutos</Text>
              <View style={styles.durationChips}>
                {[15, 30, 45, 60, 90, 120].map((mins) => (
                  <TouchableOpacity
                    key={mins}
                    style={[styles.durationChip, durationMin === mins && styles.durationChipActive]}
                    onPress={() => setDurationMin(mins)}
                    disabled={submitting || commandStatus === 'applied'}
                  >
                    <Clock size={12} color={durationMin === mins ? '#FFFFFF' : '#4B5563'} />
                    <Text style={[styles.durationChipText, durationMin === mins && styles.durationChipTextActive]}>
                      {mins} min
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Idempotency identifier */}
          <View style={styles.idempotencyBox}>
            <Hash size={14} color="#6B7280" />
            <Text style={styles.idempotencyText}>
              client_request_id: {clientRequestId}
            </Text>
          </View>
        </View>

        {/* RF-16 Double Pending Warning */}
        {hasExistingPending && !commandStatus && (
          <View style={styles.rf16WarningBox}>
            <ShieldAlert size={20} color="#B91C1C" />
            <View style={{ flex: 1 }}>
              <Text style={styles.rf16WarningTitle}>Regla RF-16 Activada</Text>
              <Text style={styles.rf16WarningText}>
                No se permite un segundo comando pending sobre la misma válvula. Ya existe una orden en vuelo hacia este actuador.
              </Text>
            </View>
          </View>
        )}

        {/* Error message card */}
        {errorMessage && (
          <View style={styles.errorBox}>
            <XCircle size={20} color="#B91C1C" />
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        )}

        {/* In-flight / Status Transition Card (RF-15) */}
        {commandStatus && (
          <View
            style={[
              styles.statusCard,
              commandStatus === 'applied' && styles.statusCardSuccess,
              commandStatus === 'pending' && styles.statusCardPending,
              commandStatus === 'failed' && styles.statusCardFailed,
            ]}
          >
            {commandStatus === 'pending' && (
              <>
                <ActivityIndicator size="small" color="#2563EB" />
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={styles.statusTitlePending}>Comando en vuelo (pending)...</Text>
                  <Text style={styles.statusSub}>
                    Esperando confirmación del actuador en &le; 5 segundos (RF-15).
                  </Text>
                </View>
              </>
            )}

            {commandStatus === 'applied' && (
              <>
                <CheckCircle2 size={24} color="#059669" />
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={styles.statusTitleSuccess}>¡Comando Aplicado con Éxito!</Text>
                  <Text style={styles.statusSub}>
                    La válvula cambió a estado {action === 'open' ? 'ABIERTA' : 'CERRADA'}. El mapa y el detalle han sido actualizados vía Realtime.
                  </Text>
                </View>
              </>
            )}

            {commandStatus === 'failed' && (
              <>
                <XCircle size={24} color="#DC2626" />
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={styles.statusTitleFailed}>Comando Fallido</Text>
                  <Text style={styles.statusSub}>{errorMessage || 'Error en actuador'}</Text>
                </View>
              </>
            )}
          </View>
        )}

        {/* Submit Button */}
        {commandStatus !== 'applied' ? (
          <TouchableOpacity
            style={[
              styles.submitBtn,
              (submitting || hasExistingPending || checkingPending || activeRole === 'advisor') &&
                styles.submitBtnDisabled,
            ]}
            onPress={handleExecuteCommand}
            disabled={submitting || hasExistingPending || checkingPending || activeRole === 'advisor'}
          >
            {submitting ? (
              <View style={styles.btnRow}>
                <ActivityIndicator color="#FFFFFF" size="small" />
                <Text style={styles.submitBtnText}>Transmitiendo a Redpanda/Worker...</Text>
              </View>
            ) : (
              <Text style={styles.submitBtnText}>
                {hasExistingPending ? 'Comando Bloqueado (RF-16)' : 'Confirmar y Enviar Comando'}
              </Text>
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.replace({ pathname: '/plot/[id]', params: { id: plotId } })}
          >
            <Text style={styles.backBtnText}>Volver al Detalle del Lote</Text>
          </TouchableOpacity>
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
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 14,
  },
  cardHeader: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  label: {
    fontSize: 13,
    color: '#6B7280',
  },
  value: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  sectionDivider: {
    height: 1,
    backgroundColor: '#F3F4F6',
    marginVertical: 12,
  },
  inputTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 8,
  },
  actionButtonGroup: {
    flexDirection: 'row',
    gap: 10,
  },
  actionChoiceBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#059669',
    backgroundColor: '#F0FDF4',
    gap: 6,
  },
  actionChoiceBtnActive: {
    backgroundColor: '#059669',
  },
  actionChoiceBtnCloseActive: {
    backgroundColor: '#DC2626',
    borderColor: '#DC2626',
  },
  actionChoiceText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#059669',
  },
  actionChoiceTextActive: {
    color: '#FFFFFF',
  },
  durationSection: {
    marginTop: 14,
  },
  durationChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  durationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  durationChipActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  durationChipText: {
    fontSize: 12,
    color: '#4B5563',
    fontWeight: '600',
  },
  durationChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  idempotencyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 8,
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  idempotencyText: {
    fontSize: 10,
    color: '#6B7280',
    fontFamily: 'monospace',
  },
  rf16WarningBox: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  rf16WarningTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#991B1B',
  },
  rf16WarningText: {
    fontSize: 12,
    color: '#B91C1C',
    marginTop: 2,
    lineHeight: 16,
  },
  errorBox: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  errorText: {
    fontSize: 12,
    color: '#B91C1C',
    flex: 1,
    fontWeight: '600',
  },
  statusCard: {
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 1.5,
  },
  statusCardPending: {
    backgroundColor: '#EFF6FF',
    borderColor: '#93C5FD',
  },
  statusCardSuccess: {
    backgroundColor: '#ECFDF5',
    borderColor: '#6EE7B7',
  },
  statusCardFailed: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
  },
  statusTitlePending: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  statusTitleSuccess: {
    fontSize: 15,
    fontWeight: '800',
    color: '#065F46',
  },
  statusTitleFailed: {
    fontSize: 14,
    fontWeight: '700',
    color: '#991B1B',
  },
  statusSub: {
    fontSize: 11,
    color: '#4B5563',
    marginTop: 2,
  },
  submitBtn: {
    backgroundColor: '#059669',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  submitBtnDisabled: {
    backgroundColor: '#9CA3AF',
    shadowOpacity: 0,
    elevation: 0,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backBtn: {
    backgroundColor: '#059669',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  backBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
