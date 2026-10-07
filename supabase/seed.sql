-- AgroPulse Seed Data
-- Licenciatura en Sistemas de Información - 2026

-- 1. Insert Organizations
INSERT INTO organizations (id, name, region) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Estancia Didáctica Concordia', 'Concordia, Entre Ríos (Ficticio)'),
  ('22222222-2222-2222-2222-222222222222', 'Establecimiento El Palmar', 'Colón / El Palmar, Entre Ríos (Ficticio)')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, region = EXCLUDED.region;

-- 2. Insert Dummy Auth Users (Compatible with Supabase Local auth.users schema)
-- Password for all test users is: AgroPulse2026!
-- Bcrypt hash of 'AgroPulse2026!' is: $2a$10$w87jX7Fz8xV93qK8z6093.uL7jWkQeA1.qSkeJq7K9b0p1N6R4F4W
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'productor@agropulse.test', crypt('AgroPulse2026!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"name":"Juan Productor"}', now(), now()),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'operador@agropulse.test', crypt('AgroPulse2026!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"name":"Carlos Operador"}', now(), now()),
    ('cccccccc-cccc-cccc-cccc-cccccccccccc', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'asesor@agropulse.test', crypt('AgroPulse2026!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"name":"Ing. Agr. María Asesora"}', now(), now()),
    ('dddddddd-dddd-dddd-dddd-dddddddddddd', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ajeno@agropulse.test', crypt('AgroPulse2026!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"name":"Roberto Ajeno"}', now(), now())
    ON CONFLICT (id) DO NOTHING;

    -- GoTrue falla con "Database error querying schema" si los tokens son NULL o faltan las identities
    UPDATE auth.users SET
      confirmation_token = COALESCE(confirmation_token, ''),
      recovery_token = COALESCE(recovery_token, ''),
      email_change_token_new = COALESCE(email_change_token_new, ''),
      email_change = COALESCE(email_change, ''),
      email_change_token_current = COALESCE(email_change_token_current, ''),
      phone_change = COALESCE(phone_change, ''),
      phone_change_token = COALESCE(phone_change_token, ''),
      reauthentication_token = COALESCE(reauthentication_token, '')
    WHERE email LIKE '%@agropulse.test';

    INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    SELECT gen_random_uuid(), u.id, u.id::text, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), 'email', now(), now(), now()
    FROM auth.users u
    WHERE u.email LIKE '%@agropulse.test'
      AND NOT EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = u.id);
  END IF;
END $$;

-- 3. Insert Memberships
INSERT INTO memberships (id, user_id, organization_id, role) VALUES
  ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'producer'),
  ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'operator'),
  ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1', 'cccccccc-cccc-cccc-cccc-cccccccccccc', '11111111-1111-1111-1111-111111111111', 'advisor'),
  ('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1', 'dddddddd-dddd-dddd-dddd-dddddddddddd', '22222222-2222-2222-2222-222222222222', 'producer')
ON CONFLICT (user_id, organization_id) DO UPDATE SET role = EXCLUDED.role;

-- 4. Insert Plots (Estancia Didáctica Concordia)
-- Polygons around Concordia, Entre Ríos (-31.392, -58.020)
INSERT INTO plots (id, organization_id, name, crop, geom, threshold_min, threshold_max) VALUES
(
  '33333333-3333-3333-3333-333333333331',
  '11111111-1111-1111-1111-111111111111',
  'Costa 1',
  'Citrus',
  '[
    {"latitude": -31.3820, "longitude": -58.0120},
    {"latitude": -31.3820, "longitude": -58.0190},
    {"latitude": -31.3880, "longitude": -58.0190},
    {"latitude": -31.3880, "longitude": -58.0120}
  ]'::jsonb,
  25.0,
  45.0
),
(
  '33333333-3333-3333-3333-333333333332',
  '11111111-1111-1111-1111-111111111111',
  'Costa 2',
  'Citrus',
  '[
    {"latitude": -31.3900, "longitude": -58.0150},
    {"latitude": -31.3900, "longitude": -58.0250},
    {"latitude": -31.3970, "longitude": -58.0250},
    {"latitude": -31.3970, "longitude": -58.0150}
  ]'::jsonb,
  25.0,
  45.0
),
(
  '33333333-3333-3333-3333-333333333333',
  '11111111-1111-1111-1111-111111111111',
  'Monte A',
  'Soja',
  '[
    {"latitude": -31.4000, "longitude": -58.0200},
    {"latitude": -31.4000, "longitude": -58.0320},
    {"latitude": -31.4080, "longitude": -58.0320},
    {"latitude": -31.4080, "longitude": -58.0200}
  ]'::jsonb,
  20.0,
  40.0
),
(
  '33333333-3333-3333-3333-333333333334',
  '22222222-2222-2222-2222-222222222222',
  'Lote Norte (El Palmar)',
  'Arándanos',
  '[
    {"latitude": -31.8600, "longitude": -58.2100},
    {"latitude": -31.8600, "longitude": -58.2180},
    {"latitude": -31.8680, "longitude": -58.2180},
    {"latitude": -31.8680, "longitude": -58.2100}
  ]'::jsonb,
  22.0,
  42.0
)
ON CONFLICT (id) DO UPDATE SET 
  name = EXCLUDED.name, 
  crop = EXCLUDED.crop,
  geom = EXCLUDED.geom,
  threshold_min = EXCLUDED.threshold_min,
  threshold_max = EXCLUDED.threshold_max;

-- 5. Insert Stations
INSERT INTO stations (id, plot_id, name, lat, lng) VALUES
  ('44444444-4444-4444-4444-444444444441', '33333333-3333-3333-3333-333333333331', 'Estación Clima Costa 1', -31.3850, -58.0155),
  ('44444444-4444-4444-4444-444444444442', '33333333-3333-3333-3333-333333333332', 'Estación Suelo Costa 2', -31.3935, -58.0200),
  ('44444444-4444-4444-4444-444444444443', '33333333-3333-3333-3333-333333333333', 'Estación Monte A', -31.4040, -58.0260),
  ('44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333334', 'Estación Palmar 1', -31.8640, -58.2140)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, lat = EXCLUDED.lat, lng = EXCLUDED.lng;

-- 6. Insert Valves
INSERT INTO valves (id, plot_id, name, status) VALUES
  ('55555555-5555-5555-5555-555555555551', '33333333-3333-3333-3333-333333333331', 'Válvula Principal Costa 1', 'closed'),
  ('55555555-5555-5555-5555-555555555552', '33333333-3333-3333-3333-333333333332', 'Válvula Goteo Costa 2', 'closed'),
  ('55555555-5555-5555-5555-555555555553', '33333333-3333-3333-3333-333333333333', 'Válvula Aspersión Monte A', 'closed')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = EXCLUDED.status;

-- 7. Insert Initial Readings (Last 6 hours, 12+ points)
-- Costa 1: Óptimo (~32%)
-- Costa 2: Seco (~18%, para activar alerta y flujo de riego H1)
-- Monte A: Stale (última medición hace > 25 minutos)
DO $$
DECLARE
  v_i INT;
  v_time TIMESTAMPTZ;
BEGIN
  -- Generate 12 historical points for Costa 1 (Optimal)
  FOR v_i IN 0..11 LOOP
    v_time := now() - (v_i * interval '30 minutes');
    INSERT INTO readings (station_id, measured_at, moisture_pct, temp_c, rain_mm, source)
    VALUES ('44444444-4444-4444-4444-444444444441', v_time, 32.0 + (sin(v_i) * 2.5), 24.5 - (v_i * 0.3), 0.0, 'sensor');
  END LOOP;

  -- Generate 12 historical points for Costa 2 (Dry, ~18%)
  FOR v_i IN 0..11 LOOP
    v_time := now() - (v_i * interval '30 minutes');
    INSERT INTO readings (station_id, measured_at, moisture_pct, temp_c, rain_mm, source)
    VALUES ('44444444-4444-4444-4444-444444444442', v_time, 18.0 + (cos(v_i) * 1.5), 26.0 - (v_i * 0.2), 0.0, 'sensor');
  END LOOP;

  -- Generate historical points for Monte A, ending 25 minutes ago (Stale demo H4)
  FOR v_i IN 1..12 LOOP
    v_time := now() - (interval '25 minutes') - (v_i * interval '30 minutes');
    INSERT INTO readings (station_id, measured_at, moisture_pct, temp_c, rain_mm, source)
    VALUES ('44444444-4444-4444-4444-444444444443', v_time, 28.0 + (sin(v_i) * 3.0), 22.0 - (v_i * 0.2), 0.0, 'sensor');
  END LOOP;
END $$;

-- 8. Insert Initial Alerts
INSERT INTO alerts (id, plot_id, type, payload, created_at) VALUES
  (
    '66666666-6666-6666-6666-666666666661',
    '33333333-3333-3333-3333-333333333332',
    'dry',
    '{"message": "Humedad crítica detectada en Lote Costa 2 (18.2% < umbral 25%)", "moisture_pct": 18.2, "threshold": 25.0}'::jsonb,
    now() - interval '10 minutes'
  ),
  (
    '66666666-6666-6666-6666-666666666662',
    '33333333-3333-3333-3333-333333333333',
    'stale',
    '{"message": "La estación Monte A no reporta lecturas hace más de 15 minutos", "last_seen_min": 25}'::jsonb,
    now() - interval '5 minutes'
  )
ON CONFLICT (id) DO NOTHING;
