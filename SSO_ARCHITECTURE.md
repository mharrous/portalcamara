# Arquitectura de acceso central

## Portal central

- URL: `https://portal.camaraceuta.workers.dev/`
- Worker: `portal`
- D1: `portal-camara-auth`
- Binding: `AUTH_DB`
- Callback: `https://portal.camaraceuta.workers.dev/api/auth/microsoft/callback`

El portal identifica las cuentas de Microsoft por la pareja `tenant ID + oid`. La tabla `users` conserva además el usuario local opcional y el correo corporativo que utiliza el administrador para autorizar y vincular el primer acceso de Microsoft.

Las sesiones se guardan en D1 mediante el hash de un token aleatorio. El navegador recibe únicamente una cookie host-only con `HttpOnly`, `Secure` y `SameSite=Lax`. Desactivar un usuario invalida sus sesiones. El permiso se consulta de nuevo al generar cada página.

## Aplicaciones

| Código | URL | Estado |
| --- | --- | --- |
| `calendario-eventos` | `https://calendario.camaradeceuta.workers.dev/` | Externa o fuente pendiente; no protegida por el portal |
| `reuniones` | `https://reuniones.camaraceuta.workers.dev/` | Controlada; acceso automático desde el portal mediante código de un solo uso |
| `portal-proyectos-innovacion` | `https://portalproyectoscamara.camaraceuta.workers.dev/` | Controlada; acceso automático desde el portal mediante código de un solo uso |
| `gestion-jornadas` | `https://portal-jornadas.pages.dev/` | Controlada; acceso automático desde el portal mediante código de un solo uso |

Las aplicaciones están en dominios `workers.dev` y `pages.dev` distintos. No se comparte la cookie del portal. La integración completa usa Authorization Code Flow con PKCE en cada aplicación, una cookie local propia y una consulta al permiso central usando un código de aplicación fijo.

Ocultar una tarjeta no protege la URL de destino. Hasta activar la autenticación independiente en cada aplicación, su estado debe considerarse pendiente.

Reuniones utiliza un código aleatorio de un solo uso, vinculado al usuario y a `reuniones`, con 45 segundos de validez. La aplicación lo consume de forma atómica y crea una cookie propia; nunca se envían contraseñas ni JWT en la URL.

## Compatibilidad local

El acceso local existente se conserva mediante `AUTH_USERS` y `AUTH_SECRET`. En el primer acceso, el usuario se migra a D1 sin almacenar su contraseña. Los usuarios normales existentes reciben inicialmente las aplicaciones activas para evitar perder acceso; después el administrador puede retirarlas desde `/admin/users`.

## Portal Jornadas

El commit `5b475fb` no se revierte automáticamente. Su código de Entra debe permanecer desactivado. Puede reutilizarse la validación OIDC, pero no debe utilizarse `portal-jornadas-auth` como autoridad central ni mezclarse con secretos del Worker `portal`. En una integración posterior, Jornadas debe conservar su D1 funcional y añadir un binding separado hacia `portal-camara-auth`.
