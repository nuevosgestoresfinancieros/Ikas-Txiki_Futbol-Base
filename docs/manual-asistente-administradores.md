# Manual del Asistente Cibermedida para administradores

## Qué es

El **Asistente Cibermedida** ofrece ayuda sobre la pantalla actual y permite preparar
algunas operaciones guiadas de Ikas‑Txiki. No sustituye los permisos de la
aplicación ni ejecuta cambios directamente a partir de una conversación.

## Abrir y cerrar

- Pulsa el distintivo flotante **Asistente Cibermedida**.
- También puedes enfocarlo con el teclado y abrirlo con `Intro` o la barra
  espaciadora.
- Cierra el panel con su botón visible o con `Escape`.
- Al cerrarlo, el foco vuelve al distintivo del asistente.
- En móvil el panel ocupa la pantalla; en escritorio se abre en un lateral.

## Tres tipos de interacción

### Ayuda general

Explica cómo utilizar una pantalla o módulo. Las preguntas sugeridas cambian según
la ruta en la que te encuentres.

### Consulta interna segura

Consulta información permitida por tu rol dentro de Ikas‑Txiki. Estas consultas
están definidas previamente y aplican los mismos permisos y límites de ámbito que
el resto de la aplicación.

### Propuesta de modificación

Permite preparar determinadas operaciones disponibles para tu rol. El asistente
muestra primero una vista previa exacta. El cambio solo se guarda después de una
confirmación expresa.

## Ayuda contextual, roles e idiomas

La ayuda tiene en cuenta la pantalla, el idioma, el rol y los permisos de la
sesión. Un usuario nunca obtiene nuevas funciones por utilizar el asistente.

El idioma se cambia desde el selector habitual de Ikas‑Txiki. El panel y sus
preguntas están disponibles en castellano y euskera.

## Vista previa y confirmación

Antes de una modificación:

1. Selecciona una operación permitida.
2. Completa únicamente los datos necesarios.
3. Pulsa **Preparar vista previa**.
4. Revisa la operación, el destino y cada valor.
5. Confirma solo si la vista previa es correcta; en caso contrario, cancela.

Las propuestas son temporales, pertenecen al usuario y a su sesión, y solo pueden
usarse una vez. Si el registro cambia después de preparar la vista previa, la
confirmación se rechaza para evitar sobrescribir cambios recientes.

## Privacidad

No escribas en el asistente:

- DNI, pasaportes u otros documentos de identidad.
- IBAN o datos bancarios.
- Contraseñas, tokens o códigos de acceso.
- Datos médicos o documentación privada.
- Información personal que no sea imprescindible para una operación autorizada.

Los enlaces ofrecidos por el asistente conducen únicamente a módulos internos
permitidos de Ikas‑Txiki.

## Qué puede hacer actualmente

- Explicar los módulos y la pantalla actual.
- Mostrar ayuda adaptada al rol y al idioma.
- Ejecutar consultas internas cerradas y con proyecciones limitadas.
- Preparar las operaciones guiadas que aparezcan en el selector.
- Mostrar una vista previa y solicitar confirmación antes de guardar.

Actualmente no puede:

- Eliminar registros.
- Ejecutar instrucciones libres generadas por un modelo.
- Acceder directamente a MongoDB.
- Saltarse permisos o consultar información fuera del ámbito del usuario.
- Enviar correos, SMS o WhatsApp.
- Ejecutar importaciones o migraciones.
- Abrir enlaces externos generados libremente.

## Funcionamiento sin proveedor externo

La ayuda interna y contextual funciona sin configurar OpenAI ni ningún otro
proveedor. Este es el modo predeterminado. La ausencia de proveedor externo no
impide abrir el panel ni utilizar las operaciones guiadas.

## Problemas frecuentes

- **El botón no aparece:** comprueba que has iniciado sesión y recarga la página.
- **Una operación no aparece:** revisa si tu rol tiene permiso para realizarla.
- **La confirmación ha caducado:** prepara una nueva vista previa.
- **El registro cambió:** vuelve a abrirlo y prepara otra vista previa.
- **La ayuda rechaza el texto:** elimina datos personales o instrucciones no
  relacionadas con el uso de la aplicación.
- **El panel no responde:** ciérralo, recarga la pantalla y vuelve a intentarlo.

## Informar de un error

Comunica al responsable técnico:

- La pantalla y el idioma utilizados.
- La operación que intentabas realizar.
- El mensaje de error visible.
- La fecha y hora aproximadas.

No envíes contraseñas, cookies, tokens, datos bancarios ni capturas con información
personal. No confirmes repetidamente una operación si el resultado es dudoso.
