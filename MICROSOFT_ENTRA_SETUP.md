# Activación de Microsoft Entra

## Registro de aplicación

1. Crea o reutiliza una aplicación web en Microsoft Entra ID.
2. Registra exactamente esta URI de redirección:
   `https://portal.camaraceuta.workers.dev/api/auth/microsoft/callback`
3. Permite Authorization Code Flow y OpenID Connect.
4. No actives implicit flow ni introduzcas fragmentos `/#` en la URI.
5. Copia el tenant ID y el client ID.
6. Crea un client secret y guárdalo únicamente como secreto de Cloudflare.

## Cloudflare

En el Worker `portal`, configura:

- `ENTRA_TENANT_ID`: identificador del tenant.
- `ENTRA_CLIENT_ID`: identificador de la aplicación.
- `ENTRA_CLIENT_SECRET`: secreto cifrado de Cloudflare.
- `ENTRA_REDIRECT_URI`: ya está fijado en `wrangler.jsonc`.
- `ENTRA_ENABLED`: debe seguir en `false` durante la preparación.
- `LOCAL_LOGIN_ENABLED`: debe seguir en `true` durante la transición.

No almacenes valores reales en GitHub, `.dev.vars.example`, documentación ni registros.

## Preparación del administrador

1. Entra con el usuario local administrador.
2. Abre `https://portal.camaraceuta.workers.dev/admin/users`.
3. Edita el administrador y añade exactamente su correo corporativo.
4. Revisa las aplicaciones asignadas a cada usuario.
5. Crea previamente cualquier otro usuario autorizado con su correo corporativo.

## Activación

1. Añade los tres valores de Microsoft en Cloudflare.
2. Cambia `ENTRA_ENABLED` a `true` en `wrangler.jsonc`.
3. Haz commit y push a `main`.
4. Prueba en incógnito el usuario administrador.
5. Comprueba un usuario permitido, uno no registrado, uno desactivado y uno de otro tenant.
6. Mantén el acceso local hasta integrar y probar las aplicaciones dependientes.

## Acceso local

El acceso local quedó desactivado después de validar dos administradores Microsoft:

`LOCAL_LOGIN_ENABLED=false`

Las variables `AUTH_USERS` y `AUTH_SECRET` ya no son necesarias y deben permanecer eliminadas de Cloudflare. Para una reversión de emergencia habría que restaurarlas y volver a establecer `LOCAL_LOGIN_ENABLED=true`.

## Reversión

1. Cambia `ENTRA_ENABLED` a `false`.
2. Mantén `LOCAL_LOGIN_ENABLED` en `true`.
3. Haz commit y push.
4. Si fuera necesario, usa el rollback de versiones del Worker `portal`.

La reversión no requiere borrar usuarios, sesiones, permisos ni datos de D1.
