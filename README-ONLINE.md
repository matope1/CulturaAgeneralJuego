# Cultura Brava · publicar y configurar el modo online

La app mantiene el juego local. El modo online usa Supabase Auth anónimo, PostgreSQL RPC y Realtime. No necesita claves privadas en el navegador; se recomienda la clave publicable `publishable`.

## 1. Crear Supabase.

1. Crea un proyecto en [supabase.com/dashboard](https://supabase.com/dashboard) y guarda la URL del proyecto y su clave publicable. En **Settings → API Keys** encontrarás la clave `sb_publishable_…`; también puedes verla en **Connect**.
2. En **Authentication → Sign In / Providers**, habilita **Anonymous sign-ins**. Cada navegador recibe una identidad anónima persistente; borrar los datos del navegador elimina la posibilidad de recuperar esa identidad.
3. Abre **SQL Editor** y ejecuta primero `supabase/migrations/0001_online_rooms.sql`.
4. Ejecuta después todo el contenido de `supabase/seed_questions.sql` para cargar las 400 preguntas activas.
5. Ejecuta `supabase/migrations/0002_question_rotation.sql` para activar el histórico y la bolsa compartida del modo online. Esta migración importa también las preguntas de partidas previas que sigan registradas.
6. Ejecuta `supabase/migrations/0003_online_chat.sql` para activar chat y reacciones online con acceso restringido a miembros de cada sala.
7. En **Authentication → Rate Limits**, configura límites razonables para el alta anónima. Para una publicación pública con tráfico, habilita CAPTCHA en Supabase y añade su validación en `getClient()` antes de permitir el alta.

El SQL habilita RLS; los clientes no pueden escribir puntuaciones ni leer respuestas privadas. Las salas, la selección de preguntas, las respuestas y el cálculo de puntos se controlan mediante funciones PostgreSQL transaccionales. Realtime publica solo estado de sala, participantes y el indicador de quién ha respondido. El botón de rotación compartida muestra métricas globales; reiniciarla desde la sala de espera afecta a todas las salas online de ese modo.

## 2. Ejecutar en desarrollo

El modo local funciona abriendo `index.html`. Para probar Supabase en local necesitas el endpoint `/api/config`, así que ejecuta la app con Vercel CLI desde esta carpeta:

```powershell
npx vercel dev
```

En el entorno de desarrollo de Vercel, configura `SUPABASE_URL` y `SUPABASE_ANON_KEY`. No añadas nunca `service_role` a la app ni a variables expuestas al navegador. La clave anon es pública y la protección de datos descansa en RLS y las RPC.

## 3. Publicar en GitHub y Vercel

1. Crea un repositorio GitHub y sube el proyecto, incluidos `supabase/`, `api/`, `online.js`, `README-ONLINE.md` y `questions.js`.
2. En Vercel elige **Add New → Project**, importa ese repositorio y deja el framework en **Other**. Es una app HTML/JS estática con una función Node en `api/config.js`; Vercel sirve el resto de archivos directamente.
3. En **Project Settings → Environment Variables**, añade `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY` para Production, Preview y Development según corresponda. Usa la URL `https://…supabase.co` y la clave `sb_publishable_…`. El endpoint también acepta la variable antigua `SUPABASE_ANON_KEY`.
4. Pulsa **Deploy**. Cada push a la rama conectada vuelve a desplegar. La aplicación y Supabase se conectan por HTTPS/WSS.
5. Abre el dominio de Vercel en dos navegadores o teléfonos, crea una sala en uno, comparte el código, únete desde el otro y marca ambos como listos.

## Rotación y comprobación

- El modo local guarda la bolsa, las últimas 100 partidas, repeticiones y ciclos en `localStorage`. En la configuración local puedes abrir **Historial** o **Reiniciar rotación**.
- Para validar localmente la selección persistente, ejecuta `node scripts/test-question-rotation.js`. Simula 20 partidas de 10 por modo, reinicia el contexto entre partidas y también prueba duraciones mezcladas, migración del último guardado y reinicio.
- El modo online guarda la rotación compartida en Supabase. La estadística aparece en la sala de espera; el anfitrión puede reiniciar el ciclo del modo de su sala, afectando a todas las salas online de ese modo.
- El chat online usa la tabla `brava_room_chat`, publicada en Supabase Realtime. El historial se limita a la partida activa; la nueva partida lo limpia. Mensajes de hasta 240 caracteres y un límite de frecuencia por jugador se validan en el servidor.

## Límites que conviene conocer

- El modo local de navegador necesita el banco con soluciones. Por eso el archivo estático `questions.js` contiene respuestas correctas y una persona técnica podría descargarlas. En partidas online, las respuestas de jugadores sí permanecen privadas hasta la revelación y las puntuaciones las calcula Supabase; no se acepta una puntuación enviada por el navegador.
- Las identidades anónimas viven en el almacenamiento del navegador. No equivalen a una cuenta recuperable entre dispositivos: para retomar desde otro dispositivo hace falta una cuenta/invitación o mecanismo de vinculación, que no se incluyó.
- No se ejecutó una conexión contra un proyecto real de Supabase porque este workspace no tiene URL ni credenciales. Tras cargar el SQL y configurar las dos variables, hay que realizar una partida de extremo a extremo con dos dispositivos.
