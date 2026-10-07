# Guía de Exposición & Defensa Oral (3 a 5 minutos)
**Proyecto:** AgroPulse — Plataforma de Precisión y Telemetría Agrícola  
**Materia:** Desarrollo y Arquitectura en Aplicaciones Móviles (2026)  

---

## Estructura y Cronómetro de la Defensa (Total: ~4 minutos)

| Minuto | Bloque | Acción en Vivo | Concepto Teórico a Mencionar |
| :---: | :--- | :--- | :--- |
| **0:00 - 0:45** | **1. Introducción y Arquitectura** | Mostrar pantalla de Login y diagrama del Informe. | Justificar por qué el móvil **NO** se conecta a Kafka (redes móviles, RLS, batería). |
| **0:45 - 2:00** | **2. Flujo H1 (Productor & Riego)** | Login Productor &rarr; Ver Costa 2 en rojo &rarr; Abrir 30 min &rarr; Estado applied en &lt; 5s. | Ciclo asíncrono `pending` &rarr; `applied`, acuse de recibo y Supabase Realtime. |
| **2:00 - 2:45** | **3. Flujo RF-16 (Doble Comando)** | Intentar enviar un segundo comando inmediato a la misma válvula. | Validación de concurrencia y prevención de doble orden en vuelo. |
| **2:45 - 3:30** | **4. Flujo H2 (Restricción Asesor)** | Login como Asesor &rarr; Intentar modificar umbral o regar. | Seguridad RLS y control de acceso RBAC a nivel de base de datos. |
| **3:30 - 4:15** | **5. Flujo H4 (Sensor Caído / Stale)** | Mostrar Monte A en Gris (Stale). | Regla de prioridad: si antigüedad &gt; 15 min, pasa a Stale y no a Seco. |
| **4:15 - 4:45** | **6. Flujo H3 (Offline)** | Carga manual con interruptor Offline &rarr; Reanudar &rarr; Sincronizar. | Tolerancia a desconexión e idempotencia con `client_reading_id`. |

---

## Guión Paso a Paso con Acciones en Vivo

### Bloque 1: Inicio y Justificación de Arquitectura (0:00 - 0:45)
- **Qué decir:**  
  *"Buenas tardes profesor/a. Presentamos AgroPulse, una plataforma móvil en React Native (Expo Router) para agricultura de precisión. La arquitectura distingue estrictamente tres capas: el dispositivo móvil, la capa BaaS en Supabase y el bus de eventos de streaming en Redpanda.*  
  *Una decisión de diseño fundamental es que **la app móvil no consume Kafka directamente**. Kafka no provee autorización granular por filas (RLS), saturaría la batería con heartbeats en redes rurales inestables y consumiría excesivo ancho de banda. Por eso, el worker traduce los eventos del broker a PostgreSQL y el móvil consume vistas seguras mediante Supabase Realtime."*

### Bloque 2: Demostración Historia H1 — Productor y Comando de Riego (0:45 - 2:00)
- **Acción en la app:**
  1. En la pantalla de Login, presionar el botón de demo **"👨‍🌾 Productor"** (`productor@agropulse.test`) e iniciar sesión.
  2. En la pestaña **"Mapa"**, observar los polígonos del establecimiento "Estancia Didáctica Concordia".
  3. Señalar que el lote **"Costa 2"** está pintado de **ROJO** (estado *Seco*, humedad 18% &lt; umbral 25%).
  4. Presionar sobre el polígono o la tarjeta de Costa 2 para entrar a su **Detalle**.
  5. Mostrar el gráfico temporal de las últimas 6 horas y la recomendación agronómica: *"Humedad bajo umbral: considerar riego"*.
  6. En la sección de válvulas, presionar **"Comandar Riego"**.
  7. En la pantalla de confirmación, dejar seleccionada la opción *"Abrir Riego (30 min)"* y mostrar el `client_request_id` (UUID).
  8. Presionar **"Confirmar y Enviar Comando"**.
- **Qué decir:**  
  *"En este momento la app inserta el comando en estado `pending` mediante un RPC seguro. El worker backend toma la orden, simula la latencia física de 2 segundos de la electroválvula y actualiza el estado a `applied`. La app, suscrita por Realtime, refleja la válvula abierta en menos de 5 segundos sin necesidad de recargar la pantalla."*

### Bloque 3: Demostración Requisito RF-16 — Doble Comando Rechazado (2:00 - 2:45)
- **Acción en la app:**
  1. Presionar nuevamente en **"Comandar Riego"** sobre la misma válvula.
  2. Enviar la orden de forma reiterada o mostrar el mensaje preventivo en pantalla.
- **Qué decir:**  
  *"Cumpliendo el requisito **RF-16**, el sistema valida tanto en el cliente como en la base de datos que no puede existir más de un comando en estado `pending` sobre la misma válvula. Como se aprecia en pantalla, la interfaz bloquea el envío y muestra un mensaje claro de prevención."*

### Bloque 4: Demostración Historia H2 — Restricción de Rol Asesor (2:45 - 3:30)
- **Acción en la app:**
  1. Ir a la pestaña **"Cuenta"** y presionar **"Cerrar Sesión"**.
  2. Presionar el botón de demo **"📋 Asesor (H2)"** (`asesor@agropulse.test`) e iniciar sesión.
  3. Ingresar al lote **Costa 2**.
  4. Mostrar que el botón de modificar umbrales está deshabilitado con el mensaje *"Bloqueado para Asesor"*.
  5. Intentar comandar riego en la válvula: la app muestra la alerta de rechazo: *"Acceso Restringido (H2): El rol Asesor Agrónomo no tiene autorización para emitir comandos de riego"*.
- **Qué decir:**  
  *"El asesor puede supervisar el semáforo y los gráficos de telemetría, pero sus permisos están restringidos a solo lectura por Row Level Security en Postgres. Ningún asesor puede abrir válvulas ni alterar umbrales agronómicos."*

### Bloque 5: Demostración Historia H4 — Sensor Caído / Estado Stale (3:30 - 4:15)
- **Acción en la app:**
  1. Volver a la pestaña **"Mapa"** o **"Lotes"** y mostrar el lote **"Monte A"**.
  2. Mostrar que su estado figura en color **GRIS (Stale / Sin datos confiables)**.
- **Qué decir:**  
  *"El PRD exige en §08 que si una estación deja de reportar ticks por más de 15 minutos, el lote no debe mostrarse como seco ni óptimo, sino transicionar a estado `stale` (gris). Esto evita que un productor tome decisiones erróneas basadas en datos obsoletos."*

### Bloque 6: Demostración Historia H3 & RF-21 — Sincronización Offline (4:15 - 4:45)
- **Acción en la app:**
  1. Ir a **"Cuenta"** &rarr; **"Carga de Lectura Manual"**.
  2. Activar el interruptor **"Modo Sin Señal (OFFLINE)"**.
  3. Cargar una lectura de humedad de 22% y presionar **"Tomar GPS"** (o ingresar nota).
  4. Presionar **"Guardar en Cola Offline"**: se genera el UUID y se encola en AsyncStorage.
  5. Desactivar el modo sin señal y presionar **"Sincronizar"**.
- **Qué decir:**  
  *"La lectura manual se persiste localmente sin perderse ante cortes de red (RNF-07) y al recuperar conectividad se inserta en Supabase mediante upsert idempotente sin generar filas duplicadas."*
