import { postSoap } from './http';
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

// Consulta la condición de IVA del propio emisor (cuitRepresentada e
// idPersona son el mismo CUIT). En homologación el padrón solo conoce
// CUITs de ejemplo de ARCA, así que ahí esta consulta falla con "no
// existe persona" — es esperable y no afecta la facturación.
export async function consultarCondicionIva(credenciales: Credenciales, cuit: string, ambiente: Ambiente): Promise<CondicionIvaArca> {
  const cuerpo =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:a5="${NS}">` +
    '<soapenv:Header/>' +
    '<soapenv:Body>' +
    '<a5:getPersona_v2>' +
    `<token>${credenciales.token}</token>` +
    `<sign>${credenciales.sign}</sign>` +
    `<cuitRepresentada>${cuit}</cuitRepresentada>` +
    `<idPersona>${cuit}</idPersona>` +
    '</a5:getPersona_v2>' +
    '</soapenv:Body>' +
    '</soapenv:Envelope>';

  const respuesta = await postSoap(PADRON_URLS[ambiente], cuerpo, '');
  const texto = respuesta.texto;

  const fallo = texto.match(/<faultstring>([\s\S]*?)<\/faultstring>/);
  if (fallo) {
    throw new Error(`ARCA rechazó la consulta al padrón: ${fallo[1]}`);
  }
  if (!respuesta.ok) {
    throw new Error(`El padrón de ARCA respondió con estado ${respuesta.status}.`);
  }

  const errorConstancia = texto.match(/<errorConstancia>[\s\S]*?<error>([\s\S]*?)<\/error>/);
  if (errorConstancia) {
    throw new Error(`ARCA no pudo devolver los datos de este CUIT: ${errorConstancia[1]}`);
  }

  // No hay un campo "condición de IVA" directo: se infiere de qué bloque
  // de régimen trae la respuesta y, dentro del régimen general, de si
  // figura un impuesto "IVA" inscripto.
  if (/<datosMonotributo>/.test(texto)) {
    return 'Monotributista';
  }

  const bloqueRegimenGeneral = texto.match(/<datosRegimenGeneral>([\s\S]*?)<\/datosRegimenGeneral>/)?.[1];
  if (bloqueRegimenGeneral !== undefined) {
    const tieneIva = /<descripcionImpuesto>IVA<\/descripcionImpuesto>/.test(bloqueRegimenGeneral);
    return tieneIva ? 'Responsable Inscripto' : 'Exento';
  }

  throw new Error(`ARCA no devolvió datos de régimen para este CUIT.`);
}
