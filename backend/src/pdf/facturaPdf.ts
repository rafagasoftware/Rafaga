import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { CBTE_TIPO_ARCA, DOC_TIPO_ARCA, esCbteTipoSinIva } from '../arca/wsfe';

export interface DatosFacturaPdf {
  emisor: {
    razon_social: string;
    cuit: string;
    condicion_iva: string;
    domicilio: string | null;
    ingresos_brutos: string | null;
    inicio_actividades: string | null;
    leyenda_pdf: string | null;
    nombre_fantasia: string | null;
    logo: Buffer | null;
  };
  factura: {
    numero_comprobante: string;
    cae: string;
    cae_vencimiento: string;
    importe_total: number;
    cliente_tipo_documento: string;
    cliente_numero_documento: string;
    cliente_razon_social: string;
    cliente_domicilio: string | null;
    cliente_condicion_iva: string;
  };
  lote: {
    tipo_comprobante: string;
    fecha_emision: string;
    periodo_desde: string | null;
    periodo_hasta: string | null;
    vencimiento_pago: string | null;
    condicion_venta: string | null;
    punto_venta_numero: number;
  };
  items: Array<{
    codigo: string;
    descripcion: string;
    cantidad: number;
    unidad_medida: string | null;
    precio_unitario: number;
    bonificacion_pct: number;
    alicuota_iva: string;
  }>;
}

const ALICUOTA_LABEL: Record<string, string> = {
  '21': '21%',
  '10.5': '10,5%',
  '0': '0%',
  exento: 'Exento',
};

function formatearMoneda(valor: number): string {
  return valor.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
}

// A propósito NO usa `new Date(fechaIso).toLocaleDateString()`: un string
// "2026-09-26" se parsea como medianoche UTC, y en un huso horario detrás
// de UTC (como Argentina) eso cae en el día anterior. Como fechaIso ya
// viene en YYYY-MM-DD, alcanza con reordenar el texto, sin pasar por Date.
// Misma fórmula que frontend/src/pages/facturar/calculos.ts.
function formatearFecha(fechaIso: string): string {
  const [anio, mes, dia] = fechaIso.split('-');
  return `${dia}/${mes}/${anio}`;
}

function infoComprobante(tipoComprobante: string) {
  const letra = (tipoComprobante.split('_').pop() ?? '?').toUpperCase();
  const esNc = tipoComprobante.startsWith('nc_');
  const codigo = String(CBTE_TIPO_ARCA[tipoComprobante] ?? 0).padStart(3, '0');
  return { letra, codigo, label: `${esNc ? 'Nota de crédito' : 'Factura'} ${letra}` };
}

function calcularTotales(items: DatosFacturaPdf['items'], sinDiscriminarIva: boolean) {
  const subtotalItem = (item: DatosFacturaPdf['items'][number]) => item.cantidad * item.precio_unitario * (1 - item.bonificacion_pct / 100);

  if (sinDiscriminarIva) {
    const total = items.reduce((acumulado, item) => acumulado + subtotalItem(item), 0);
    return { neto: total, ivaPorAlicuota: {} as Record<string, number>, ivaTotal: 0, exento: 0, total };
  }

  let neto = 0;
  let exento = 0;
  const ivaPorAlicuota: Record<string, number> = {};

  for (const item of items) {
    const subtotal = subtotalItem(item);
    if (item.alicuota_iva === 'exento') {
      exento += subtotal;
      continue;
    }
    neto += subtotal;
    const tasa = Number(item.alicuota_iva) / 100;
    ivaPorAlicuota[item.alicuota_iva] = (ivaPorAlicuota[item.alicuota_iva] ?? 0) + subtotal * tasa;
  }

  const ivaTotal = Object.values(ivaPorAlicuota).reduce((acumulado, valor) => acumulado + valor, 0);
  return { neto, ivaPorAlicuota, ivaTotal, exento, total: neto + ivaTotal + exento };
}

// Texto que codifica el QR obligatorio de ARCA — especificación oficial:
// https://www.afip.gob.ar/fe/qr/documentos/QRespecificaciones.pdf
//
// importe tiene que ser exactamente el ImpTotal que ARCA autorizó (hasta 2
// decimales): factura.importe_total es un numeric sin redondear que calcula
// el frontend, y con precios como 833,33 + 21% queda en 1008,3293 — ARCA
// tiene 1008,33 y el verificador respondería "el importe no se corresponde".
async function generarUrlQr(datos: DatosFacturaPdf, importe: number): Promise<string> {
  const payload = {
    ver: 1,
    fecha: datos.lote.fecha_emision,
    cuit: Number(datos.emisor.cuit.replace(/\D/g, '')),
    ptoVta: datos.lote.punto_venta_numero,
    tipoCmp: CBTE_TIPO_ARCA[datos.lote.tipo_comprobante],
    nroCmp: Number(datos.factura.numero_comprobante),
    importe,
    moneda: 'PES',
    ctz: 1,
    tipoDocRec: DOC_TIPO_ARCA[datos.factura.cliente_tipo_documento] ?? 99,
    nroDocRec: Number(datos.factura.cliente_numero_documento.replace(/\D/g, '')) || 0,
    tipoCodAut: 'E',
    codAut: Number(datos.factura.cae),
  };

  const base64 = Buffer.from(JSON.stringify(payload)).toString('base64');
  return `https://www.arca.gob.ar/fe/qr/?p=${base64}`;
}

export async function generarFacturaPdf(datos: DatosFacturaPdf): Promise<Buffer> {
  const { emisor, factura, lote, items } = datos;
  const sinDiscriminarIva = esCbteTipoSinIva(CBTE_TIPO_ARCA[lote.tipo_comprobante] ?? 0);
  const totales = calcularTotales(items, sinDiscriminarIva);
  const comprobante = infoComprobante(lote.tipo_comprobante);
  const urlQr = await generarUrlQr(datos, Number(totales.total.toFixed(2)));
  // margin: la "zona silenciosa" alrededor del QR — sin ella, muchos
  // lectores de cámara no llegan a ubicar el código aunque se vea bien.
  // scale: píxeles por módulo, entero. La URL tiene ~280 caracteres (QR de
  // ~65x65 módulos); con un ancho fijo de 110px cada módulo medía ~1,5px, con
  // bordes desparejos que se empastan al ampliar o imprimir. Se genera
  // grande y el PDF lo reduce a 80pt, que se ve nítido.
  const qrPng = await QRCode.toBuffer(urlQr, { type: 'png', scale: 8, margin: 4 });

  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const fin = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const anchoUtil = doc.page.width - 80;

  // Encabezado: logo del emisor (si tiene) a la izquierda, letra/código al
  // centro, datos del comprobante a la derecha. Los datos identificatorios
  // del emisor van todos juntos más abajo, en su propia sección — así no
  // hay que decidir cuáles entran acá arriba y cuáles no.
  if (emisor.logo) {
    try {
      doc.image(emisor.logo, 40, 40, { fit: [140, 50] });
    } catch {
      // Buffer no reconocido como imagen (pdfkit solo entiende JPEG/PNG) —
      // se omite en vez de tirar abajo la generación de todo el PDF.
    }
  }

  // Nombre de fantasía (negrita, margen mínimo) y leyenda debajo del logo
  // (o del área que le corresponde, si no cargó uno). La leyenda es texto
  // libre del emisor que respeta los saltos de línea que haya escrito,
  // porque doc.text() ya interpreta "\n" como fin de línea.
  let yIzquierda = 40 + (emisor.logo ? 60 : 0);
  if (emisor.nombre_fantasia) {
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#000');
    doc.text(emisor.nombre_fantasia, 40, yIzquierda, { width: 200 });
    yIzquierda += doc.heightOfString(emisor.nombre_fantasia, { width: 200 }) + 2;
  }
  if (emisor.leyenda_pdf) {
    doc.font('Helvetica').fontSize(8).fillColor('#555');
    doc.text(emisor.leyenda_pdf, 40, yIzquierda, { width: 200 });
    yIzquierda += doc.heightOfString(emisor.leyenda_pdf, { width: 200 });
  }

  doc.rect(270, 40, 55, 55).stroke();
  doc.font('Helvetica-Bold').fontSize(28).fillColor('#000').text(comprobante.letra, 270, 52, { width: 55, align: 'center' });
  doc.font('Helvetica').fontSize(7).text(`COD. ${comprobante.codigo}`, 270, 82, { width: 55, align: 'center' });

  doc.font('Helvetica-Bold').fontSize(14).fillColor('#000').text(comprobante.label, 355, 40, { width: 200, align: 'right' });
  doc
    .font('Helvetica')
    .fontSize(9)
    .text(`${String(lote.punto_venta_numero).padStart(4, '0')}-${factura.numero_comprobante}`, 355, 60, { width: 200, align: 'right' });
  doc.fillColor('#555');

  // Alto real de cada línea, no un valor fijo: "Condición de venta" puede
  // traer varias opciones separadas por coma (el emisor puede elegir más
  // de una) y envolver a dos o tres líneas — con un alto fijo por línea
  // esas líneas de más pisarían la sección de abajo.
  let yComprobante = 73;
  const lineasDerecha: string[] = [`Emisión ${formatearFecha(lote.fecha_emision)}`];
  if (lote.periodo_desde) {
    lineasDerecha.push(`Período: Desde ${formatearFecha(lote.periodo_desde)} Hasta ${formatearFecha(lote.periodo_hasta!)}`);
  }
  if (lote.vencimiento_pago) lineasDerecha.push(`Vencimiento de pago: ${formatearFecha(lote.vencimiento_pago)}`);
  if (lote.condicion_venta) lineasDerecha.push(`Condición de venta: ${lote.condicion_venta}`);

  for (const linea of lineasDerecha) {
    doc.text(linea, 355, yComprobante, { width: 200, align: 'right' });
    yComprobante += doc.heightOfString(linea, { width: 200, align: 'right' }) + 4;
  }

  const yDivisor = Math.max(105, yComprobante + 20, yIzquierda + 15);
  doc
    .moveTo(40, yDivisor)
    .lineTo(40 + anchoUtil, yDivisor)
    .strokeColor('#ccc')
    .stroke();

  // Emisor: todos sus datos identificatorios juntos, en una sola sección
  // (antes estaban repartidos entre el encabezado y esta franja).
  let y = yDivisor + 10;
  const alturaCajaEmisor = 76;
  doc.rect(40, y, anchoUtil, alturaCajaEmisor).fillAndStroke('#F4F6F7', '#D7DCE0');
  doc.fillColor('#555').fontSize(7).text('EMISOR', 48, y + 8);
  doc
    .fillColor('#000')
    .font('Helvetica')
    .fontSize(10)
    .text('Razón Social: ', 48, y + 19, { continued: true, width: anchoUtil - 16 });
  doc.font('Helvetica-Bold').text(emisor.razon_social);
  doc.font('Helvetica').fontSize(9).fillColor('#555');
  doc.text(`CUIT: ${emisor.cuit}`, 48, y + 34, { width: 240 });
  doc.text(`Condición frente al IVA: ${emisor.condicion_iva}`, 300, y + 34, { width: 247, align: 'right' });
  if (emisor.domicilio) doc.text(`Domicilio: ${emisor.domicilio}`, 48, y + 48, { width: 240 });
  if (emisor.ingresos_brutos) doc.text(`Ingresos Brutos: ${emisor.ingresos_brutos}`, 300, y + 48, { width: 247, align: 'right' });
  if (emisor.inicio_actividades) {
    doc.text(`Inicio de actividades: ${formatearFecha(emisor.inicio_actividades)}`, 48, y + 62, { width: 240 });
  }

  // Cliente
  y += alturaCajaEmisor + 15;
  const alturaCajaReceptor = 62;
  doc.rect(40, y, anchoUtil, alturaCajaReceptor).fillAndStroke('#F4F6F7', '#D7DCE0');
  doc.fillColor('#555').fontSize(7).text('CLIENTE', 48, y + 8);
  doc
    .fillColor('#000')
    .font('Helvetica')
    .fontSize(10)
    .text('Razón Social: ', 48, y + 19, { continued: true, width: anchoUtil - 16 });
  doc.font('Helvetica-Bold').text(factura.cliente_razon_social);
  doc.font('Helvetica').fontSize(9).fillColor('#555');
  doc.text(`Documento: ${factura.cliente_tipo_documento} ${factura.cliente_numero_documento}`, 48, y + 34, { width: 240 });
  doc.text(`Condición frente al IVA: ${factura.cliente_condicion_iva}`, 300, y + 34, { width: 247, align: 'right' });
  if (factura.cliente_domicilio) doc.text(`Domicilio: ${factura.cliente_domicilio}`, 48, y + 48, { width: 240 });

  // Ítems
  y += alturaCajaReceptor + 20;
  const columnas = [
    { titulo: 'Código', x: 40, ancho: 45 },
    { titulo: 'Descripción', x: 90, ancho: 185 },
    { titulo: 'Cant.', x: 280, ancho: 40, align: 'right' as const },
    { titulo: 'P. unitario', x: 325, ancho: 55, align: 'right' as const },
    { titulo: 'Bonif. %', x: 385, ancho: 35, align: 'right' as const },
    { titulo: 'IVA', x: 425, ancho: 40 },
    { titulo: 'Subtotal', x: 470, ancho: 85, align: 'right' as const },
  ];

  doc.font('Helvetica-Bold').fontSize(8).fillColor('#000');
  for (const col of columnas) {
    if (sinDiscriminarIva && col.titulo === 'IVA') continue;
    doc.text(col.titulo, col.x, y, { width: col.ancho, align: col.align });
  }
  y += 14;
  doc
    .moveTo(40, y)
    .lineTo(40 + anchoUtil, y)
    .strokeColor('#ccc')
    .stroke();
  y += 6;

  doc.font('Helvetica').fontSize(8.5);
  for (const item of items) {
    const subtotal = item.cantidad * item.precio_unitario * (1 - item.bonificacion_pct / 100);
    doc.text(item.codigo || '—', columnas[0].x, y, { width: columnas[0].ancho });
    doc.text(item.descripcion, columnas[1].x, y, { width: columnas[1].ancho });
    doc.text(`${item.cantidad} ${item.unidad_medida ?? ''}`, columnas[2].x, y, { width: columnas[2].ancho, align: 'right' });
    doc.text(formatearMoneda(item.precio_unitario), columnas[3].x, y, { width: columnas[3].ancho, align: 'right' });
    doc.text(String(item.bonificacion_pct), columnas[4].x, y, { width: columnas[4].ancho, align: 'right' });
    if (!sinDiscriminarIva) doc.text(ALICUOTA_LABEL[item.alicuota_iva] ?? item.alicuota_iva, columnas[5].x, y, { width: columnas[5].ancho });
    doc.text(formatearMoneda(subtotal), columnas[6].x, y, { width: columnas[6].ancho, align: 'right' });
    // La descripción puede ocupar varias líneas (ej. el concepto de una cuota
    // con el nombre del alumno): el renglón crece en vez de pisar al siguiente.
    y += Math.max(16, doc.heightOfString(item.descripcion, { width: columnas[1].ancho }) + 6);
  }

  // Totales
  y += 10;
  const anchoTotales = 200;
  const xTotales = 40 + anchoUtil - anchoTotales;
  doc.fontSize(9);
  if (!sinDiscriminarIva) {
    doc.text('Neto gravado', xTotales, y, { width: 120 });
    doc.text(formatearMoneda(totales.neto), xTotales + 120, y, { width: 80, align: 'right' });
    y += 14;
    for (const [alicuota, monto] of Object.entries(totales.ivaPorAlicuota)) {
      doc.text(`IVA ${ALICUOTA_LABEL[alicuota] ?? alicuota}`, xTotales, y, { width: 120 });
      doc.text(formatearMoneda(monto), xTotales + 120, y, { width: 80, align: 'right' });
      y += 14;
    }
    if (totales.exento > 0) {
      doc.text('Exento', xTotales, y, { width: 120 });
      doc.text(formatearMoneda(totales.exento), xTotales + 120, y, { width: 80, align: 'right' });
      y += 14;
    }
  }
  doc
    .moveTo(xTotales, y + 2)
    .lineTo(xTotales + anchoTotales, y + 2)
    .strokeColor('#ccc')
    .stroke();
  y += 8;
  doc.font('Helvetica-Bold').fontSize(11);
  doc.text('Total', xTotales, y, { width: 120 });
  doc.text(formatearMoneda(totales.total), xTotales + 120, y, { width: 80, align: 'right' });

  // Pie: QR + CAE, según el diseño que exige ARCA en su especificación.
  // Reserva 160pt: 80 del QR + 12 de separación + lugar para el texto
  // legal, sin pasarse del margen inferior de la página (si no, PDFKit
  // manda ese texto a una página nueva en blanco).
  const yPie = Math.max(y + 40, doc.page.height - 160);
  doc.image(qrPng, 40, yPie, { width: 80 });
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#000').text('ARCA', 130, yPie);
  doc.font('Helvetica').fontSize(8).fillColor('#555').text('Comprobante autorizado', 130, yPie + 13);

  doc.font('Helvetica').fontSize(9).fillColor('#000');
  doc.text(`CAE N°: ${factura.cae}`, 300, yPie, { width: 255, align: 'right' });
  doc.fillColor('#555').text(`Fecha de Vto. de CAE: ${formatearFecha(factura.cae_vencimiento)}`, 300, yPie + 13, { width: 255, align: 'right' });

  doc
    .fontSize(7)
    .fillColor('#888')
    .text(
      'Esta Administración Federal no se responsabiliza por la veracidad de los datos ingresados en el detalle de la operación.',
      40,
      yPie + 92,
      { width: anchoUtil, align: 'center' },
    );

  doc.end();
  return fin;
}
