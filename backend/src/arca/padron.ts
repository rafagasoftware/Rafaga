import type { Ambiente, Credenciales } from './wsaa';

// ws_sr_constancia_inscripcion — consulta al padrón de ARCA los datos de
// inscripción de un CUIT. Lo usamos para verificar que la condición de
// IVA que cargó el emisor a mano coincida con lo que ARCA tiene
// registrado (de eso depende qué tipo de comprobante puede emitir).
const PADRON_URLS: Record<Ambiente, string> = {
  homologacion: 'https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA5',
  produccion: 'https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA5',
};

const NS = 'http://a5.soap.ws.server.puc.sr/';

export type CondicionIvaArca = 'Responsable Inscripto' | 'Monotributista' | 'Exento';

export interface DatosPadron {
  condicionIva: CondicionIvaArca;
  crudo: string;
}

export async function consultarCondicionIva(
  credenciales: Credenciales,
  cuitRepresentada: string,
  ambiente: Ambiente,
  idPersona: string = cuitRepresentada,
): Promise<DatosPadron> {
  const cuerpo =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:a5="${NS}">` +
    '<soapenv:Header/>' +
    '<soapenv:Body>' +
    '<a5:getPersona_v2>' +
    `<token>${credenciales.token}</token>` +
    `<sign>${credenciales.sign}</sign>` +
    `<cuitRepresentada>${cuitRepresentada}</cuitRepresentada>` +
    `<idPersona>${idPersona}</idPersona>` +
    '</a5:getPersona_v2>' +
    '</soapenv:Body>' +
    '</soapenv:Envelope>';

  const respuesta = await fetch(PADRON_URLS[ambiente], {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '' },
    body: cuerpo,
  });

  const texto = await respuesta.text();

  // TODO temporal: se manda la respuesta cruda de ARCA en el mensaje de
  // error para poder verla en pantalla mientras se depura esta consulta.
  // Sacar el "\n\n${texto}" de cada mensaje de acá abajo una vez que la
  // integración esté confirmada funcionando.
  const fallo = texto.match(/<faultstring>([\s\S]*?)<\/faultstring>/);
  if (fallo) {
    throw new Error(`ARCA rechazó la consulta al padrón: ${fallo[1]}\n\n${texto}`);
  }
  if (!respuesta.ok) {
    throw new Error(`El padrón de ARCA respondió con estado ${respuesta.status}.\n\n${texto}`);
  }

  const errorConstancia = texto.match(/<errorConstancia>[\s\S]*?<error>([\s\S]*?)<\/error>/);
  if (errorConstancia) {
    throw new Error(`ARCA no pudo devolver los datos de este CUIT: ${errorConstancia[1]}\n\n${texto}`);
  }

  // No hay un campo "condición de IVA" directo: se infiere de qué bloque
  // de régimen trae la respuesta y, dentro del régimen general, de si
  // figura un impuesto "IVA" inscripto.
  if (/<datosMonotributo>/.test(texto)) {
    return { condicionIva: 'Monotributista', crudo: texto };
  }

  const bloqueRegimenGeneral = texto.match(/<datosRegimenGeneral>([\s\S]*?)<\/datosRegimenGeneral>/)?.[1];
  if (bloqueRegimenGeneral !== undefined) {
    const tieneIva = /<descripcionImpuesto>IVA<\/descripcionImpuesto>/.test(bloqueRegimenGeneral);
    return { condicionIva: tieneIva ? 'Responsable Inscripto' : 'Exento', crudo: texto };
  }

  throw new Error(`ARCA no devolvió datos de régimen para este CUIT.\n\n${texto}`);
}
