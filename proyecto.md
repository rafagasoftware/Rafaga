PROYECTO: Sistema web de generación de facturas ARCA

Contexto y objetivo
Construir una aplicación web (escritorio) para emitir comprobantes electrónicos ante ARCA (ex AFIP, Argentina). El sistema pide el CAE por webservice y devuelve el comprobante autorizado en PDF.
La particularidad del producto es que resuelve dos casos de uso con un mismo flujo de carga:

1. FACTURA SIMPLE — una factura para un solo cliente.
2. FACTURACIÓN MÚLTIPLE — los mismos datos de factura (ítems, importes, período, condiciones) se cargan UNA SOLA VEZ y el sistema genera X facturas idénticas para X clientes: una factura por cliente, cada una con el CUIT, razón social y domicilio de ese cliente, y su propio número de comprobante y su propio CAE.

Esta segunda opción es el diferencial del producto. Casos típicos: cuotas mensuales de un instituto, expensas de consorcios, abonos de servicios recurrentes.

Usuarios
Perfil mixto, con un denominador común: POCA O NULA EXPERIENCIA EN ENTORNOS WEB.

* Monotributistas que facturan poco y solos.
* Administrativos de PyME que facturan a diario y en volumen.
* Estudios contables que facturan por cuenta de terceros.

Consecuencias de diseño obligatorias:

* Lenguaje llano, sin jerga técnica ni de programación. Nada de "endpoint", "batch", "job". Sí: "lote", "una factura por cliente", "con error".
* Un solo camino claro por pantalla; la acción principal siempre visible y distinguible del resto.
* Todo campo con etiqueta visible (nunca solo placeholder) y texto de ayuda donde el dato no sea obvio.
* Nada irreversible sin confirmación explícita. El usuario tiene que poder volver atrás en cualquier paso; nada se emite hasta el último clic.
* Objetivos de clic grandes (mínimo 44px de alto en botones principales).
* Los errores se explican en términos del negocio ("El CUIT no figura en el padrón de ARCA"), nunca con códigos crudos.

Alcance de comprobantes
Factura A, Factura B, Factura C y Nota de crédito (A/B/C).

Flujo principal: asistente de 4 pasos con resumen editable
El mismo asistente sirve para los dos modos; solo cambia el paso 2.

PASO 1 — Datos de emisión Punto de venta · Tipo de comprobante · Fecha de emisión · Concepto (Productos / Servicios / Productos y servicios) · Si el concepto incluye servicios: período facturado desde/hasta y fecha de vencimiento para el pago (estos tres campos aparecen y desaparecen según el concepto elegido) · Condición de venta · Moneda.

PASO 2A — Cliente (modo simple) Buscador sobre la libreta de clientes por nombre o CUIT. Al elegir un CUIT se autocompletan razón social, domicilio y condición frente al IVA desde el padrón. Campos: condición frente al IVA del receptor, tipo de documento (CUIT / CUIL / DNI / Consumidor Final), número de documento, razón social o nombre, domicilio comercial, condición de venta, correo para enviar el PDF.

PASO 2B — Clientes (modo múltiple) Selección múltiple desde la libreta guardada, filtrable por grupo (p. ej. "Alumnos 2026") y por búsqueda. Checkbox por fila, "seleccionar todos del grupo", contador permanente de marcados. Un panel lateral fijo muestra en todo momento cuántas facturas se van a emitir y con qué comprobante y período. Debe quedar explícito que los ítems se cargan una sola vez en el paso siguiente.

PASO 3 — Ítems e importes Tabla editable de ítems con: código, producto o servicio, cantidad, unidad de medida, precio unitario, % de bonificación, alícuota de IVA (21 / 10,5 / 0 / exento) y subtotal calculado. Botón para agregar y quitar filas. Panel de totales: importe neto gravado, IVA discriminado, otros tributos e importe total. En modo múltiple el panel aclara que ese total es POR CADA factura. Campo de observaciones que se imprime en todas.

PASO 4 — Revisar y emitir Resumen por bloques (emisión / destinatario(s) / ítems), cada bloque con un enlace "Editar" que vuelve a ese paso conservando lo cargado. Un encabezado destacado indica qué se va a emitir: "1 factura para X" o "N facturas, una por cliente", con importe por factura y total del lote. Opción de enviar el PDF por correo a los clientes que tengan mail cargado. Botón final explícito: "Emitir la factura" / "Emitir las N facturas".

Emisión masiva: progreso y resultado
PROGRESO Barra de avance con "N de M facturas" y porcentaje, contadores de emitidas / con error / en espera, y un registro en vivo con el resultado por cliente a medida que ARCA responde. Aviso de no cerrar la ventana. Posibilidad de pausar.

RESULTADO — regla de negocio central: SI UNA FACTURA FALLA, EL PROCESO CONTINÚA CON LAS DEMÁS. Pantalla final con: cantidad de emitidas, cantidad con error, total facturado y rango de numeración utilizado. Tabla con una fila por cliente que muestra estado, número de comprobante y CAE, o el motivo del error en lenguaje claro. Acciones: reintentar solo las fallidas, descargar todos los PDF, exportar el resultado a Excel, corregir el cliente que falló.

Pantallas complementarias

* INICIO: elección entre los dos modos, explicados con sus diferencias, más las últimas emisiones.
* LISTADO DE FACTURAS: filtros por fecha, tipo, cliente y estado; columnas de fecha, tipo, número, cliente, CAE, importe y estado; las facturas emitidas en lote se identifican como tales.
* DETALLE DE FACTURA: representación fiel del comprobante ARCA — recuadro con la letra y el código de comprobante, datos del emisor (razón social, CUIT, domicilio, ingresos brutos, inicio de actividades), punto de venta y número, fecha de emisión, período facturado y vencimiento de pago, datos del receptor (CUIT, condición frente al IVA, razón social, domicilio), tabla de ítems con alícuotas, totales con IVA discriminado, y al pie el código de barras, el número de CAE y su fecha de vencimiento. Acciones: descargar PDF, enviar por correo, imprimir, emitir nota de crédito.
* LIBRETA DE CLIENTES: alta y edición de clientes (documento, condición frente al IVA, domicilio, correo) y organización en grupos, que son los que alimentan la facturación múltiple.
* DATOS DEL EMISOR: razón social, CUIT, condición frente al IVA, ingresos brutos, inicio de actividades, domicilio; administración de puntos de venta con su última numeración; y estado de la conexión con ARCA (certificado digital, vencimiento, probar conexión).

Lineamientos visuales
Paleta simple y sobria: un fondo claro, texto casi negro y un único color de acento (azul acero) que marca la acción principal, el paso activo y los estados positivos. Sin colores decorativos adicionales. Tipografía condensada para títulos sobre una tipografía de texto legible. Layout de grilla modular, líneas finas, esquinas rectas, sin sombras pesadas ni cajas redondeadas. Íconos de trazo fino. Números siempre alineados con cifras tabulares. Densidad media: la pantalla no se llena de datos que el usuario no necesita en ese momento.

Requisitos no funcionales relevantes para el diseño

* Aplicación de escritorio (navegador). No se requiere versión móvil.
* Las tablas anchas hacen scroll horizontal antes que comprimir el texto.
* Todo estado interactivo (hover, foco de teclado, presionado, deshabilitado) debe estar definido; el foco de teclado es visible.
* Los lotes típicos van de 15 a 60 clientes, con techo previsto de 200.
