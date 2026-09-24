import forge from 'node-forge';
import { supabase } from '../supabaseClient';

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

// Devuelve token+sign vigentes para (emisor, servicio), reusando el TA
// cacheado en certificados_arca_tokens si todavía le quedan más de 5
// minutos de vida. El cache vive en la base (no en memoria del proceso)
// porque ARCA rechaza un pedido de TA nuevo mientras el anterior siga
// vigente (~12hs) — un cache en memoria se pierde en cada reinicio del
// backend y termina pidiendo un TA de más, que ARCA rechaza con
// "ns1:coe.alreadyAuthenticated". Un TA es válido para un solo servicio
// (wsfe, ws_sr_constancia_inscripcion, etc.), de ahí que el cache esté
// separado por servicio y no sea un único token por emisor.
export async function obtenerCredencialesWSAA(
  emisorId: string,
  certificadoPem: string,
  clavePrivadaPem: string,
  ambiente: Ambiente,
  servicio = 'wsfe',
): Promise<Credenciales> {
  const { data: fila } = await supabase
    .from('certificados_arca_tokens')
    .select('token, sign, expira')
    .eq('emisor_id', emisorId)
    .eq('servicio', servicio)
    .maybeSingle();

  if (fila) {
    const expiracion = new Date(fila.expira);
    if (expiracion.getTime() - Date.now() > 5 * 60_000) {
      return { token: fila.token, sign: fila.sign, expiracion };
    }
  }

  const tra = construirTRA(servicio);
  const cms = firmarTRA(tra, certificadoPem, clavePrivadaPem);
  const respuestaSoap = await llamarLoginCms(cms, WSAA_URLS[ambiente]);
  const credenciales = extraerCredenciales(respuestaSoap);

  await supabase
    .from('certificados_arca_tokens')
    .upsert(
      { emisor_id: emisorId, servicio, token: credenciales.token, sign: credenciales.sign, expira: credenciales.expiracion.toISOString() },
      { onConflict: 'emisor_id,servicio' },
    );

  return credenciales;
}
