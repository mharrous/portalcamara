# Design QA — Glass Copper Ceuta

## Reference

- Source: `C:\Users\Mustafa\Downloads\34_glass_copper_ceuta.png`
- Target: slate-blue to warm-copper full-page gradient, centered translucent glass panel, white typography and restrained institutional accents.

## Verified Views

- `/login`: composition, gradient direction, card proportions, logo, Microsoft action and footer match the selected reference.
- `/`: header, filters and project cards consistently reuse the Glass Copper palette and translucent material.
- `/admin/users`: header, tabs, dense tables, controls and backup cards use the same design language while preserving contrast.

## Functional Checks

- Production Worker compiled and deployed successfully.
- Portal cards rendered correctly and retained filtering/navigation behavior.
- Administration tab navigation changed from users to active sessions correctly.
- Login, portal and administration produced no browser console errors.
- Responsive rules remain available for mobile and narrow table layouts.

## Findings

- P0: none.
- P1: none.
- P2: none.
- P3: none blocking handoff.

final result: passed

## Selector de temas

- El acceso y la pantalla de tarjetas comparten ocho temas de color sobre el mismo degradado y efecto cristal.
- Las ocho paletas utilizan tonos desaturados y transiciones suaves para reducir el ruido visual.
- El tema predeterminado es Plata, con grises claros y blanco roto de baja saturacion.
- La eleccion se conserva al recargar mediante almacenamiento local del navegador.
- En la pantalla de tarjetas, el boton queda flotante arriba a la derecha y fuera del bloque de usuario.
- La paleta queda limitada al portal central; no modifica Jornadas, Reuniones ni las demas aplicaciones enlazadas.
- Se comprobo en produccion la apertura de la paleta, el cambio de color y la ausencia de errores de consola.

final result: passed

## Logo del acceso

- El login utiliza el logotipo horizontal facilitado por el usuario a 741 × 235 píxeles.
- El recurso queda embebido en el Worker y separado del icono utilizado en el portal.
- Se verificó una presentación de 285 × 90 píxeles, centrada y sin deformación.
- La pantalla de acceso no presenta errores de consola.

final result: passed

## Borrado de tarjetas

- El modo edición muestra una papelera junto al lápiz de cada tarjeta real.
- El borrado solicita confirmación e informa de que también elimina los permisos asociados.
- La API de borrado está restringida a administradores y registra la acción en auditoría.
- La tarjeta de prueba quedó eliminada por decisión del usuario; las demás tarjetas permanecen intactas.

final result: passed

## Editor de tarjetas

- El botón de edición sólo aparece para administradores.
- El modo edición sustituye la navegación por lápices individuales y muestra el marco discontinuo para añadir tarjetas.
- El formulario recupera nombre, etiqueta y ruta de la tarjeta seleccionada.
- El formulario de alta comienza vacío y conserva la sección actual del portal.
- La comprobación se realizó en producción sin guardar datos de prueba y sin errores de consola.

final result: passed
