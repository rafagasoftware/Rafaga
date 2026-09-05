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
