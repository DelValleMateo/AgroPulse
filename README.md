# AgroPulse 🌾 — Agricultura de Precisión & Telemetría IoT
**Licenciatura en Sistemas de Información — Desarrollo y Arquitectura en Aplicaciones Móviles (2026)**  
**Docente:** Mg. Lic. Ernesto Ledesma — FCyT Sede Concepción del Uruguay  

AgroPulse es una aplicación móvil y arquitectura event-driven para agricultura de precisión construida con **React Native (Expo + TypeScript strict + Expo Router)**, **Supabase (Auth, PostgreSQL, Row Level Security, Realtime CDC)** y un bus de mensajería backend con **Redpanda (Kafka API) + IoT Simulator + Worker**.

---

## 📑 Documentación y Entregables
- 📄 **[Informe Técnico de Arquitectura (4–8 páginas)](file:///e:/FACULTAD/CUARTO_ANO/DESARROLLO%20MOBILE/TPS-CODIGO/04-TP/docs/INFORME_TECNICO.md)**: Justificación del desacoplamiento (por qué el móvil no usa Kafka), políticas RLS y diagramas de secuencia.
- 🎤 **[Guía de Exposición & Defensa Oral (3–5 min)](file:///e:/FACULTAD/CUARTO_ANO/DESARROLLO%20MOBILE/TPS-CODIGO/04-TP/docs/GUIA_DEFENSA_ORAL.md)**: Guión paso a paso con cronómetro y acciones exactas para los flujos H1, H2, RF-16, H4 y H3.
- ✅ **[Checklist de Conformidad del PRD](file:///e:/FACULTAD/CUARTO_ANO/DESARROLLO%20MOBILE/TPS-CODIGO/04-TP/PRD_CHECKLIST.md)**: Matriz de requisitos RF-01 a RF-24 y RNF-01 a RNF-10 verificados.

---

## 🏛️ Arquitectura de la Solución

```
[ Sensor IoT Simulado ] ──(Kafka Topic)──> [ Broker Redpanda ] ──(Consumer)──> [ Worker Ingesta ]
                                                                                       │
                                                                                 (Service Role)
                                                                                       ▼
[ Cliente Móvil Expo ] <──(Realtime WebSockets / RLS)──────────────────────── [ Supabase BaaS ]
  • Mapa & Polígonos                                                            • PostgreSQL + PostGIS
  • GPS Estoy en el lote                                                        • Row Level Security
  • Comandos Asíncronos (RF-16)                                                 • Stored Procedures (RPC)
  • Cola Offline (RF-21)                                                        • Auth (JWT)
```

---

## 👥 Usuarios de Prueba y Roles (PRD §14)

Todos los usuarios tienen la contraseña común: `AgroPulse2026!`  
*(Nota: la pantalla de login incluye botones de acceso rápido para autocompletar cada rol en 1 clic)*.

| Rol | Correo Electrónico | Establecimiento | Permisos y Capacidades |
| :--- | :--- | :--- | :--- |
| **Productor** | `productor@agropulse.test` | Estancia Didáctica Concordia | **Total:** Ver mapa, editar umbrales, emitir comandos de riego, crear lotes. |
| **Operador** | `operador@agropulse.test` | Estancia Didáctica Concordia | **Operativo:** Ver mapa, emitir y cancelar comandos de riego. No puede crear/borrar lotes. |
| **Asesor** | `asesor@agropulse.test` | Estancia Didáctica Concordia | **Solo Lectura (H2):** Ver mapa, telemetría y gráficos. RLS bloquea comandos y umbrales. |
| **Ajeno** | `ajeno@agropulse.test` | Establecimiento El Palmar | **Multi-tenant (RF-02):** Aislamiento estricto; no ve ningún lote de Concordia. |

---

## 🚀 Puesta en Marcha Rápida (Paso a Paso)

### Prerrequisitos
- **Node.js**: v20+ o v22+
- **Docker & Docker Compose**: v2.20+
- **NPM** o **PNPM**

---

### Paso 1: Configurar la Base de Datos (Supabase)
Puedes utilizar una instancia local de Supabase (mediante Supabase CLI o Docker) o un proyecto gratuito en Supabase Cloud.

1. Ejecuta el script de migración SQL en el SQL Editor de tu proyecto Supabase:
   - Archivo: [`supabase/migrations/20260101000000_init_schema.sql`](file:///e:/FACULTAD/CUARTO_ANO/DESARROLLO%20MOBILE/TPS-CODIGO/04-TP/supabase/migrations/20260101000000_init_schema.sql)
2. Ejecuta el script de datos semilla:
   - Archivo: [`supabase/seed.sql`](file:///e:/FACULTAD/CUARTO_ANO/DESARROLLO%20MOBILE/TPS-CODIGO/04-TP/supabase/seed.sql)

---

### Paso 2: Iniciar la Infraestructura de Streaming (Redpanda + Simulador + Worker)
1. En la carpeta `infra/`, crea tu archivo `.env` basado en `.env.example`:
   ```bash
   cp infra/.env.example infra/.env
   ```
2. Configura en `infra/.env` tu `SUPABASE_URL` y tu `SUPABASE_SERVICE_ROLE_KEY`.
3. Levanta los contenedores con Docker Compose:
   ```bash
   cd infra
   docker compose up -d
   ```
4. Servicios activos:
   - **Redpanda Broker**: Puerto `9092`
   - **Redpanda Console (Web UI)**: [http://localhost:8080](http://localhost:8080) (para inspeccionar topics y mensajes en vivo)
   - **Simulador IoT**: [http://localhost:4000](http://localhost:4000) (genera ticks cada 4 s)
   - **Worker Ingesta**: Consume Kafka y actualiza Supabase + aplica comandos de válvulas.

Para ver los logs en vivo del worker y del simulador (**RF-24**):
```bash
docker compose logs -f
```

---

### Paso 3: Iniciar la Aplicación Móvil Expo
1. Configura el archivo de entorno en `apps/agropulse`:
   ```bash
   cd apps/agropulse
   cp .env.example .env
   ```
   Asegúrate de colocar tu `EXPO_PUBLIC_SUPABASE_URL` y tu `EXPO_PUBLIC_SUPABASE_ANON_KEY` (¡nunca el service role en la app!).
2. Instala dependencias y arranca el entorno de desarrollo:
   ```bash
   npm install
   npm run web    # Abre la app en el navegador web
   # o
   npm start      # Abre Expo CLI para escanear con Expo Go en Android / iOS
   ```

---

## 🧪 Ejecución de Tests Unitarios (RNF-08)
El proyecto incluye pruebas automatizadas con Jest para validar:
1. La fórmula del semáforo (§08: *Stale*, *Dry*, *Optimal*, *Wet*).
2. El control de concurrencia e idempotencia de comandos con `client_request_id` (RF-16).
3. El algoritmo de geolocalización Ray-casting para *"Estoy en el lote"* (RF-06).

Para ejecutar los tests:
```bash
cd apps/agropulse
npm test
```

---

## 📱 Guía Rápida de Demostración de Casos de Uso (PRD §07)

- **H1 (Productor — Riego):** Entra con Productor &rarr; El lote "Costa 2" figura en Rojo (18% &lt; umbral 25%) &rarr; Ingresa y ordena *"Abrir 30 min"* &rarr; En menos de 5 s la válvula figura abierta y el comando pasa a `applied` mediante Realtime.
- **H2 (Asesor — Restricción):** Entra con Asesor &rarr; Intenta comandar riego o modificar umbral &rarr; La app bloquea la acción notificando permiso insuficiente (RLS).
- **RF-16 (Doble Comando):** Intenta emitir dos órdenes seguidas sobre la misma válvula antes de que se aplique la primera &rarr; El sistema rechaza la segunda orden con advertencia clara.
- **H4 (Sensor Caído / Stale):** El lote "Monte A" figura en Gris (*Stale* / Sin datos confiables) al haber superado los 15 minutos sin ticks, demostrando la prioridad sobre el estado seco.
- **H3 (Offline):** En la pestaña Cuenta &rarr; Lectura Manual &rarr; Activa el interruptor *"Modo Sin Señal"* &rarr; Guarda una lectura de 22% &rarr; Se guarda en cola local &rarr; Desactiva el modo y sincroniza con el botón &rarr; Se inserta en Supabase vía upsert sin duplicados.

---

## ⚖️ Nota Ética & Declaración de Datos (RNF-10)
Los datos de humedad, precipitaciones, coordenadas satelitales y geometría de lotes en la zona de Concordia (Entre Ríos) son estrictamente ficticios y han sido diseñados con fines pedagógicos para la cátedra de Desarrollo Móvil (2026).
