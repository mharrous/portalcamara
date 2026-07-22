# Copias y recuperación de `portal-camara-auth`

La base contiene usuarios, permisos, sesiones y actividad. Las copias no deben subirse al repositorio ni enviarse sin cifrar.

## Protección disponible

- D1 Time Travel permite recuperar un punto temporal reciente.
- GitHub Actions incluye una exportación cifrada mensual con 90 días de retención.
- `tools/backup-d1.ps1` crea una exportación manual antes de migraciones importantes.

## Activar la copia mensual

Configura estos secretos en GitHub, dentro de `Settings > Secrets and variables > Actions`:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`: token limitado a lectura de D1.
- `BACKUP_ENCRYPTION_PASSWORD`: contraseña larga guardada en el gestor corporativo.

Después ejecuta manualmente `Copia cifrada D1` desde la pestaña Actions y confirma que genera un archivo `.sql.enc`. No esperes al primer día del mes para probarlo.

## Copia manual antes de una migración

```powershell
.\tools\backup-d1.ps1
```

El archivo SQL se crea en `backups`. Esa carpeta está ignorada por Git. Tras verificar el tamaño, cifra o mueve la copia a un almacenamiento corporativo protegido.

## Consultar Time Travel

```powershell
npx wrangler d1 time-travel info portal-camara-auth
```

Para localizar un punto anterior:

```powershell
npx wrangler d1 time-travel info portal-camara-auth --timestamp="2026-07-22T08:00:00+00:00"
```

## Restauración

La restauración de Time Travel sobrescribe producción y cancela operaciones en curso. Antes de ejecutarla:

1. Confirma el incidente y la hora exacta.
2. Crea una exportación del estado actual.
3. Guarda el bookmark actual para poder deshacer la restauración.
4. Informa a los usuarios de la interrupción.
5. Ejecuta la restauración únicamente con aprobación administrativa.
6. Comprueba usuarios, permisos, sesiones y acceso a aplicaciones.

Comando de restauración, solo después de completar los pasos anteriores:

```powershell
npx wrangler d1 time-travel restore portal-camara-auth --timestamp="FECHA_UTC_CONFIRMADA"
```

## Prueba trimestral

Cada trimestre:

1. Descarga una copia cifrada.
2. Comprueba que puede descifrarse con la contraseña corporativa.
3. Verifica que contiene el esquema y las tablas esperadas.
4. No restaures sobre producción durante la prueba.
5. Registra fecha, responsable y resultado.
