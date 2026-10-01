# Ruta de las Palabras — 4to A

Juego educativo web basado en el archivo original `Ruta de las Palabras`.

## Estructura

- `public/index.html` — juego completo.
- `server.js` — servidor Express y API de configuración.
- `package.json` — dependencias y comando de inicio.
- `render.yaml` — configuración para Render.
- `data/config.json` — configuración local de respaldo.
- `data/questions.json` — banco inicial de preguntas.

## Ejecutar localmente

```bash
npm install
npm start
```

Abrir `http://localhost:3000`.

## Publicar

Subir todos los archivos a GitHub y conectar el repositorio con Render.
En Render se debe configurar `ADMIN_KEY` y `DATABASE_URL` cuando se use PostgreSQL para conservar los cambios después de reinicios o despliegues.
