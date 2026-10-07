-- AgroPulse Schema Initialization
-- Licenciatura en Sistemas de Información - 2026

-- 1. Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Create tables
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  region TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('producer', 'operator', 'advisor')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, organization_id)
);

CREATE TABLE IF NOT EXISTS plots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  crop TEXT NOT NULL,
  geom JSONB NOT NULL, -- Array of [lat, lng] or GeoJSON polygon
  threshold_min FLOAT NOT NULL DEFAULT 25.0,
  threshold_max FLOAT NOT NULL DEFAULT 45.0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plot_id UUID NOT NULL REFERENCES plots(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS readings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id UUID NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  measured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  moisture_pct FLOAT NOT NULL,
  temp_c FLOAT NOT NULL,
  rain_mm FLOAT NOT NULL DEFAULT 0.0,
  source TEXT NOT NULL DEFAULT 'sensor' CHECK (source IN ('sensor', 'manual')),
  client_reading_id UUID UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_readings_station_measured 
ON readings (station_id, measured_at DESC);

CREATE TABLE IF NOT EXISTS valves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plot_id UUID NOT NULL REFERENCES plots(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'closed' CHECK (status IN ('open', 'closed')),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS irrigation_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  valve_id UUID NOT NULL REFERENCES valves(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('open', 'close')),
  duration_min INT NOT NULL CHECK (duration_min BETWEEN 1 AND 120),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'failed', 'cancelled')),
  client_request_id UUID NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  applied_at TIMESTAMPTZ,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_irrigation_commands_valve_status
ON irrigation_commands (valve_id, status);

CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plot_id UUID NOT NULL REFERENCES plots(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('dry', 'stale')),
  payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  read_at TIMESTAMPTZ
);

-- 3. Enable Row Level Security (RLS) on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE plots ENABLE ROW LEVEL SECURITY;
ALTER TABLE stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE valves ENABLE ROW LEVEL SECURITY;
ALTER TABLE irrigation_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;

-- 4. Helper Security Functions
CREATE OR REPLACE FUNCTION get_user_org_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT organization_id FROM memberships WHERE user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION get_user_role_in_org(p_org_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT role FROM memberships WHERE user_id = auth.uid() AND organization_id = p_org_id LIMIT 1;
$$;

-- 5. RLS Policies

-- organizations
CREATE POLICY "Users can view organizations they belong to"
ON organizations FOR SELECT
USING (id IN (SELECT get_user_org_ids()));

-- memberships
CREATE POLICY "Users can view memberships of their organizations"
ON memberships FOR SELECT
USING (organization_id IN (SELECT get_user_org_ids()));

-- plots
CREATE POLICY "Users can view plots of their organizations"
ON plots FOR SELECT
USING (organization_id IN (SELECT get_user_org_ids()));

CREATE POLICY "Producers and operators can update plot thresholds"
ON plots FOR UPDATE
USING (
  organization_id IN (SELECT get_user_org_ids()) 
  AND get_user_role_in_org(organization_id) IN ('producer', 'operator')
);

CREATE POLICY "Producers can insert plots"
ON plots FOR INSERT
WITH CHECK (
  organization_id IN (SELECT get_user_org_ids())
  AND get_user_role_in_org(organization_id) = 'producer'
);

-- stations
CREATE POLICY "Users can view stations of their organizations"
ON stations FOR SELECT
USING (
  plot_id IN (SELECT id FROM plots WHERE organization_id IN (SELECT get_user_org_ids()))
);

-- readings
CREATE POLICY "Users can view readings of their organizations"
ON readings FOR SELECT
USING (
  station_id IN (
    SELECT s.id FROM stations s
    JOIN plots p ON s.plot_id = p.id
    WHERE p.organization_id IN (SELECT get_user_org_ids())
  )
);

CREATE POLICY "Members can insert manual readings"
ON readings FOR INSERT
WITH CHECK (
  source = 'manual'
  AND station_id IN (
    SELECT s.id FROM stations s
    JOIN plots p ON s.plot_id = p.id
    WHERE p.organization_id IN (SELECT get_user_org_ids())
  )
);

-- valves
CREATE POLICY "Users can view valves of their organizations"
ON valves FOR SELECT
USING (
  plot_id IN (SELECT id FROM plots WHERE organization_id IN (SELECT get_user_org_ids()))
);

-- irrigation_commands
CREATE POLICY "Users can view irrigation commands of their organizations"
ON irrigation_commands FOR SELECT
USING (
  valve_id IN (
    SELECT v.id FROM valves v
    JOIN plots p ON v.plot_id = p.id
    WHERE p.organization_id IN (SELECT get_user_org_ids())
  )
);

CREATE POLICY "Producers and operators can insert irrigation commands"
ON irrigation_commands FOR INSERT
WITH CHECK (
  auth.uid() = requested_by
  AND valve_id IN (
    SELECT v.id FROM valves v
    JOIN plots p ON v.plot_id = p.id
    WHERE p.organization_id IN (SELECT get_user_org_ids())
    AND get_user_role_in_org(p.organization_id) IN ('producer', 'operator')
  )
);

CREATE POLICY "Requesters can cancel their pending commands"
ON irrigation_commands FOR UPDATE
USING (
  requested_by = auth.uid()
  AND status = 'pending'
)
WITH CHECK (
  status = 'cancelled'
);

-- alerts
CREATE POLICY "Users can view alerts of their plots"
ON alerts FOR SELECT
USING (
  plot_id IN (SELECT id FROM plots WHERE organization_id IN (SELECT get_user_org_ids()))
);

CREATE POLICY "Users can update alert read status"
ON alerts FOR UPDATE
USING (
  plot_id IN (SELECT id FROM plots WHERE organization_id IN (SELECT get_user_org_ids()))
);

-- 6. RPC: submit_irrigation_command
CREATE OR REPLACE FUNCTION submit_irrigation_command(
  p_valve_id UUID,
  p_action TEXT,
  p_duration_min INT,
  p_client_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_plot_id UUID;
  v_org_id UUID;
  v_role TEXT;
  v_existing_cmd RECORD;
  v_pending_count INT;
  v_new_cmd_id UUID;
BEGIN
  -- 1. Get plot and organization of the valve
  SELECT v.plot_id, p.organization_id INTO v_plot_id, v_org_id
  FROM valves v
  JOIN plots p ON v.plot_id = p.id
  WHERE v.id = p_valve_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Válvula no encontrada' USING ERRCODE = 'P0002';
  END IF;

  -- 2. Validate membership and role
  SELECT role INTO v_role
  FROM memberships
  WHERE user_id = auth.uid() AND organization_id = v_org_id;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Acceso denegado: no pertenece al establecimiento' USING ERRCODE = '42501';
  END IF;

  IF v_role NOT IN ('producer', 'operator') THEN
    RAISE EXCEPTION 'Permiso insuficiente: los asesores no pueden emitir comandos de riego' USING ERRCODE = '42501';
  END IF;

  -- 3. Check idempotency: if client_request_id already exists, return existing command
  SELECT * INTO v_existing_cmd
  FROM irrigation_commands
  WHERE client_request_id = p_client_request_id;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'id', v_existing_cmd.id,
      'status', v_existing_cmd.status,
      'valve_id', v_existing_cmd.valve_id,
      'action', v_existing_cmd.action,
      'duration_min', v_existing_cmd.duration_min,
      'client_request_id', v_existing_cmd.client_request_id,
      'message', 'Comando ya registrado previamente (idempotente)'
    );
  END IF;

  -- 4. Check RF-16: No se permite un segundo comando pending sobre la misma válvula
  SELECT COUNT(*) INTO v_pending_count
  FROM irrigation_commands
  WHERE valve_id = p_valve_id AND status = 'pending';

  IF v_pending_count > 0 THEN
    RAISE EXCEPTION 'Ya existe un comando pendiente para esta válvula' USING ERRCODE = 'P0001';
  END IF;

  -- 5. Insert command
  INSERT INTO irrigation_commands (
    valve_id,
    requested_by,
    action,
    duration_min,
    status,
    client_request_id
  ) VALUES (
    p_valve_id,
    auth.uid(),
    p_action,
    p_duration_min,
    'pending',
    p_client_request_id
  )
  RETURNING id INTO v_new_cmd_id;

  RETURN jsonb_build_object(
    'id', v_new_cmd_id,
    'status', 'pending',
    'valve_id', p_valve_id,
    'action', p_action,
    'duration_min', p_duration_min,
    'client_request_id', p_client_request_id,
    'message', 'Comando registrado exitosamente'
  );
END;
$$;

-- 7. Setup Realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

ALTER PUBLICATION supabase_realtime ADD TABLE readings;
ALTER PUBLICATION supabase_realtime ADD TABLE valves;
ALTER PUBLICATION supabase_realtime ADD TABLE irrigation_commands;
ALTER PUBLICATION supabase_realtime ADD TABLE alerts;
ALTER PUBLICATION supabase_realtime ADD TABLE plots;
