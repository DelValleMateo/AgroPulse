import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { supabase } from '../../src/lib/supabase';
import { MapPin, Save, Layers, Sprout } from 'lucide-react-native';

export default function PlotEditScreen() {
  const router = useRouter();
  const { activeOrg, activeRole } = useAuth();

  const [name, setName] = useState('');
  const [crop, setCrop] = useState('Citrus');
  const [thresholdMin, setThresholdMin] = useState('25');
  const [thresholdMax, setThresholdMax] = useState('45');
  const [polygonJson, setPolygonJson] = useState(
    JSON.stringify(
      [
        { latitude: -31.385, longitude: -58.012 },
        { latitude: -31.385, longitude: -58.018 },
        { latitude: -31.391, longitude: -58.018 },
        { latitude: -31.391, longitude: -58.012 },
      ],
      null,
      2
    )
  );

  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (activeRole !== 'producer') {
      Alert.alert('Acceso Denegado', 'Solo los usuarios con rol Productor pueden dar de alta lotes.');
      return;
    }

    if (!name.trim()) {
      Alert.alert('Campo requerido', 'Por favor ingresa un nombre para el lote.');
      return;
    }

    let parsedGeom: any;
    try {
      parsedGeom = JSON.parse(polygonJson);
      if (!Array.isArray(parsedGeom) || parsedGeom.length < 3) {
        throw new Error('El polígono debe tener al menos 3 vértices {latitude, longitude}.');
      }
    } catch (err: any) {
      Alert.alert('Error en Polígono (GeoJSON)', err.message || 'Formato JSON inválido.');
      return;
    }

    setSaving(true);

    try {
      // 1. Insert plot
      const { data: newPlot, error: plotErr } = await supabase
        .from('plots')
        .insert({
          organization_id: activeOrg!.id,
          name: name.trim(),
          crop: crop.trim(),
          geom: parsedGeom,
          threshold_min: parseFloat(thresholdMin) || 25,
          threshold_max: parseFloat(thresholdMax) || 45,
        })
        .select()
        .single();

      if (plotErr || !newPlot) {
        throw new Error(plotErr?.message || 'Error al guardar el lote');
      }

      // 2. Automatically create associated station and valve
      const centerLat = parsedGeom[0].latitude;
      const centerLng = parsedGeom[0].longitude;

      await supabase.from('stations').insert({
        plot_id: newPlot.id,
        name: `Estación ${newPlot.name}`,
        lat: centerLat,
        lng: centerLng,
      });

      await supabase.from('valves').insert({
        plot_id: newPlot.id,
        name: `Válvula ${newPlot.name}`,
        status: 'closed',
      });

      setSaving(false);
      Alert.alert('Éxito', `Lote "${newPlot.name}" creado con éxito.`, [
        { text: 'Aceptar', onPress: () => router.replace('/(app)/(tabs)/plots') },
      ]);
    } catch (err: any) {
      setSaving(false);
      Alert.alert('Error', err.message);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Alta de Lote (RF-07)' }} />

      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        <View style={styles.banner}>
          <Layers size={18} color="#059669" />
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerTitle}>Editor de Lote & Geometría (RF-07)</Text>
            <Text style={styles.bannerText}>
              Permite configurar el polígono de 4 vértices del nuevo lote en la organización activa.
            </Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Nombre del Lote:</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej: Costa 3 / Cuadro Norte"
            value={name}
            onChangeText={setName}
          />

          <Text style={styles.label}>Cultivo:</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej: Citrus, Soja, Arándanos, Maíz"
            value={crop}
            onChangeText={setCrop}
          />

          <View style={styles.thresholdsRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Umbral Mínimo (%):</Text>
              <TextInput
                style={styles.input}
                value={thresholdMin}
                onChangeText={setThresholdMin}
                keyboardType="numeric"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Umbral Máximo (%):</Text>
              <TextInput
                style={styles.input}
                value={thresholdMax}
                onChangeText={setThresholdMax}
                keyboardType="numeric"
              />
            </View>
          </View>

          <Text style={styles.label}>Geometría (Vértices del Polígono en JSON):</Text>
          <TextInput
            style={[styles.input, styles.jsonInput]}
            value={polygonJson}
            onChangeText={setPolygonJson}
            multiline
            numberOfLines={8}
          />

          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <Save size={18} color="#FFFFFF" />
                <Text style={styles.saveBtnText}>Guardar Lote en Base de Datos</Text>
              </>
            )}
          </TouchableOpacity>
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
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    marginTop: 10,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 42,
    fontSize: 14,
    color: '#111827',
  },
  thresholdsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  jsonInput: {
    height: 140,
    textAlignVertical: 'top',
    padding: 10,
    fontFamily: 'monospace',
    fontSize: 12,
    backgroundColor: '#F8FAFC',
  },
  saveBtn: {
    backgroundColor: '#059669',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    paddingVertical: 12,
    marginTop: 20,
  },
  saveBtnDisabled: {
    opacity: 0.7,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
