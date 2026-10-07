import { Kafka } from 'kafkajs';
import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';

// Setup Supabase with Service Role Key (bypasses RLS for worker ingestion)
const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

const kafka = new Kafka({
  clientId: 'agropulse-backend-worker',
  brokers: config.kafka.brokers,
  retry: {
    initialRetryTime: 1000,
    retries: 10
  }
});

const consumer = kafka.consumer({ groupId: 'agropulse-ingest-group' });

// Cache for recent weather data to merge with soil moisture
const weatherCache = new Map<string, { rain_mm: number; ts: string }>();

async function startWorker() {
  console.log('⚙️ Starting AgroPulse Ingestion Worker...');
  console.log(`Connecting to Redpanda/Kafka brokers: ${config.kafka.brokers.join(', ')}`);
  console.log(`Target Supabase URL: ${config.supabase.url}`);

  try {
    await consumer.connect();
    console.log('Connected to Redpanda/Kafka broker.');

    await consumer.subscribe({ topic: config.kafka.topics.soilMoisture, fromBeginning: false });
    await consumer.subscribe({ topic: config.kafka.topics.weatherTick, fromBeginning: false });
    console.log(`Subscribed to topics: ${config.kafka.topics.soilMoisture}, ${config.kafka.topics.weatherTick}`);
  } catch (err) {
    console.error('Failed to initialize Kafka consumer:', err);
    console.log('Retrying in 5 seconds...');
    setTimeout(startWorker, 5000);
    return;
  }

  // 1. Kafka Consumer Loop (Telemetry -> Supabase)
  consumer.run({
    eachMessage: async ({ topic, message }) => {
      if (!message.value) return;

      try {
        const payload = JSON.parse(message.value.toString());

        if (topic === config.kafka.topics.weatherTick) {
          weatherCache.set(payload.station_id, {
            rain_mm: payload.rain_mm ?? 0.0,
            ts: payload.ts
          });
          return;
        }

        if (topic === config.kafka.topics.soilMoisture) {
          const { station_id, moisture_pct, temp_c, ts } = payload;
          const weather = weatherCache.get(station_id);
          const rain_mm = weather?.rain_mm ?? 0.0;

          console.log(`[CONSUMED] [${topic}] station_id=${station_id} moisture=${moisture_pct}% temp=${temp_c}°C`);

          // Insert reading into Supabase
          const { data, error } = await supabase
            .from('readings')
            .insert({
              station_id,
              moisture_pct,
              temp_c,
              rain_mm,
              source: 'sensor',
              measured_at: ts || new Date().toISOString()
            })
            .select('id')
            .single();

          if (error) {
            // If foreign key violates (unknown station_id), log and discard gracefully (PRD §10)
            console.warn(`[INGEST-WARN] station_id ${station_id} rejected by DB:`, error.message);
          } else {
            console.log(`[UPSERT READING] reading_id=${data.id} inserted for station=${station_id.slice(0, 8)}...`);
          }
        }
      } catch (err) {
        console.error('[ERROR] Failed processing Kafka message:', err);
      }
    }
  });

  // 2. Asynchronous Irrigation Command Actuator Loop (RF-14, RF-15)
  // Polls or listens to irrigation_commands table for 'pending' state
  setInterval(async () => {
    try {
      const { data: pendingCommands, error } = await supabase
        .from('irrigation_commands')
        .select('id, valve_id, action, duration_min, client_request_id, status')
        .eq('status', 'pending');

      if (error) {
        // Silently skip if table not yet migrated or connection warm-up
        return;
      }

      if (pendingCommands && pendingCommands.length > 0) {
        for (const cmd of pendingCommands) {
          console.log(`[COMMAND IN FLIGHT] Detected pending command id=${cmd.id} for valve=${cmd.valve_id} action=${cmd.action} (${cmd.duration_min} min)`);

          // Simulate actuator latency (1.5 - 3 seconds)
          await new Promise((res) => setTimeout(res, 2000));

          // Check if user cancelled the command while waiting (RF-17)
          const { data: currentCmd } = await supabase
            .from('irrigation_commands')
            .select('status')
            .eq('id', cmd.id)
            .single();

          if (currentCmd?.status === 'cancelled') {
            console.log(`[COMMAND CANCELLED] Command ${cmd.id} was cancelled by user. Skipping.`);
            continue;
          }

          // Optional 10% failure simulation if configured
          const shouldFail = Math.random() < config.simulator.failureRate;

          if (shouldFail) {
            console.warn(`⚠️ [ACTUATOR TIMEOUT] Command ${cmd.id} failed due to simulated valve_timeout`);
            await supabase
              .from('irrigation_commands')
              .update({
                status: 'failed',
                error_message: 'valve_timeout: No se recibió confirmación del actuador en 5s',
                applied_at: new Date().toISOString()
              })
              .eq('id', cmd.id);
          } else {
            // Apply valve status change
            const targetStatus = cmd.action === 'close' ? 'closed' : 'open';

            const { error: valveErr } = await supabase
              .from('valves')
              .update({ status: targetStatus, updated_at: new Date().toISOString() })
              .eq('id', cmd.valve_id);

            if (valveErr) {
              console.error(`[ERROR] Failed to update valve status:`, valveErr);
            }

            // Transition command to applied
            await supabase
              .from('irrigation_commands')
              .update({
                status: 'applied',
                applied_at: new Date().toISOString()
              })
              .eq('id', cmd.id);

            console.log(`✅ [VALVE COMMAND APPLIED] Valve ${cmd.valve_id} is now ${targetStatus}. Command ${cmd.id} marked applied.`);
          }
        }
      }
    } catch (err) {
      console.error('[ERROR] Error in command loop:', err);
    }
  }, 1500);

  // 3. Academic Data Retention (trim > 48h readings)
  setInterval(async () => {
    try {
      const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      const { count, error } = await supabase
        .from('readings')
        .delete({ count: 'exact' })
        .lt('measured_at', cutoff);

      if (!error && count && count > 0) {
        console.log(`🧹 [RETENTION] Trimmed ${count} historical readings older than 48 hours.`);
      }
    } catch (err) {
      // Ignore retention errors
    }
  }, 60 * 60 * 1000);
}

startWorker().catch(console.error);
