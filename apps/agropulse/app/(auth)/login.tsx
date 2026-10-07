import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useAuth } from '../../src/context/AuthContext';
import { Sprout, Lock, Mail, AlertCircle, ShieldCheck } from 'lucide-react-native';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('productor@agropulse.test');
  const [password, setPassword] = useState('AgroPulse2026!');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      setErrorMessage('Por favor ingresa tu correo y contraseña');
      return;
    }

    setErrorMessage(null);
    setLoading(true);

    const { error } = await signIn(email, password);
    setLoading(false);

    if (error) {
      setErrorMessage(error.includes('Invalid') ? 'Credenciales incorrectas o usuario no encontrado' : error);
    }
  };

  const fillCredentials = (roleEmail: string) => {
    setEmail(roleEmail);
    setPassword('AgroPulse2026!');
    setErrorMessage(null);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Brand Header */}
        <View style={styles.header}>
          <View style={styles.logoCircle}>
            <Sprout size={36} color="#FFFFFF" />
          </View>
          <Text style={styles.title}>AgroPulse</Text>
          <Text style={styles.subtitle}>Agricultura de Precisión & Telemetría IoT</Text>
          <Text style={styles.metaText}>Facultad de Ciencia y Tecnología — Lic. en Sistemas</Text>
        </View>

        {/* Login Form Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Iniciar Sesión</Text>

          {errorMessage && (
            <View style={styles.errorBox}>
              <AlertCircle size={18} color="#B91C1C" />
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          )}

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Correo Electrónico</Text>
            <View style={styles.inputWrapper}>
              <Mail size={18} color="#6B7280" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="ejemplo@agropulse.test"
                placeholderTextColor="#9CA3AF"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Contraseña</Text>
            <View style={styles.inputWrapper}>
              <Lock size={18} color="#6B7280" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="••••••••••••"
                placeholderTextColor="#9CA3AF"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />
            </View>
          </View>

          <TouchableOpacity
            style={[styles.loginButton, loading && styles.loginButtonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.loginButtonText}>Ingresar al Sistema</Text>
            )}
          </TouchableOpacity>

          {/* Quick Demo Selector */}
          <View style={styles.demoSection}>
            <View style={styles.demoHeader}>
              <ShieldCheck size={16} color="#059669" />
              <Text style={styles.demoTitle}>Cuentas de Prueba (Demo Cátedra)</Text>
            </View>
            <Text style={styles.demoSubtitle}>Toca para autocompletar credenciales:</Text>

            <View style={styles.chipRow}>
              <TouchableOpacity
                style={[styles.chip, email.includes('productor') && styles.chipActive]}
                onPress={() => fillCredentials('productor@agropulse.test')}
              >
                <Text style={[styles.chipText, email.includes('productor') && styles.chipTextActive]}>
                  👨‍🌾 Productor
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.chip, email.includes('operador') && styles.chipActive]}
                onPress={() => fillCredentials('operador@agropulse.test')}
              >
                <Text style={[styles.chipText, email.includes('operador') && styles.chipTextActive]}>
                  🔧 Operador
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.chip, email.includes('asesor') && styles.chipActive]}
                onPress={() => fillCredentials('asesor@agropulse.test')}
              >
                <Text style={[styles.chipText, email.includes('asesor') && styles.chipTextActive]}>
                  📋 Asesor (H2)
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Disclaimer / Ethics RNF-10 */}
        <Text style={styles.disclaimer}>
          Nota académica: Los datos de humedad, GPS y geometría son ficticios para fines didácticos en zona Concordia, Entre Ríos.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0FDF4',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logoCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#059669',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 6,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#064E3B',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: '#047857',
    fontWeight: '500',
    marginTop: 2,
  },
  metaText: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 4,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 16,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    padding: 10,
    borderRadius: 8,
    marginBottom: 16,
    gap: 8,
  },
  errorText: {
    color: '#991B1B',
    fontSize: 13,
    flex: 1,
  },
  inputGroup: {
    marginBottom: 14,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 12,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    height: 46,
    fontSize: 14,
    color: '#111827',
  },
  loginButton: {
    backgroundColor: '#059669',
    borderRadius: 10,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  loginButtonDisabled: {
    opacity: 0.7,
  },
  loginButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  demoSection: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  demoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  demoTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  demoSubtitle: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
    marginBottom: 10,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  chipActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#059669',
  },
  chipText: {
    fontSize: 12,
    color: '#4B5563',
    fontWeight: '500',
  },
  chipTextActive: {
    color: '#059669',
    fontWeight: '700',
  },
  disclaimer: {
    marginTop: 20,
    textAlign: 'center',
    fontSize: 11,
    color: '#6B7280',
    fontStyle: 'italic',
  },
});
