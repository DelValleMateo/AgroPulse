# Checklist de Conformidad del PRD — AgroPulse (2026)

Este documento certifica el cumplimiento exhaustivo de todos los Requisitos Funcionales (**RF**), Requisitos No Funcionales (**RNF**), Historias de Usuario para Demo y Entregables estipulados en la especificación del Trabajo Práctico.

---

## 1. Requisitos Funcionales (RF)

| ID | Prioridad | Requisito | Estado | Ubicación en el Código / Evidencia |
| :---: | :---: | :--- | :---: | :--- |
| **RF-01** | **Must** | Login / logout con Supabase Auth. Sesión sobrevive a kill de la app. | ✅ **Cumplido** | `apps/agropulse/app/(auth)/login.tsx` y `src/lib/supabase.ts` con persistencia en `AsyncStorage`. |
| **RF-02** | **Must** | El usuario solo ve establecimientos a los que pertenece (aislamiento multi-tenant). | ✅ **Cumplido** | Políticas RLS en `supabase/migrations/20260101000000_init_schema.sql` y usuario de prueba `ajeno@agropulse.test`. |
| **RF-03** | **Must** | Selector de establecimiento si hay más de uno. | ✅ **Cumplido** | `apps/agropulse/app/(app)/(tabs)/account.tsx` (`switchOrganization`). Filtra mapa y lotes por predio activo. |
| **RF-04** | **Must** | Listar lotes (nombre, cultivo, estado semáforo). Mínimo 3 lotes en la semilla. | ✅ **Cumplido** | `apps/agropulse/app/(app)/(tabs)/plots.tsx`. Semilla con Costa 1, Costa 2 y Monte A en `supabase/seed.sql`. |
| **RF-05** | **Must** | Mapa con polígono por lote y color de estado. Tap en polígono abre detalle. | ✅ **Cumplido** | `apps/agropulse/src/components/MapViewComponent.tsx` y `app/(app)/(tabs)/index.tsx`. |
| **RF-06** | **Must** | "Estoy en el lote": verificar si GPS cae dentro del polígono. Sin permiso no crashea. | ✅ **Cumplido** | `apps/agropulse/src/services/geoService.ts` (`isPointInPolygon` Ray-casting y `getCurrentDeviceLocation`). |
| **RF-07** | **Should** | Alta/edición de lote (nombre + polígono simplificado / GeoJSON). | ✅ **Cumplido** | `apps/agropulse/app/(app)/plot-edit.tsx`. Restringido a rol `producer` mediante RLS. |
| **RF-08** | **Must** | Cada lote tiene &ge; 1 estación con moisture_pct, temp_c, rain_mm. | ✅ **Cumplido** | Modelado en `stations`, generado en semilla `seed.sql` y simulador IoT en `infra/src/simulator.ts`. |
| **RF-09** | **Must** | Detalle muestra última lectura y antigüedad. Si age &gt; 15 min pasa a `stale`. | ✅ **Cumplido** | `apps/agropulse/src/services/semaphore.ts` y detalle en `app/(app)/plot/[id].tsx`. |
| **RF-10** | **Must** | Gráfico de humedad de últimas 6 h (mínimo 12 puntos). Actualiza por Realtime o pull-to-refresh. | ✅ **Cumplido** | `apps/agropulse/src/components/MoistureChart.tsx` (SVG responsivo con umbrales y 12+ lecturas de semilla). |
| **RF-11** | **Must** | Umbral de humedad mínima configurable por lote. Persiste en Postgres. | ✅ **Cumplido** | `apps/agropulse/app/(app)/plot/[id].tsx` (`handleSaveThreshold`). Bloqueado para asesor y persistido en DB. |
| **RF-12** | **Must** | Semáforo: Stale (Gris), Dry (Rojo), Optimal (Verde), Wet (Azul). | ✅ **Cumplido** | `apps/agropulse/src/services/semaphore.ts` implementa con exactitud las reglas de PRD §08. |
| **RF-13** | **Must** | Listar válvulas del lote (nombre, estado open/closed). Mínimo 1 por lote. | ✅ **Cumplido** | `apps/agropulse/app/(app)/plot/[id].tsx`. Tabla `valves` con estados en vivo. |
| **RF-14** | **Must** | Emitir comando: abrir, cerrar, o abrir por duration_min (1–120). | ✅ **Cumplido** | `apps/agropulse/app/(app)/command-confirm.tsx` y `src/services/commandService.ts`. |
| **RF-15** | **Must** | El comando transiciona a applied o failed en &le; 5 s sin recargar app. | ✅ **Cumplido** | Worker `infra/src/worker.ts` aplica en 2s y la UI actualiza vía suscripción Supabase Realtime. |
| **RF-16** | **Must** | No se permite un segundo comando pending sobre la misma válvula. | ✅ **Cumplido** | Validación en cliente y Stored Procedure `submit_irrigation_command` con error explícito. |
| **RF-17** | **Should** | Cancelar comando pending. Pasa a cancelled; worker lo ignora. | ✅ **Cumplido** | `apps/agropulse/app/(app)/plot/[id]/history.tsx` y worker verifica `status !== 'cancelled'`. |
| **RF-18** | **Should** | Historial de los últimos 20 comandos del lote (fecha, actor, resultado). | ✅ **Cumplido** | `apps/agropulse/src/services/commandService.ts` (`fetchPlotCommandHistory`) y pantalla de historial. |
| **RF-19** | **Should** | Alerta in-app: humedad &lt; umbral. | ✅ **Cumplido** | `apps/agropulse/app/(app)/(tabs)/alerts.tsx` y banner en detalle de lote. |
| **RF-20** | **Should** | Alerta stale: estación sin ticks &gt; 15 min. Distinguible de seco. | ✅ **Cumplido** | Distinción visual explícita entre badge Rojo (Seco) y Gris (Stale). |
| **RF-21** | **Should** | Lectura manual: humedad + nota + GPS con cola offline y upsert sin duplicar. | ✅ **Cumplido** | `apps/agropulse/app/(app)/manual-reading.tsx` y `src/services/offlineQueue.ts` con `client_reading_id`. |
| **RF-22** | **Could** | Sugerencia agronómica: "Humedad bajo umbral: considerar riego". | ✅ **Cumplido** | Integrado en tarjeta de recomendación de `plot/[id].tsx`. |
| **RF-23** | **Must** | Pantalla Diagnóstico: usuario id, establecimiento, último tick, lag aparente. | ✅ **Cumplido** | `apps/agropulse/app/(app)/diagnosis.tsx`. |
| **RF-24** | **Must** | Logs del worker visibles en consola compose (`produced`/`consumed`/`upsert`). | ✅ **Cumplido** | Implementado en `infra/src/simulator.ts` y `infra/src/worker.ts`. |

---

## 2. Requisitos No Funcionales (RNF)

| ID | Prioridad | Categoría | Requisito y Criterio | Estado | Evidencia |
| :---: | :---: | :--- | :--- | :---: | :--- |
| **RNF-01** | **Must** | Stack | Expo SDK actual, TypeScript strict, Expo Router. | ✅ **Cumplido** | Expo SDK 52, `tsconfig.json` con `"strict": true`, Expo Router v4. |
| **RNF-02** | **Must** | Seguridad | Sin secrets de service role en el cliente; anon key + RLS. | ✅ **Cumplido** | App móvil solo utiliza `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Service role exclusivo en el worker backend. |
| **RNF-03** | **Must** | Tiempo | Mapa inicial usable en &lt; 3 s con semilla. | ✅ **Cumplido** | Consultas indexadas y renderizado vector SVG optimizado sin SDKs pesados. |
| **RNF-04** | **Must** | Actualización | Tick visible en UI &le; 3 s después del insert. | ✅ **Cumplido** | WebSockets vía canal Postgres Changes de Supabase Realtime con medidor de lag en `diagnosis.tsx`. |
| **RNF-05** | **Must** | Errores | Fallo de comando y 401/403 no dejan spinner infinito. | ✅ **Cumplido** | Timeouts defensivos (10s) y manejo de errores con captura de excepciones en `command-confirm.tsx`. |
| **RNF-06** | **Must** | Repro | README con env example, compose, usuarios de prueba. | ✅ **Cumplido** | `README.md` completo en raíz, `infra/.env.example` y `apps/agropulse/.env.example`. |
| **RNF-07** | **Should** | Offline | Comando o lectura manual no se pierde al cortar red 30 s. | ✅ **Cumplido** | `src/services/offlineQueue.ts` persiste en `AsyncStorage` localmente. |
| **RNF-08** | **Should** | Tests | Tests de fórmula de semáforo + idempotencia de client_request_id. | ✅ **Cumplido** | Tests Jest en `apps/agropulse/__tests__/semaphore.test.ts`, `command_validation.test.ts` y `geometry.test.ts`. |
| **RNF-09** | **Could** | i18n | UI en español; código/SQL en inglés. | ✅ **Cumplido** | Interfaz, botones y alertas en español; esquemas, tablas y variables en inglés. |
| **RNF-10** | **Must** | Ética / datos | Dejar explícito que humedad y GPS de semilla son ficticios. | ✅ **Cumplido** | Disclaimers presentes en Login, Account, Map y en la cabecera de `seed.sql`. |

---

## 3. Matriz de Entregables del PRD (§15)

| # | Entregable Exigido | Ubicación en el Repositorio | Estado |
| :---: | :--- | :--- | :---: |
| **1** | App Expo (React Native + TypeScript + Router) | `apps/agropulse/` | ✅ Completado |
| **2** | Migraciones de base de datos + políticas RLS + Seed | `supabase/migrations/` y `supabase/seed.sql` | ✅ Completado |
| **3** | Infraestructura Docker Compose (Redpanda + Worker + Simulador) | `infra/docker-compose.yml`, `infra/src/` | ✅ Completado |
| **4** | Informe Técnico corto (4 a 8 páginas) | `docs/INFORME_TECNICO.md` | ✅ Completado |
| **5** | Guía de Video / Defensa en clase (H1, H2, RF-16, H4) | `docs/GUIA_DEFENSA_ORAL.md` | ✅ Completado |
| **6** | PRD Cumplido y Checklist | `PRD_CHECKLIST.md` | ✅ Completado |
