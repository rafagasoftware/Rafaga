import https from 'node:https';

// Todos los webservices de ARCA (WSAA, WSFE, padrón) pasan por acá en vez
// de por `fetch`. El motivo: algunos servidores de producción de ARCA
// (servicios1.afip.gov.ar, el de WSFE) negocian TLS con una clave
// Diffie-Hellman que el OpenSSL 3 de Node 17+ rechaza por corta
// ("dh key too small"), y `fetch` no deja ajustar eso — solo tira un
// "fetch failed" sin más datos. Con SECLEVEL=1 Node vuelve a aceptarla.
const agente = new https.Agent({ keepAlive: true, ciphers: 'DEFAULT@SECLEVEL=1' });

export interface RespuestaSoap {
  status: number;
  ok: boolean;
  texto: string;
}

export function postSoap(url: string, cuerpo: string, soapAction: string): Promise<RespuestaSoap> {
  const { hostname } = new URL(url);

  return new Promise((resolve, reject) => {
    const pedido = https.request(
      url,
      {
        method: 'POST',
        agent: agente,
        timeout: 60_000,
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          SOAPAction: soapAction,
          'Content-Length': Buffer.byteLength(cuerpo),
        },
      },
      (respuesta) => {
        const partes: Buffer[] = [];
        respuesta.on('data', (parte: Buffer) => partes.push(parte));
        respuesta.on('end', () => {
          const status = respuesta.statusCode ?? 0;
          resolve({ status, ok: status >= 200 && status < 300, texto: Buffer.concat(partes).toString('utf8') });
        });
        respuesta.on('error', (error) => reject(errorDeConexion(hostname, error)));
      },
    );

    pedido.on('timeout', () => pedido.destroy(new Error('ARCA tardó demasiado en responder')));
    pedido.on('error', (error) => reject(errorDeConexion(hostname, error)));
    pedido.end(cuerpo);
  });
}

// El detalle técnico va al final entre paréntesis: al usuario le alcanza
// con la primera parte, pero sin el detalle no hay forma de diagnosticar
// un corte de red desde la pantalla.
function errorDeConexion(hostname: string, error: Error): Error {
  const codigo = (error as NodeJS.ErrnoException).code;
  const detalle = codigo ? `${codigo}: ${error.message}` : error.message;
  return new Error(`No se pudo conectar con ARCA (${hostname}). Probá de nuevo en unos minutos. (${detalle})`);
}
