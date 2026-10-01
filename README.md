# Ruta de las Palabras — 4.º A

Juego educativo multijugador en vivo para 2 a 4 jugadores.

## Estructura
- `public/index.html`: juego y panel de administrador.
- `server.js`: servidor Express + Socket.IO y sincronización en vivo.
- `data/questions.json`: banco inicial de 15 preguntas.
- `data/config.json`: configuración inicial.
- `render.yaml`: configuración para Render.

## Funciones multijugador
- Crear sala y compartir código.
- 2 a 4 jugadores por sala.
- El creador inicia la partida.
- Turnos sincronizados.
- Dado y movimientos determinados por el servidor.
- La misma pregunta aparece simultáneamente en todas las pantallas.
- Solo responde el jugador cuyo turno está activo.
- Resultado y puntajes se sincronizan para todos.
- Eventos y llegada a meta se sincronizan.

## Inicio local
```bash
npm install
npm start
```
Abrir `http://localhost:10000`.
