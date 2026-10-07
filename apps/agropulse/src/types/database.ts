export type UserRole = 'producer' | 'operator' | 'advisor';

export type PlotStatus = 'stale' | 'dry' | 'optimal' | 'wet';

export interface Coordinate {
  latitude: number;
  longitude: number;
}

export interface Organization {
  id: string;
  name: string;
  region: string;
  created_at?: string;
}

export interface Membership {
  id: string;
  user_id: string;
  organization_id: string;
  role: UserRole;
  organization?: Organization;
}

export interface Plot {
  id: string;
  organization_id: string;
  name: string;
  crop: string;
  geom: Coordinate[];
  threshold_min: number;
  threshold_max: number;
  created_at?: string;
}

export interface Station {
  id: string;
  plot_id: string;
  name: string;
  lat: number;
  lng: number;
  created_at?: string;
}

export interface Reading {
  id: string;
  station_id: string;
  measured_at: string;
  moisture_pct: number;
  temp_c: number;
  rain_mm: number;
  source: 'sensor' | 'manual';
  client_reading_id?: string;
  created_at?: string;
}

export type ValveStatus = 'open' | 'closed';

export interface Valve {
  id: string;
  plot_id: string;
  name: string;
  status: ValveStatus;
  updated_at?: string;
}

export type CommandStatus = 'pending' | 'applied' | 'failed' | 'cancelled';

export interface IrrigationCommand {
  id: string;
  valve_id: string;
  requested_by: string;
  action: 'open' | 'close';
  duration_min: number;
  status: CommandStatus;
  client_request_id: string;
  created_at: string;
  applied_at?: string;
  error_message?: string;
  valves?: {
    name: string;
    plot_id: string;
  };
}

export interface Alert {
  id: string;
  plot_id: string;
  type: 'dry' | 'stale';
  payload: {
    message?: string;
    moisture_pct?: number;
    threshold?: number;
    last_seen_min?: number;
  };
  created_at: string;
  read_at?: string;
}

export interface OfflineReading {
  client_reading_id: string;
  station_id: string;
  moisture_pct: number;
  temp_c: number;
  rain_mm: number;
  note?: string;
  lat?: number;
  lng?: number;
  measured_at: string;
  synced: boolean;
}
