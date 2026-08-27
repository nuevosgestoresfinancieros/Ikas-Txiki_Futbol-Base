# Plan futuro: replica set MongoDB y eliminación definitiva de cuentas

> **Estado:** documentación de planificación. No autoriza ejecutar comandos, reiniciar contenedores, cambiar configuración, migrar datos ni desplegar el botón de eliminación definitiva.

La eliminación definitiva de una cuenta seguirá deshabilitada hasta que exista una transacción MongoDB multidocumento verificada. No se admite una alternativa de "mejor esfuerzo" ni una eliminación parcial.

## 1. Comprobación inicial obligatoria de topología

La comprobación de solo lectura realizada el 27 de agosto de 2026 confirma:

- MongoDB no se ejecuta como una unidad `systemd`.
- Se ejecuta en Docker como contenedor **`sl-mongo`**, imagen `mongo:7.0.31`.
- Está gestionado por Docker Compose del proyecto **`signlanguage-pro`** (`/var/www/signados/docker-compose.yml`), no por el repositorio de Ikas-Txiki.
- Expone MongoDB únicamente en `127.0.0.1:27017` y en la red Docker `signlanguage-pro_sl-net` como `sl-mongo`/`mongo`.
- Su comando actual es `mongod --bind_ip_all`, sin `--replSet`.
- Los datos están en dos volúmenes Docker: el de datos (`/data/db`) y el de configuración (`/data/configdb`).

La consulta `hello` confirmó además que el despliegue actual es standalone: no devuelve `setName` ni actúa como `mongos`. Por tanto, no puede proporcionar transacciones.

### Puerta de seguridad antes de cualquier ventana

Como `sl-mongo` pertenece a otro proyecto Compose, antes de actuar se debe confirmar por escrito:

1. Qué bases de datos y aplicaciones usan el contenedor, incluido `signlanguage-pro`.
2. Quién es responsable de ese proyecto y quién autoriza detenerlo.
3. Que todos los clientes pueden usar el hostname anunciado por el replica set.
4. Que la ventana incluye a **todos** los escritores de dicho contenedor, no solo Ikas-Txiki.

Si no se obtiene esa coordinación, se cancela esta vía. La alternativa a evaluar sería crear un MongoDB dedicado para Ikas-Txiki y migrar su base de datos en una ventana distinta; no se debe reconfigurar unilateralmente `sl-mongo`.

## 2. Objetivo y límites

Convertir `sl-mongo` en un replica set de un solo miembro, por ejemplo `ikas-rs0`, manteniendo el mismo conjunto de datos. Un replica set de un nodo permite transacciones, pero **no aporta alta disponibilidad**: el nodo sigue siendo un punto único de fallo.

MongoDB requiere configurar `replSetName`, reiniciar e inicializar el conjunto una sola vez con `rs.initiate()`. La configuración del miembro debe usar un hostname DNS estable, no una IP. [Guía oficial de conversión](https://www.mongodb.com/docs/manual/tutorial/convert-standalone-to-replica-set/) y [referencia de `rs.initiate`](https://www.mongodb.com/docs/manual/reference/method/rs.initiate/).

## 3. Preparación previa a la ventana

Solo después de aprobación explícita:

- Inventariar versión, FCV, usuarios, bases, índices y tamaño de cada base alojada en `sl-mongo`.
- Guardar, fuera de los volúmenes y de forma cifrada, una copia de:
  - `docker inspect sl-mongo`;
  - la definición Compose y sus ficheros auxiliares;
  - imagen/digest exactos;
  - políticas de reinicio, red, puertos y variables no secretas.
- Elegir un hostname DNS interno y estable que sea resoluble desde el host, los contenedores y todas las aplicaciones clientes.
- Comprobar que el nombre de replica set elegido no colisiona con otro despliegue.
- Preparar mantenimiento para todos los clientes, detener trabajos programados, importaciones, correos y procesos de escritura.
- Definir responsable, hora de inicio, duración máxima, umbral de rollback y canal de comunicación.

## 4. Backup verificable adaptado a Docker

Con mantenimiento activo y todos los escritores detenidos:

1. Crear un backup lógico completo de **todas las bases alojadas por `sl-mongo`**, mediante `mongodump` desde el contenedor, en un archivo comprimido y fechado fuera de los volúmenes Docker.
2. Calcular SHA-256, copiar el archivo a almacenamiento independiente y registrar su tamaño, hash y hora.
3. Restaurar el backup en un contenedor MongoDB aislado de la misma versión/FCV, sin puertos expuestos y con volúmenes temporales.
4. Comparar origen y restauración: bases, colecciones, conteos, índices y consultas de muestra de cada aplicación afectada.
5. Detener limpiamente `sl-mongo` y crear snapshots/archivos de ambos volúmenes Docker (`/data/db` y `/data/configdb`), además de la definición Compose original. Esos snapshots son el rollback determinista.

No se copiarán archivos del volumen mientras `mongod` esté activo. No se reanudan cambios hasta que la restauración aislada haya sido validada. MongoDB recomienda verificar el backup mediante restauración; para consistencia con un backup lógico deben detenerse las escrituras durante la copia. [Documentación oficial de backup/restauración](https://www.mongodb.com/docs/manual/tutorial/backup-and-restore-tools/).

**Criterio de cancelación:** un hash, restauración, conteo, índice o consulta que no coincida cancela la conversión.

## 5. Conversión futura del contenedor

Estos pasos se ejecutarán únicamente dentro de la ventana aprobada y coordinada:

1. Confirmar mantenimiento y ausencia de escritores de Ikas-Txiki y de los demás clientes de `sl-mongo`.
2. Detener el stack Compose propietario de forma controlada. No usar `docker exec` para editar la configuración del contenedor: los cambios no serían persistentes.
3. Versionar una copia inmutable de la definición Compose actual.
4. Modificar la definición Compose propietaria para iniciar el mismo `mongod` con el replica set, manteniendo controles de red y seguridad existentes. La forma exacta se validará antes de la ventana; conceptualmente incluirá:

   ```yaml
   command: ["mongod", "--bind_ip_all", "--replSet", "ikas-rs0"]
   ```

   No se abrirá el puerto fuera de `127.0.0.1` ni se reducirán autenticación/TLS. Si hay autorización habilitada, se configurará el mecanismo de autenticación interna del replica set (keyfile o X.509) en secretos y volúmenes gestionados, nunca incrustado en la definición versionada.

5. Levantar solo `sl-mongo` y conectar una consola administrativa local autorizada.
6. Inicializar una sola vez:

   ```javascript
   rs.initiate({
     _id: "ikas-rs0",
     members: [{ _id: 0, host: "<hostname-dns-estable>:27017" }]
   })
   ```

7. Esperar estado `PRIMARY` y verificar `rs.status()`, `rs.conf()` y `hello`.
8. Actualizar de forma coordinada las cadenas de conexión de cada cliente para declarar `replicaSet=ikas-rs0`, reiniciando cada aplicación de forma controlada.

## 6. Validación antes de retirar mantenimiento

- `rs.status()` muestra exactamente un miembro `PRIMARY`.
- `hello` devuelve `setName: "ikas-rs0"` y sesiones lógicas.
- Todos los clientes recuperan sus comprobaciones de salud y lecturas habituales.
- Se ejecuta una prueba transaccional controlada en una colección técnica reservada: insertar un documento de prueba dentro de una transacción y abortarla; comprobar que no queda documento. No usar jugadores, familias, equipos, calendario ni colecciones deportivas.
- Se revisan logs de MongoDB, Docker y aplicaciones durante 15–30 minutos.
- Se confirman nuevamente los conteos e índices relevantes.

No se habilita ni despliega la eliminación definitiva en esta intervención. Requerirá una segunda aprobación, una prueba aislada de la operación completa y un despliegue independiente.

## 7. Rollback Docker

El rollback solo se permite antes de reabrir escrituras normales:

1. Mantener mantenimiento activo y detener todos los clientes del contenedor.
2. Detener `sl-mongo` mediante el Compose propietario.
3. Restaurar exactamente los dos snapshots de volumen preconversión y la definición Compose original.
4. Levantar el contenedor standalone original y restaurar las cadenas de conexión originales.
5. Verificar salud, conteos, índices y consultas de muestra contra el backup validado.
6. Registrar causa, hora y resultado del rollback.

No se intentará convertir de vuelta el mismo volumen modificado de replica set a standalone. Se restaurarán los snapshots preconversión para recuperar un estado conocido.

## 8. Aprobaciones requeridas

- Propietario de `signlanguage-pro` y de todas las aplicaciones dependientes de `sl-mongo`.
- Ventana, responsables, comunicación y criterio de abortar/rollback.
- Destino cifrado y periodo de retención de backups.
- Resultado satisfactorio de la restauración aislada.
- Hostname DNS y cambios de cadenas de conexión validados.
- Autorización específica de la prueba transaccional y, en otra intervención, del despliegue de la eliminación definitiva.
