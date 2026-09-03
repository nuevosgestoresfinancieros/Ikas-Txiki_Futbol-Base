# 001 — Base de datos

## Contexto

La aplicación usa MongoDB para los datos operativos. Estos datos pueden incluir información personal y requieren controles de disponibilidad, integridad y acceso.

## Decisión

MongoDB se mantiene como almacén de datos de la aplicación. Las copias de seguridad se realizan mediante procedimientos autorizados, se verifican antes de depender de ellas y se conservan fuera del control de versiones cuando contengan datos reales. El archivado debe separar los datos que ya no son operativos conforme a los requisitos aplicables, sin eliminar evidencia necesaria de forma prematura.

Las acciones relevantes sobre datos deben ser auditables con registros que no expongan datos sensibles. Las restauraciones y transformaciones se ensayan cuando sea posible y disponen de un plan de reversión. El acceso se limita a las cuentas y permisos necesarios; no se versionan bases de datos, exportaciones ni credenciales.

## Consecuencias

Los cambios de estructura, importaciones masivas, borrados y restauraciones requieren revisión, copia de seguridad y validación posterior. La reversión se realiza restaurando una copia comprobada o ejecutando un procedimiento específico y autorizado; nunca mediante cambios improvisados sobre datos de producción.
