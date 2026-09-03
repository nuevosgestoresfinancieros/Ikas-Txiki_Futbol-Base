# 006 — Selección segura del progenitor firmante

## Contexto

Una familia puede tener dos progenitores registrados y necesitar que el nombre
concreto de uno de ellos aparezca en cada autorización. El nombre no debe ser
un texto libre confiado al navegador, ni una cuenta debe poder realizar una
firma electrónica afirmando que la hizo el otro progenitor.

## Decisión

El portal obtiene del backend los slots de progenitor de su propio `family_id`
y envía únicamente `parent_slot`. El backend resuelve el nombre desde la ficha
familiar y guarda el slot junto con el documento recibido. La cuenta autenticada
se conserva por separado en `archivo_firmado_subido_por` y en la evidencia de
firma electrónica.

Las subidas de documentos en papel pueden seleccionar cualquiera de los
progenitores de la propia familia, porque la persona que aporta el archivo y la
persona cuyo nombre figura en el documento pueden ser distintas. La firma
electrónica sencilla exige que el slot seleccionado corresponda a la cuenta
activa que realiza la acción; de lo contrario se solicita iniciar sesión con la
cuenta del progenitor correspondiente.

## Consecuencias

La interfaz deja de aceptar nombres libres y muestra una selección coherente
en castellano y euskera. El backend evita suplantaciones y permite auditar
quién aportó el archivo o realizó la firma, sin almacenar el contenido de la
firma en MongoDB.

## Reversión

La selección puede ocultarse temporalmente en el frontend, pero no se deben
eliminar los metadatos ya recibidos. Cualquier cambio que permita firmar en
nombre de otra cuenta requiere una revisión jurídica y de autenticación
independiente.
