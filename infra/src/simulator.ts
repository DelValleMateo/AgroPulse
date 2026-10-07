import { Kafka, Partitioners } from 'kafkajs';
import express from 'express';
import { config } from './config.js';

interface SimulatedStation {
  id: string;
  name: string;
  plotName: string;
  baseMoisture: number;
  currentMoisture: number;
  temp: number;
  rain: number;
  enabled: boolean;
  isIrrigating: boolean;
}

const stations: Record<string, SimulatedStation> = {
  '44444444-4444-4444-4444-444444444441': {
    id: '44444444-4444-4444-4444-444444444441',
    name: 'Estación Clima Costa 1',
    plotName: 'Costa 1',
    baseMoisture: 32.0, // Optimal (25 - 45%)
    currentMoisture: 32.0,
    temp: 24.5,
    rain: 0.0,
    enabled: true,
    isIrrigating: false
  },
  '44444444-4444-4444-4444-444444444442': {
    id: '44444444-4444-4444-4444-444444444442',
    name: 'Estación Suelo Costa 2',
    plotName: 'Costa 2',
    baseMoisture: 18.0, // Dry (< 25%)
    currentMoisture: 18.0,
    temp: 27.2,
    rain: 0.0,
    enabled: true,
    isIrrigating: false
  },
  '44444444-4444-4444-4444-444444444443': {
    id: '44444444-4444-4444-4444-444444444443',
    name: 'Estación Monte A',
    plotName: 'Monte A',
    baseMoisture: 28.0,
    currentMoisture: 28.0,
    temp: 23.0,
    rain: 0.0,
    enabled: false, // Default disabled to showcase STALE initial state (H4)
    isIrrigating: false
  }
};

const kafka = new Kafka({
  clientId: 'agropulse-iot-simulator',
  brokers: config.kafka.brokers,
  retry: {
    initialRetryTime: 1000,
    retries: 10
  }
});

const producer = kafka.producer({
  createPartitioner: Partitioners.LegacyPartitioner
});

async function runSimulator() {
  console.log('🌱 Starting AgroPulse IoT Simulator...');
  console.log(`Connecting to Redpanda/Kafka brokers: ${config.kafka.brokers.join(', ')}`);

  try {
    await producer.connect();
    console.log('Connected to Redpanda/Kafka broker successfully.');
  } catch (err) {
    console.error('Failed to connect to Kafka producer:', err);
    console.log('Retrying in 5 seconds...');
    setTimeout(runSimulator, 5000);
    return;
  }

  // Periodic tick loop
  setInterval(async () => {
    const ts = new Date().toISOString();

    for (const stationId of Object.keys(stations)) {
      const station = stations[stationId];
      if (!station.enabled) {
        // Station paused (sensor fallen / stale demo H4)
        continue;
      }

      // Small realistic variation with noise
      const noise = (Math.random() - 0.5) * 0.4;
      if (station.isIrrigating) {
        // If valve is open and irrigating, moisture gradually increases
        station.currentMoisture = Math.min(60, station.currentMoisture + 0.8 + noise);
      } else {
        // Natural slight oscillation
        station.currentMoisture = Math.max(5, Math.min(60, station.currentMoisture + noise));
      }

      const tempNoise = (Math.random() - 0.5) * 0.2;
      station.temp = Math.round((station.temp + tempNoise) * 10) / 10;
      station.currentMoisture = Math.round(station.currentMoisture * 10) / 10;

      const soilPayload = {
        station_id: station.id,
        moisture_pct: station.currentMoisture,
        temp_c: station.temp,
        ts
      };

      const weatherPayload = {
        station_id: station.id,
        rain_mm: station.rain,
        ts
      };

      try {
        await producer.send({
          topic: config.kafka.topics.soilMoisture,
          messages: [{ key: station.id, value: JSON.stringify(soilPayload) }]
        });
        console.log(`[PRODUCED] [${config.kafka.topics.soilMoisture}] ${station.plotName} (${station.id.slice(0, 8)}...): moisture=${soilPayload.moisture_pct}% temp=${soilPayload.temp_c}°C ts=${ts}`);

        await producer.send({
          topic: config.kafka.topics.weatherTick,
          messages: [{ key: station.id, value: JSON.stringify(weatherPayload) }]
        });
      } catch (err) {
        console.error(`Error sending message for station ${station.name}:`, err);
      }
    }
  }, config.simulator.tickIntervalMs);

  // Express control API
  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  app.get('/stations', (_req, res) => {
    res.json(Object.values(stations));
  });

  // RF-20 & H4: Pause station ticks to demonstrate Stale state
  app.post('/stations/:id/pause', (req, res) => {
    const station = stations[req.params.id];
    if (!station) return res.status(404).json({ error: 'Station not found' });
    station.enabled = false;
    console.log(`⏸️ [SIMULATOR] Paused ticks for station ${station.name} (${station.plotName})`);
    return res.json({ message: `Ticks paused for station ${station.name}`, station });
  });

  app.post('/stations/:id/resume', (req, res) => {
    const station = stations[req.params.id];
    if (!station) return res.status(404).json({ error: 'Station not found' });
    station.enabled = true;
    console.log(`▶️ [SIMULATOR] Resumed ticks for station ${station.name} (${station.plotName})`);
    return res.json({ message: `Ticks resumed for station ${station.name}`, station });
  });

  app.post('/stations/:id/irrigating', (req, res) => {
    const station = stations[req.params.id];
    if (!station) return res.status(404).json({ error: 'Station not found' });
    const { irrigating } = req.body;
    station.isIrrigating = Boolean(irrigating);
    console.log(`💧 [SIMULATOR] Irrigation status changed for ${station.name}: ${station.isIrrigating}`);
    return res.json({ station });
  });

  app.listen(config.simulator.port, () => {
    console.log(`📡 IoT Simulator Control API listening on http://localhost:${config.simulator.port}`);
  });
}

runSimulator().catch(console.error);
