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

## Worker definitivo

El Worker definitivo debe ser:

- Nombre en Cloudflare: `portal`
- URL: `https://portal.camaraceuta.workers.dev/`
- Repositorio GitHub: `mharrous/portalcamara`

## Conectar este repo a Cloudflare

En Cloudflare:

1. Entra en `Workers & Pages`.
2. Abre el Worker `portal`.
3. Ve a `Settings` > `Builds`.
4. Pulsa `Connect`.
5. Selecciona GitHub y el repo `mharrous/portalcamara`.
6. Configura:
   - Branch: `main`
   - Build command: vacío o `npm install`
   - Deploy command: `npx wrangler deploy`
   - Root directory: vacío / raíz del repo
7. Guarda la configuración.

A partir de ahí, cada `git push` a `main` desplegará el Worker `portal`.

## Despliegue manual alternativo

Si necesitas desplegar manualmente:

```powershell
npm install
npx wrangler deploy
```

## Login del portal

El portal usa dos variables seguras en Cloudflare:

- `AUTH_SECRET`: clave privada para firmar la sesión.
- `AUTH_USERS`: lista JSON de usuarios con contraseña hasheada.

Para generar estos valores:

```powershell
npm install
npm run auth:generate -- admin=ContraseñaAdmin usuario=ContraseñaUsuario
```

Después copia los valores generados en Cloudflare:

1. Entra en `Workers & Pages`.
2. Abre el Worker `portal`.
3. Ve a `Settings` > `Variables and secrets`.
4. Añade `AUTH_SECRET` como secret.
5. Añade `AUTH_USERS` como secret o variable protegida.
6. Despliega de nuevo el Worker.

Roles disponibles:

- `admin`: usuario administrador.
- `usuario`: usuario normal para consultar el portal.

## Autoridad central y Microsoft Entra

El portal usa la D1 `portal-camara-auth` para usuarios, aplicaciones, permisos, sesiones y estados OAuth. La administración está disponible en `/admin/users` para usuarios con rol administrador.

Microsoft Entra está implementado mediante Authorization Code Flow con PKCE, pero permanece desactivado por defecto. Consulta:

- `SSO_ARCHITECTURE.md`
- `MICROSOFT_ENTRA_SETUP.md`
- `SSO_TEST_PLAN.md`

Aplica el esquema inicial con:

```powershell
npx wrangler d1 execute portal-camara-auth --remote --file .\schema-auth.sql
npx wrangler d1 execute portal-camara-auth --remote --file .\migration-seed-legacy-users.sql
```

## Calendario alojado en otra cuenta

El calendario utiliza los endpoints internos `/api/sso/calendario/exchange` y `/api/sso/calendario/introspect`. Como está desplegado en otra cuenta de Cloudflare, ambos Workers deben compartir un secreto configurado de forma interactiva:

```powershell
npx wrangler secret put CALENDARIO_SSO_SECRET
```

El mismo valor se configura en el Worker del calendario como `PORTAL_SSO_SECRET`. Este valor nunca debe guardarse en GitHub.

## Seguridad

No subas secretos, tokens, contraseñas ni claves privadas al repositorio.
