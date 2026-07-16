# Portal de Proyectos - Cámara de Ceuta

Portal de tarjetas para acceder a los proyectos web de la Cámara de Comercio de Ceuta.

## Cómo añadir una tarjeta

Edita `worker.js` y cambia la lista `PROYECTOS`, que está al principio del archivo.

Ejemplo:

```js
{
  nombre: "Nuevo Proyecto",
  categoria: "Interno",
  url: "https://nuevo-proyecto.workers.dev/",
  estado: "activo",
},
```

Campos:

- `nombre`: título visible de la tarjeta.
- `categoria`: texto de categoría/filtro.
- `url`: enlace completo. Si aún no existe, déjalo como `""`.
- `estado`: usa `"activo"` o `"proximamente"`.

## Despliegue manual en Cloudflare

1. Abre Cloudflare Workers.
2. Entra al Worker del portal.
3. Pulsa `Edit code`.
4. Selecciona todo con `Ctrl+A`.
5. Pega el contenido completo de `worker.js`.
6. Pulsa `Save and deploy`.

## URL actual

- https://portal.camaraceuta.workers.dev/

## Seguridad

No subas secretos, tokens ni claves privadas al repositorio.
