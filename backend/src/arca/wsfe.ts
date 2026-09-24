import type { Ambiente, Credenciales } from './wsaa';

const WSFE_URLS: Record<Ambiente, string> = {
  homologacion: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',
  produccion: 'https://servicios1.afip.gov.ar/wsfev1/service.asmx',
};

const NS = 'http://ar.gov.afip.dif.FEV1/';

function envolverSoap(cuerpo: string): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="${NS}">` +
    '<soapenv:Header/>' +
    `<soapenv:Body>${cuerpo}</soapenv:Body>` +
    '</soapenv:Envelope>'
  );
}

function bloqueAuth(credenciales: Credenciales, cuit: string): string {
  return `<ar:Auth><ar:Token>${credenciales.token}</ar:Token><ar:Sign>${credenciales.sign}</ar:Sign><ar:Cuit>${cuit}</ar:Cuit></ar:Auth>`;
}

async function llamarWSFE(operacion: string, cuerpoInterno: string, ambiente: Ambiente): Promise<string> {
  const sobre = envolverSoap(`<ar:${operacion}>${cuerpoInterno}</ar:${operacion}>`);

  const respuesta = await fetch(WSFE_URLS[ambiente], {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      SOAPAction: `"${NS}${operacion}"`,
    },
    body: sobre,
  });

  const texto = await respuesta.text();

  const fallo = texto.match(/<faultstring>([\s\S]*?)<\/faultstring>/);
  if (fallo) {
    throw new Error(`ARCA rechazó el pedido: ${fallo[1]}`);
  }
  if (!respuesta.ok) {
    throw new Error(`WSFE respondió con estado ${respuesta.status}.`);
  }

  // WSFE devuelve errores/observaciones de negocio con código 200 igual
  // (no como fault SOAP), adentro de <Errors> o <Events>.
  const error = texto.match(/<Err>[\s\S]*?<Msg>([\s\S]*?)<\/Msg>/);
  if (error) {
    throw new Error(`ARCA respondió con un error: ${error[1]}`);
  }

  return texto;
}

export interface PuntoVentaArca {
  numero: number;
  bloqueado: boolean;
  fechaBaja: string | null;
}

export async function consultarPuntosVenta(credenciales: Credenciales, cuit: string, ambiente: Ambiente): Promise<PuntoVentaArca[]> {
  const respuesta = await llamarWSFE('FEParamGetPtosVenta', bloqueAuth(credenciales, cuit), ambiente);

  const puntos: PuntoVentaArca[] = [];
  const regexPunto = /<PtoVenta>([\s\S]*?)<\/PtoVenta>/g;
  let coincidencia: RegExpExecArray | null;

  while ((coincidencia = regexPunto.exec(respuesta)) !== null) {
    const bloque = coincidencia[1];
    const numero = bloque.match(/<Nro>(\d+)<\/Nro>/)?.[1];
    if (!numero) continue;

    puntos.push({
      numero: Number(numero),
      bloqueado: /<Bloqueado>S<\/Bloqueado>/.test(bloque),
      fechaBaja: bloque.match(/<FchBaja>(\d+)<\/FchBaja>/)?.[1] ?? null,
    });
  }

  return puntos;
}

export interface ActividadArca {
  id: number;
  orden: number;
  descripcion: string;
}

// Actividades económicas que el emisor tiene registradas en ARCA (Sistema
// Registral) — no confundir con la vinculación punto de venta↔actividad
// (esa es aparte, y opcional). Se usa para el selector "Actividad" del
// paso 1 del asistente, cuando el emisor quiere aclarar a cuál corresponde
// cada comprobante (por defecto Rafaga no lo pide: ARCA solo lo exige para
// rubros específicos como Cárnico/Harinero/Tabaco).
export async function consultarActividades(credenciales: Credenciales, cuit: string, ambiente: Ambiente): Promise<ActividadArca[]> {
  const respuesta = await llamarWSFE('FEParamGetActividades', bloqueAuth(credenciales, cuit), ambiente);

  const actividades: ActividadArca[] = [];
  const regexActividad = /<ActividadesTipo>([\s\S]*?)<\/ActividadesTipo>/g;
  let coincidencia: RegExpExecArray | null;

  while ((coincidencia = regexActividad.exec(respuesta)) !== null) {
    const bloque = coincidencia[1];
    const id = bloque.match(/<Id>(\d+)<\/Id>/)?.[1];
    const descripcion = bloque.match(/<Desc>([\s\S]*?)<\/Desc>/)?.[1];
    if (!id || !descripcion) continue;

    actividades.push({
      id: Number(id),
      orden: Number(bloque.match(/<Orden>(\d+)<\/Orden>/)?.[1] ?? 0),
      descripcion,
    });
  }

  return actividades;
}

// Códigos fijos de las tablas de parámetros de ARCA (estables desde hace
// años — no hace falta consultarlos por webservice para el set acotado de
// opciones que ofrece Rafaga).
export const CBTE_TIPO_ARCA: Record<string, number> = {
  factura_a: 1,
  nc_a: 3,
  factura_b: 6,
  nc_b: 8, // 7 es Nota de Débito B
  factura_c: 11,
  nc_c: 13,
};

export const DOC_TIPO_ARCA: Record<string, number> = {
  CUIT: 80,
  CUIL: 86,
  DNI: 96,
  CF: 99,
};

const CONCEPTO_ARCA: Record<string, number> = {
  productos: 1,
  servicios: 2,
  productos_servicios: 3,
};

// Id de alícuota de IVA. "exento" no tiene entrada acá: no va en el array
// de Iva, se informa aparte como ImpOpEx.
const ALICUOTA_IVA_ARCA: Record<string, number> = {
  '0': 3,
  '10.5': 4,
  '21': 5,
  '27': 6,
};

// Condición de IVA del receptor, obligatoria en FECAESolicitar desde la
// RG 5616 (con vigencia postergada varias veces — se manda siempre, no
// tiene costo hacerlo aunque en algún momento vuelva a ser opcional).
const CONDICION_IVA_RECEPTOR_ARCA: Record<string, number> = {
  'Responsable Inscripto': 1,
  Monotributista: 6,
  Exento: 4,
  'Consumidor Final': 5,
};

function fechaArca(fechaIso: string): string {
  return fechaIso.replaceAll('-', '');
}

export interface ItemParaTotales {
  cantidad: number;
  precio_unitario: number;
  bonificacion_pct: number;
  alicuota_iva: string;
}

export interface TotalesFactura {
  neto: number;
  ivaPorAlicuota: Record<string, number>;
  ivaTotal: number;
  exento: number;
  total: number;
}

// Factura/NC "C": el emisor (monotributista/exento) no discrimina IVA en
// absoluto — el precio cargado ya es el total, sin nada para sumar encima.
export function esCbteTipoSinIva(cbteTipo: number): boolean {
  return cbteTipo === 11 || cbteTipo === 13;
}

// Misma fórmula que frontend/src/pages/facturar/calculos.ts — se duplica
// (es chica) en vez de compartir paquete entre front y back.
export function calcularTotalesItems(items: ItemParaTotales[], sinDiscriminarIva: boolean): TotalesFactura {
  const subtotalItem = (item: ItemParaTotales) => item.cantidad * item.precio_unitario * (1 - item.bonificacion_pct / 100);

  if (sinDiscriminarIva) {
    const total = items.reduce((acumulado, item) => acumulado + subtotalItem(item), 0);
    return { neto: total, ivaPorAlicuota: {}, ivaTotal: 0, exento: 0, total };
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

export interface ClienteParaFactura {
  tipo_documento: string;
  numero_documento: string;
  razon_social: string;
  domicilio: string | null;
  condicion_iva: string;
}

export interface DatosServicio {
  periodoDesde: string | null;
  periodoHasta: string | null;
  vencimientoPago: string | null;
}

export interface ResultadoCAE {
  aprobado: boolean;
  cae: string | null;
  caeVencimiento: string | null;
  motivo: string | null;
}

// Pide a ARCA el próximo número disponible para (PtoVta, CbteTipo). Se
// llama una sola vez por lote — todas las facturas del lote comparten
// punto de venta y tipo de comprobante — y de ahí en más se incrementa
// localmente con cada CAE aprobado.
export async function consultarUltimoAutorizado(
  credenciales: Credenciales,
  cuit: string,
  ptoVta: number,
  cbteTipo: number,
  ambiente: Ambiente,
): Promise<number> {
  const cuerpo = bloqueAuth(credenciales, cuit) + `<ar:PtoVta>${ptoVta}</ar:PtoVta><ar:CbteTipo>${cbteTipo}</ar:CbteTipo>`;
  const respuesta = await llamarWSFE('FECompUltimoAutorizado', cuerpo, ambiente);
  const numero = respuesta.match(/<CbteNro>(\d+)<\/CbteNro>/)?.[1];
  return numero ? Number(numero) : 0;
}

// Pide el CAE de un único comprobante (CantReg=1): más simple de razonar
// que un lote de varios en la misma llamada, y permite reintentar/registrar
// el resultado factura por factura sin que un rechazo tire abajo el resto.
export interface ComprobanteAsociado {
  tipo: number;
  ptoVta: number;
  nro: number;
}

export async function solicitarCAE(
  credenciales: Credenciales,
  cuit: string,
  ptoVta: number,
  cbteTipo: number,
  cbteNro: number,
  cliente: ClienteParaFactura,
  totales: TotalesFactura,
  concepto: string,
  fechaEmisionIso: string,
  servicio: DatosServicio,
  ambiente: Ambiente,
  alcanzadoRg3368: boolean,
  actividadId: number | null,
  comprobanteAsociado?: ComprobanteAsociado,
): Promise<ResultadoCAE> {
  const condicionIvaReceptor = CONDICION_IVA_RECEPTOR_ARCA[cliente.condicion_iva] ?? 5;

  // Factura/NC "A": solo entre Responsables Inscriptos (o Monotributistas,
  // que ARCA también admite en clase A) identificados por CUIT — si el
  // receptor es Exento o Consumidor Final corresponde una B, no una A.
  // Factura/NC "B": lo inverso — no se le puede emitir a un receptor
  // Responsable Inscripto ni Monotributista, a esos les corresponde A.
  // Se corta acá, sin llamar a ARCA, porque ya sabemos que la va a rechazar
  // (son las mismas reglas que devuelve FEParamGetCondicionIvaReceptor).
  const esClaseA = cbteTipo === 1 || cbteTipo === 3;
  const esClaseB = cbteTipo === 6 || cbteTipo === 8;
  const receptorEsInscriptoOMonotributo = condicionIvaReceptor === 1 || condicionIvaReceptor === 6;

  if (esClaseA && cliente.tipo_documento !== 'CUIT') {
    return {
      aprobado: false,
      cae: null,
      caeVencimiento: null,
      motivo: 'Los comprobantes tipo A solo se le pueden emitir a un cliente cuyo tipo de documento sea CUIT.',
    };
  }
  if (esClaseA && !receptorEsInscriptoOMonotributo) {
    return {
      aprobado: false,
      cae: null,
      caeVencimiento: null,
      motivo: 'Los comprobantes tipo A solo se le pueden emitir a un cliente Responsable Inscripto o Monotributista — a este le corresponde un tipo B.',
    };
  }
  if (esClaseB && receptorEsInscriptoOMonotributo) {
    return {
      aprobado: false,
      cae: null,
      caeVencimiento: null,
      motivo: 'Los comprobantes tipo B no se le pueden emitir a un cliente Responsable Inscripto ni Monotributista — a este le corresponde un tipo A.',
    };
  }

  const conceptoArca = CONCEPTO_ARCA[concepto] ?? 1;
  const docTipo = DOC_TIPO_ARCA[cliente.tipo_documento] ?? 99;
  const docNro = cliente.tipo_documento === 'CF' ? '0' : cliente.numero_documento.replace(/\D/g, '');

  // ARCA rechaza el comprobante C si se manda el objeto Iva — pide todo el
  // importe junto en ImpNeto (ImpTotal = ImpNeto + ImpTrib).
  const esComprobanteC = esCbteTipoSinIva(cbteTipo);

  const impNeto = esComprobanteC ? totales.total : totales.neto;
  const impOpEx = esComprobanteC ? 0 : totales.exento;
  const impIVA = esComprobanteC ? 0 : totales.ivaTotal;

  const ivaXml = esComprobanteC
    ? ''
    : Object.entries(totales.ivaPorAlicuota)
        .map(([alicuota, importe]) => {
          const baseImp = importe / (Number(alicuota) / 100);
          return (
            '<ar:AlicIva>' +
            `<ar:Id>${ALICUOTA_IVA_ARCA[alicuota]}</ar:Id>` +
            `<ar:BaseImp>${baseImp.toFixed(2)}</ar:BaseImp>` +
            `<ar:Importe>${importe.toFixed(2)}</ar:Importe>` +
            '</ar:AlicIva>'
          );
        })
        .join('');

  const fechasServicio =
    conceptoArca === 1
      ? ''
      : `<ar:FchServDesde>${fechaArca(servicio.periodoDesde!)}</ar:FchServDesde>` +
        `<ar:FchServHasta>${fechaArca(servicio.periodoHasta!)}</ar:FchServHasta>` +
        `<ar:FchVtoPago>${fechaArca(servicio.vencimientoPago!)}</ar:FchVtoPago>`;

  // Obligatorio desde la RG 4540/19 en cualquier nota de crédito/débito:
  // a qué comprobante corrige. Cuit se omite — solo hace falta cuando el
  // comprobante asociado es de otro CUIT (facturas de crédito MiPyme).
  const cbtesAsocXml = comprobanteAsociado
    ? '<ar:CbtesAsoc><ar:CbteAsoc>' +
      `<ar:Tipo>${comprobanteAsociado.tipo}</ar:Tipo>` +
      `<ar:PtoVta>${comprobanteAsociado.ptoVta}</ar:PtoVta>` +
      `<ar:Nro>${comprobanteAsociado.nro}</ar:Nro>` +
      '</ar:CbteAsoc></ar:CbtesAsoc>'
    : '';

  // RG 3.368: establecimientos de educación de gestión privada. El Id=10
  // en 1 avisa que el comprobante está alcanzado; 1011/1012 son el mismo
  // tipo/número de documento del receptor que ya va en DocTipo/DocNro —
  // ARCA los pide repetidos acá adentro, no es un dato nuevo a pedir.
  const opcionalesXml = alcanzadoRg3368
    ? '<ar:Opcionales>' +
      '<ar:Opcional><ar:Id>10</ar:Id><ar:Valor>1</ar:Valor></ar:Opcional>' +
      `<ar:Opcional><ar:Id>1011</ar:Id><ar:Valor>${docTipo}</ar:Valor></ar:Opcional>` +
      `<ar:Opcional><ar:Id>1012</ar:Id><ar:Valor>${docNro}</ar:Valor></ar:Opcional>` +
      '</ar:Opcionales>'
    : '';

  // Opcional en general (ARCA solo la exige para rubros como Cárnico,
  // Harinero o Tabaco): a cuál de las actividades económicas registradas
  // del emisor corresponde este comprobante, cuando el emisor eligió
  // aclararlo desde el paso 1 del asistente.
  const actividadesXml = actividadId
    ? `<ar:Actividades><ar:Actividad><ar:Id>${actividadId}</ar:Id></ar:Actividad></ar:Actividades>`
    : '';

  const detalle =
    '<ar:FECAEDetRequest>' +
    `<ar:Concepto>${conceptoArca}</ar:Concepto>` +
    `<ar:DocTipo>${docTipo}</ar:DocTipo>` +
    `<ar:DocNro>${docNro}</ar:DocNro>` +
    `<ar:CbteDesde>${cbteNro}</ar:CbteDesde>` +
    `<ar:CbteHasta>${cbteNro}</ar:CbteHasta>` +
    `<ar:CbteFch>${fechaArca(fechaEmisionIso)}</ar:CbteFch>` +
    `<ar:ImpTotal>${totales.total.toFixed(2)}</ar:ImpTotal>` +
    '<ar:ImpTotConc>0.00</ar:ImpTotConc>' +
    `<ar:ImpNeto>${impNeto.toFixed(2)}</ar:ImpNeto>` +
    `<ar:ImpOpEx>${impOpEx.toFixed(2)}</ar:ImpOpEx>` +
    `<ar:ImpIVA>${impIVA.toFixed(2)}</ar:ImpIVA>` +
    '<ar:ImpTrib>0.00</ar:ImpTrib>' +
    fechasServicio +
    '<ar:MonId>PES</ar:MonId>' +
    '<ar:MonCotiz>1</ar:MonCotiz>' +
    cbtesAsocXml +
    `<ar:CondicionIVAReceptorId>${condicionIvaReceptor}</ar:CondicionIVAReceptorId>` +
    (ivaXml ? `<ar:Iva>${ivaXml}</ar:Iva>` : '') +
    opcionalesXml +
    actividadesXml +
    '</ar:FECAEDetRequest>';

  const cuerpo =
    bloqueAuth(credenciales, cuit) +
    '<ar:FeCAEReq>' +
    `<ar:FeCabReq><ar:CantReg>1</ar:CantReg><ar:PtoVta>${ptoVta}</ar:PtoVta><ar:CbteTipo>${cbteTipo}</ar:CbteTipo></ar:FeCabReq>` +
    `<ar:FeDetReq>${detalle}</ar:FeDetReq>` +
    '</ar:FeCAEReq>';

  const respuesta = await llamarWSFE('FECAESolicitar', cuerpo, ambiente);

  const bloqueDetalle = respuesta.match(/<FECAEDetResponse>([\s\S]*?)<\/FECAEDetResponse>/)?.[1];
  if (!bloqueDetalle) {
    throw new Error('La respuesta de FECAESolicitar no tiene el formato esperado.');
  }

  const resultado = bloqueDetalle.match(/<Resultado>(\w)<\/Resultado>/)?.[1];

  if (resultado === 'A') {
    const cae = bloqueDetalle.match(/<CAE>(\d+)<\/CAE>/)?.[1] ?? null;
    const vencimiento = bloqueDetalle.match(/<CAEFchVto>(\d+)<\/CAEFchVto>/)?.[1] ?? null;
    return {
      aprobado: true,
      cae,
      caeVencimiento: vencimiento ? `${vencimiento.slice(0, 4)}-${vencimiento.slice(4, 6)}-${vencimiento.slice(6, 8)}` : null,
      motivo: null,
    };
  }

  const motivo = bloqueDetalle.match(/<Msg>([\s\S]*?)<\/Msg>/)?.[1] ?? 'ARCA rechazó el comprobante sin especificar el motivo.';
  return { aprobado: false, cae: null, caeVencimiento: null, motivo };
}
