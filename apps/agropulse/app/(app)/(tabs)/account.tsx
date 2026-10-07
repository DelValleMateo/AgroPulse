import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../../src/context/AuthContext';
import { getOfflineQueue, flushOfflineQueue } from '../../../src/services/offlineQueue';
import {
  User,
  Building2,
  Shield,
  Activity,
  LogOut,
  WifiOff,
  RefreshCw,
  Info,
  ChevronRight,
} from 'lucide-react-native';

export default function AccountTabScreen() {
  const router = useRouter();
  const { user, activeOrg, activeRole, memberships, switchOrganization, signOut } = useAuth();

  const [offlineCount, setOfflineCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    async function checkQueue() {
      const q = await getOfflineQueue();
      setOfflineCount(q.filter((i) => !i.synced).length);
    }
    checkQueue();
  }, []);

  const handleSyncOffline = async () => {
    setSyncing(true);
    const result = await flushOfflineQueue();
    setSyncing(false);
    setOfflineCount(result.remainingCount);

    if (result.errors.length > 0) {
      Alert.alert('Sincronización con errores', result.errors.join('\n'));
    } else {
      Alert.alert('Sincronización exitosa', `Se sincronizaron ${result.syncedCount} lecturas.`);
    }
  };

  const handleLogout = () => {
    Alert.alert('Cerrar Sesión', '¿Estás seguro de que deseas salir de AgroPulse?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Cerrar Sesión', style: 'destructive', onPress: signOut },
    ]);
  };

  const getRoleBadgeColor = () => {
    switch (activeRole) {
      case 'producer':
        return { bg: '#ECFDF5', text: '#047857', border: '#A7F3D0', label: 'Productor (Total)' };
      case 'operator':
        return { bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE', label: 'Operador de Riego' };
      case 'advisor':
        return { bg: '#FEF3C7', text: '#B45309', border: '#FDE68A', label: 'Asesor Agrónomo (Solo Lectura)' };
      default:
        return { bg: '#F3F4F6', text: '#4B5563', border: '#E5E7EB', label: 'Usuario' };
    }
  };

  const roleStyle = getRoleBadgeColor();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      {/* User Info Card */}
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <User size={36} color="#FFFFFF" />
        </View>
        <Text style={styles.userName}>{user?.email || 'Usuario de Campo'}</Text>
        <Text style={styles.userId}>ID: {user?.id?.slice(0, 18)}...</Text>

        <View style={[styles.roleBadge, { backgroundColor: roleStyle.bg, borderColor: roleStyle.border }]}>
          <Shield size={14} color={roleStyle.text} />
          <Text style={[styles.roleBadgeText, { color: roleStyle.text }]}>{roleStyle.label}</Text>
        </View>
      </View>

      {/* Establishment Selector (RF-02 & RF-03) */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Building2 size={18} color="#111827" />
          <Text style={styles.sectionTitle}>Establecimiento Activo (RF-03)</Text>
        </View>

        {memberships.map((mem) => {
          const isSelected = activeOrg?.id === mem.organization_id;
          return (
            <TouchableOpacity
              key={mem.id}
              style={[styles.orgCard, isSelected && styles.orgCardSelected]}
              onPress={() => switchOrganization(mem.organization_id)}
            >
              <View style={styles.orgInfo}>
                <Text style={[styles.orgName, isSelected && styles.orgNameSelected]}>
                  {mem.organization?.name || 'Establecimiento'}
                </Text>
                <Text style={styles.orgRegion}>{mem.organization?.region}</Text>
                <Text style={styles.orgRoleTag}>Rol en este predio: {mem.role.toUpperCase()}</Text>
              </View>
              {isSelected && (
                <View style={styles.selectedPill}>
                  <Text style={styles.selectedPillText}>Activo</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Field & Diagnostics Options */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Herramientas de Campo & Diagnóstico</Text>

        {/* Offline Manual Reading Link (RF-21, H3) */}
        <TouchableOpacity
          style={styles.menuRow}
          onPress={() => router.push('/manual-reading')}
        >
          <View style={styles.menuRowLeft}>
            <View style={[styles.menuIcon, { backgroundColor: '#ECFDF5' }]}>
              <WifiOff size={18} color="#059669" />
            </View>
            <View>
              <Text style={styles.menuTitle}>Carga de Lectura Manual</Text>
              <Text style={styles.menuSubtitle}>Registrar humedad y GPS en campo sin señal (RF-21)</Text>
            </View>
          </View>
          <ChevronRight size={18} color="#9CA3AF" />
        </TouchableOpacity>

        {/* Sync Offline Queue */}
        {offlineCount > 0 && (
          <TouchableOpacity
            style={[styles.syncButton, syncing && styles.syncButtonDisabled]}
            onPress={handleSyncOffline}
            disabled={syncing}
          >
            <RefreshCw size={16} color="#FFFFFF" />
            <Text style={styles.syncButtonText}>
              {syncing ? 'Sincronizando...' : `Sincronizar ${offlineCount} lectura(s) pendientes`}
            </Text>
          </TouchableOpacity>
        )}

        {/* Diagnosis Screen (RF-23) */}
        <TouchableOpacity
          style={styles.menuRow}
          onPress={() => router.push('/diagnosis')}
        >
          <View style={styles.menuRowLeft}>
            <View style={[styles.menuIcon, { backgroundColor: '#EFF6FF' }]}>
              <Activity size={18} color="#2563EB" />
            </View>
            <View>
              <Text style={styles.menuTitle}>Diagnóstico y Observabilidad</Text>
              <Text style={styles.menuSubtitle}>Telemetría en tiempo real, latencia y Redpanda (RF-23)</Text>
            </View>
          </View>
          <ChevronRight size={18} color="#9CA3AF" />
        </TouchableOpacity>
      </View>

      {/* Logout */}
      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <LogOut size={18} color="#DC2626" />
        <Text style={styles.logoutText}>Cerrar Sesión</Text>
      </TouchableOpacity>

      {/* Academic Disclaimer RNF-10 */}
      <View style={styles.academicInfo}>
        <Info size={14} color="#6B7280" />
        <Text style={styles.academicText}>
          AgroPulse v1.0 — Licenciatura en Sistemas de Información (2026). Trabajo Práctico de Arquitectura y Desarrollo Móvil.
        </Text>
      </View>
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
  profileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  avatar: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#059669',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  userName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  userId: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    gap: 6,
    marginTop: 12,
    borderWidth: 1,
  },
  roleBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 10,
  },
  orgCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orgCardSelected: {
    borderColor: '#059669',
    backgroundColor: '#F0FDF4',
  },
  orgInfo: {
    flex: 1,
  },
  orgName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#374151',
  },
  orgNameSelected: {
    color: '#065F46',
  },
  orgRegion: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  orgRoleTag: {
    fontSize: 10,
    color: '#059669',
    fontWeight: '700',
    marginTop: 4,
  },
  selectedPill: {
    backgroundColor: '#059669',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  selectedPillText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  menuRow: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  menuRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  menuIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F2937',
  },
  menuSubtitle: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
  },
  syncButton: {
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  syncButtonDisabled: {
    opacity: 0.7,
  },
  syncButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  logoutButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEE2E2',
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  logoutText: {
    color: '#DC2626',
    fontSize: 14,
    fontWeight: '700',
  },
  academicInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 24,
    paddingHorizontal: 8,
  },
  academicText: {
    fontSize: 11,
    color: '#6B7280',
    flex: 1,
    lineHeight: 16,
  },
});
