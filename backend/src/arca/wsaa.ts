import forge from 'node-forge';

export type Ambiente = 'homologacion' | 'produccion';

const WSAA_URLS: Record<Ambiente, string> = {
  homologacion: 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms',
  produccion: 'https://wsaa.afip.gov.ar/ws/services/LoginCms',
};

export interface Credenciales {
  token: string;
  sign: string;
  expiracion: Date;
}

// Un Ticket de Acceso (TA) es válido ~12hs y ARCA espera que no lo
// pidamos de nuevo antes de que venza. Cache en memoria del proceso:
// alcanza para esta escala (un solo backend, sin múltiples instancias).
const cache = new Map<string, Credenciales>();

function construirTRA(servicio: string): string {
  const ahora = Date.now();
  const generacion = new Date(ahora - 60_000); // 1 min atrás: margen por reloj desincronizado
  const expiracion = new Date(ahora + 10 * 60_000); // el TRA en sí vive 10 min, no el TA resultante

  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<loginTicketRequest version="1.0">' +
    '<header>' +
    `<uniqueId>${Math.floor(ahora / 1000)}</uniqueId>` +
    `<generationTime>${generacion.toISOString()}</generationTime>` +
    `<expirationTime>${expiracion.toISOString()}</expirationTime>` +
    '</header>' +
    `<service>${servicio}</service>` +
    '</loginTicketRequest>'
  );
}

// Firma el TRA como CMS/PKCS#7 "no separado" (el contenido va incluido
// en la firma, no aparte) — equivalente a `openssl smime -sign -nodetach`,
// que es lo que pide ARCA.
function firmarTRA(tra: string, certificadoPem: string, clavePrivadaPem: string): string {
  const certificado = forge.pki.certificateFromPem(certificadoPem);
  const clavePrivada = forge.pki.privateKeyFromPem(clavePrivadaPem);

  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(tra, 'utf8');
  p7.addCertificate(certificado);
  p7.addSigner({
    key: clavePrivada,
    certificate: certificado,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime },
    ],
  });
  p7.sign();

  const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
  return forge.util.encode64(der);
}

async function llamarLoginCms(cms: string, url: string): Promise<string> {
  const sobre =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">' +
    '<soapenv:Header/>' +
    '<soapenv:Body>' +
    '<wsaa:loginCms>' +
    `<wsaa:in0>${cms}</wsaa:in0>` +
    '</wsaa:loginCms>' +
    '</soapenv:Body>' +
    '</soapenv:Envelope>';

  const respuesta = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '' },
    body: sobre,
  });

  const texto = await respuesta.text();

  const fallo = texto.match(/<faultstring>([\s\S]*?)<\/faultstring>/);
  if (fallo) {
    throw new Error(`ARCA rechazó la conexión: ${fallo[1]}`);
  }
  if (!respuesta.ok) {
    throw new Error(`WSAA respondió con estado ${respuesta.status}.`);
  }

  return texto;
}

function extraerCredenciales(respuestaSoap: string): Credenciales {
  const match = respuestaSoap.match(/<loginCmsReturn>([\s\S]*?)<\/loginCmsReturn>/);
  if (!match) {
    throw new Error('La respuesta de WSAA no tiene el formato esperado.');
  }

  const loginTicketXml = match[1]
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");

  const token = loginTicketXml.match(/<token>([\s\S]*?)<\/token>/)?.[1];
  const sign = loginTicketXml.match(/<sign>([\s\S]*?)<\/sign>/)?.[1];
  const expirationTime = loginTicketXml.match(/<expirationTime>([\s\S]*?)<\/expirationTime>/)?.[1];

  if (!token || !sign || !expirationTime) {
    throw new Error('La respuesta de WSAA no tiene el formato esperado.');
  }

  return { token, sign, expiracion: new Date(expirationTime) };
}

// Devuelve token+sign vigentes para (emisor, servicio, ambiente),
// reusando el cache si todavía le quedan más de 5 minutos de vida.
export async function obtenerCredencialesWSAA(
  emisorId: string,
  certificadoPem: string,
  clavePrivadaPem: string,
  ambiente: Ambiente,
  servicio = 'wsfe',
): Promise<Credenciales> {
  const claveCache = `${emisorId}:${servicio}:${ambiente}`;
  const enCache = cache.get(claveCache);
  if (enCache && enCache.expiracion.getTime() - Date.now() > 5 * 60_000) {
    return enCache;
  }

  const tra = construirTRA(servicio);
  const cms = firmarTRA(tra, certificadoPem, clavePrivadaPem);
  const respuestaSoap = await llamarLoginCms(cms, WSAA_URLS[ambiente]);
  const credenciales = extraerCredenciales(respuestaSoap);

  cache.set(claveCache, credenciales);
  return credenciales;
}
