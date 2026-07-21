# Plan de pruebas SSO

## Ejecutables con Entra desactivado

- Un visitante sin sesión es redirigido a `/login`.
- El acceso local de emergencia inicia sesión.
- Un usuario desactivado pierde su sesión.
- Un usuario normal solo recibe sus tarjetas activas.
- Un administrador puede crear y editar usuarios, correos y permisos.
- Retirar un permiso oculta la tarjeta en la siguiente petición.
- `/admin/users` devuelve 403 para un usuario normal.
- El cierre de sesión elimina la sesión D1 y la cookie.

## Requieren configurar Microsoft Entra

- Inicio Microsoft autorizado y reutilización de la sesión Microsoft.
- Rechazo de otro tenant.
- Rechazo de una cuenta Microsoft no creada por un administrador.
- Rechazo de `state` caducado o reutilizado.
- Validación de `nonce`, firma, issuer, audience, caducidad, tenant y `oid`.
- Acceso directo y 403 en cada aplicación dependiente.
- Retirada de permiso con una sesión activa en cada aplicación.

No se usa intercambio de códigos de un solo uso, por lo que las pruebas de reutilización o caducidad de `login_codes` no aplican a esta arquitectura.
