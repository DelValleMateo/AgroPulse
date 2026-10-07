import dotenv from 'dotenv';
dotenv.config();

export const config = {
  kafka: {
    brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
    clientId: process.env.KAFKA_CLIENT_ID || 'agropulse-service',
    topics: {
      soilMoisture: process.env.TOPIC_SOIL_MOISTURE || 'soil.moisture',
      weatherTick: process.env.TOPIC_WEATHER_TICK || 'weather.tick',
      irrigationCommands: process.env.TOPIC_IRRIGATION_COMMANDS || 'irrigation.commands',
      valveStatus: process.env.TOPIC_VALVE_STATUS || 'valve.status',
    }
  },
  supabase: {
    url: process.env.SUPABASE_URL || 'http://localhost:54321',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  },
  simulator: {
    port: parseInt(process.env.SIMULATOR_PORT || '4000', 10),
    tickIntervalMs: parseInt(process.env.TICK_INTERVAL_MS || '4000', 10),
    failureRate: parseFloat(process.env.VALVE_FAILURE_RATE || '0.0'), // 0.0 to 0.1
  }
};
