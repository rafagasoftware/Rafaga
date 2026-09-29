import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  FormControlLabel,
  MenuItem,
  Paper,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { PageHeader } from '../components/PageHeader';
import { CONDICIONES_IVA } from '../constants/fiscal';
import { backendUrl } from '../lib/backendUrl';
import { supabase } from '../lib/supabaseClient';
import { ConfigurarCertificadoDialog } from './datosEmisor/ConfigurarCertificadoDialog';

interface EstadoCertificado {
  alias: string;
  ambiente: 'homologacion' | 'produccion';
  estado_conexion: 'sin_probar' | 'ok' | 'error';
  vencimiento: string | null;
  ultima_verificacion: string | null;
}

interface FormValues {
  condicion_iva: string;
  ingresos_brutos: string;
  inicio_actividades: string;
  domicilio: string;
  alcanzado_rg_3368: boolean;
}

const TIPOS_LOGO_ACEPTADOS = ['image/png', 'image/jpeg'];
const TAMANIO_MAXIMO_LOGO = 2 * 1024 * 1024;

export function DatosEmisorPage() {
  const { session } = useAuth();
  const [razonSocial, setRazonSocial] = useState('');
  const [cuit, setCuit] = useState('');
  const [valores, setValores] = useState<FormValues>({
    condicion_iva: '',
    ingresos_brutos: '',
    inicio_actividades: '',
    domicilio: '',
    alcanzado_rg_3368: false,
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [logoPath, setLogoPath] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [subiendoLogo, setSubiendoLogo] = useState(false);
  const [errorLogo, setErrorLogo] = useState<string | null>(null);

  const [nombreFantasia, setNombreFantasia] = useState('');
  const [leyenda, setLeyenda] = useState('');
  const [guardandoLeyenda, setGuardandoLeyenda] = useState(false);
  const [errorLeyenda, setErrorLeyenda] = useState<string | null>(null);
  const [leyendaGuardadaOk, setLeyendaGuardadaOk] = useState(false);

  const [guardando, setGuardando] = useState(false);
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null);
  const [guardadoOk, setGuardadoOk] = useState(false);

  const [certificado, setCertificado] = useState<EstadoCertificado | null>(null);
  const [dialogCertificadoAbierto, setDialogCertificadoAbierto] = useState(false);
  const [probando, setProbando] = useState(false);
  const [errorPrueba, setErrorPrueba] = useState<string | null>(null);
  const [puntosVentaArca, setPuntosVentaArca] = useState<{ numero: number; bloqueado: boolean }[] | null>(null);
  const [condicionIvaArca, setCondicionIvaArca] = useState<string | null>(null);
  // TODO temporal: solo para ver en pantalla qué devuelve el padrón de
  // ARCA mientras se depura esa consulta. Sacar junto con padronDebug del
  // backend una vez confirmado que anda.
  const [padronDebug, setPadronDebug] = useState<string | null>(null);

  const cargarCertificado = useCallback(async () => {
    if (!session) return;
    const response = await fetch(`${backendUrl}/me/certificado`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (response.ok) {
      const data = await response.json();
      setCertificado(data);
    }
  }, [session]);

  useEffect(() => {
    cargarCertificado();
  }, [cargarCertificado]);

  useEffect(() => {
    if (!session) return;

    supabase
      .from('emisores')
      .select('*')
      .eq('id', session.user.id)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          setLoadError('No se pudieron cargar los datos del emisor.');
        } else {
          setRazonSocial(data.razon_social);
          setCuit(data.cuit);
          setValores({
            condicion_iva: data.condicion_iva ?? '',
            ingresos_brutos: data.ingresos_brutos ?? '',
            inicio_actividades: data.inicio_actividades ?? '',
            domicilio: data.domicilio ?? '',
            alcanzado_rg_3368: data.alcanzado_rg_3368 ?? false,
          });
          setCondicionIvaArca(data.condicion_iva_arca ?? null);
          setLogoPath(data.logo_path ?? null);
          setNombreFantasia(data.nombre_fantasia ?? '');
          setLeyenda(data.leyenda_pdf ?? '');
        }
        setLoading(false);
      });
  }, [session]);

  useEffect(() => {
    if (!logoPath) return;
    let cancelado = false;
    supabase.storage
      .from('logos-emisor')
      .createSignedUrl(logoPath, 3600)
      .then(({ data }) => {
        if (!cancelado) setLogoUrl(data?.signedUrl ?? null);
      });
    return () => {
      cancelado = true;
    };
  }, [logoPath]);

  async function handleSubirLogo(event: ChangeEvent<HTMLInputElement>) {
    const archivo = event.target.files?.[0];
    event.target.value = '';
    if (!archivo || !session) return;

    setErrorLogo(null);

    if (!TIPOS_LOGO_ACEPTADOS.includes(archivo.type)) {
      setErrorLogo('Tiene que ser una imagen PNG o JPEG.');
      return;
    }
    if (archivo.size > TAMANIO_MAXIMO_LOGO) {
      setErrorLogo('La imagen no puede pesar más de 2 MB.');
      return;
    }

    setSubiendoLogo(true);

    const extension = archivo.type === 'image/png' ? 'png' : 'jpg';
    const rutaNueva = `${session.user.id}/logo.${extension}`;

    // Si el logo anterior tenía otra extensión, el archivo viejo queda
    // huérfano en el bucket — se borra antes de subir el nuevo.
    if (logoPath && logoPath !== rutaNueva) {
      await supabase.storage.from('logos-emisor').remove([logoPath]);
    }

    const { error: errorSubida } = await supabase.storage
      .from('logos-emisor')
      .upload(rutaNueva, archivo, { upsert: true, contentType: archivo.type });

    if (errorSubida) {
      setErrorLogo('No se pudo subir la imagen.');
      setSubiendoLogo(false);
      return;
    }

    const { error: errorGuardarRuta } = await supabase.from('emisores').update({ logo_path: rutaNueva }).eq('id', session.user.id);

    setSubiendoLogo(false);

    if (errorGuardarRuta) {
      setErrorLogo('La imagen se subió pero no se pudo guardar. Probá de nuevo.');
      return;
    }

    setLogoPath(rutaNueva);
  }

  async function handleQuitarLogo() {
    if (!session || !logoPath) return;

    setSubiendoLogo(true);
    setErrorLogo(null);

    await supabase.storage.from('logos-emisor').remove([logoPath]);
    const { error } = await supabase.from('emisores').update({ logo_path: null }).eq('id', session.user.id);

    setSubiendoLogo(false);

    if (error) {
      setErrorLogo('No se pudo quitar el logo.');
      return;
    }

    setLogoPath(null);
  }

  async function handleGuardarLeyenda() {
    if (!session) return;

    setGuardandoLeyenda(true);
    setErrorLeyenda(null);
    setLeyendaGuardadaOk(false);

    const { error } = await supabase
      .from('emisores')
      .update({ nombre_fantasia: nombreFantasia.trim() || null, leyenda_pdf: leyenda.trim() || null })
      .eq('id', session.user.id);

    setGuardandoLeyenda(false);

    if (error) {
      setErrorLeyenda('No se pudo guardar la leyenda.');
      return;
    }

    setLeyendaGuardadaOk(true);
  }

  async function handleProbarConexion() {
    if (!session) return;

    setProbando(true);
    setErrorPrueba(null);
    setPuntosVentaArca(null);

    try {
      const response = await fetch(`${backendUrl}/me/certificado/probar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await response.json();

      // condicionIvaArca puede venir incluso si el resto de la prueba
      // falló (son dos consultas independientes del lado del backend).
      if (data.condicionIvaArca) setCondicionIvaArca(data.condicionIvaArca);
      setPadronDebug(data.padronDebug ?? null);

      if (!response.ok) {
        setErrorPrueba(data.error ?? 'No se pudo probar la conexión.');
      } else {
        setPuntosVentaArca(data.puntosVenta ?? []);
      }
    } catch {
      setErrorPrueba('No se pudo conectar con el servidor.');
    } finally {
      setProbando(false);
      cargarCertificado();
    }
  }

  function handleChange(field: keyof Omit<FormValues, 'alcanzado_rg_3368'>) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      setValores((prev) => ({ ...prev, [field]: event.target.value }));
      setGuardadoOk(false);
    };
  }

  function handleChangeAlcanzadoRg3368(event: ChangeEvent<HTMLInputElement>) {
    setValores((prev) => ({ ...prev, alcanzado_rg_3368: event.target.checked }));
    setGuardadoOk(false);
  }

  async function handleGuardar() {
    if (!session) return;

    setGuardando(true);
    setErrorGuardado(null);
    setGuardadoOk(false);

    const { error } = await supabase
      .from('emisores')
      .update({
        condicion_iva: valores.condicion_iva,
        ingresos_brutos: valores.ingresos_brutos || null,
        inicio_actividades: valores.inicio_actividades || null,
        domicilio: valores.domicilio || null,
        alcanzado_rg_3368: valores.alcanzado_rg_3368,
      })
      .eq('id', session.user.id);

    setGuardando(false);

    if (error) {
      setErrorGuardado('No se pudieron guardar los cambios.');
      return;
    }

    setGuardadoOk(true);
  }

  // Tapa el logoUrl viejo mientras se resuelve el nuevo (o directamente si
  // se quitó el logo), en vez de resetearlo en el efecto de arriba.
  const logoUrlMostrado = logoPath ? logoUrl : null;

  return (
    <>
      <PageHeader title="Datos del emisor" />

      {loadError && <Alert severity="error" sx={{ mb: 3 }}>{loadError}</Alert>}

      {loading ? (
        <Stack spacing={3}>
          <Paper variant="outlined" sx={{ p: 3 }}>
            <Skeleton variant="text" width={120} height={32} sx={{ mb: 2 }} />
            <Stack spacing={2}>
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} variant="rounded" height={56} />
              ))}
              <Skeleton variant="rounded" width={160} height={44} />
            </Stack>
          </Paper>
          <Paper variant="outlined" sx={{ p: 3 }}>
            <Skeleton variant="text" width={180} height={32} sx={{ mb: 1 }} />
            <Skeleton variant="text" width="90%" />
            <Skeleton variant="text" width="60%" sx={{ mb: 2 }} />
            <Skeleton variant="rounded" width={180} height={44} />
          </Paper>
        </Stack>
      ) : (
      <Stack spacing={3}>
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Logo
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Se muestra arriba a la izquierda de las facturas en PDF. Formatos PNG o JPEG, hasta 2 MB.
          </Typography>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box
              sx={{
                width: 140,
                height: 55,
                border: '1px dashed',
                borderColor: 'divider',
                borderRadius: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                flexShrink: 0,
              }}
            >
              {logoUrlMostrado ? (
                <Box component="img" src={logoUrlMostrado} alt="Logo del emisor" sx={{ maxWidth: '100%', maxHeight: '100%' }} />
              ) : (
                <Typography variant="caption" color="text.secondary">
                  Sin logo
                </Typography>
              )}
            </Box>

            <Stack spacing={1}>
              <Button variant="outlined" component="label" size="small" disabled={subiendoLogo}>
                {subiendoLogo ? 'Subiendo…' : logoPath ? 'Cambiar logo' : 'Subir logo'}
                <input type="file" hidden accept="image/png,image/jpeg" onChange={handleSubirLogo} />
              </Button>
              {logoPath && (
                <Button size="small" color="error" onClick={handleQuitarLogo} disabled={subiendoLogo}>
                  Quitar logo
                </Button>
              )}
            </Stack>
          </Box>

          {errorLogo && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {errorLogo}
            </Alert>
          )}

          <TextField
            label="Nombre de fantasía"
            value={nombreFantasia}
            onChange={(e) => {
              setNombreFantasia(e.target.value);
              setLeyendaGuardadaOk(false);
            }}
            fullWidth
            helperText="Aparece en negrita justo debajo del logo, antes de la leyenda."
            sx={{ mt: 3 }}
          />

          <TextField
            label="Leyenda"
            value={leyenda}
            onChange={(e) => {
              setLeyenda(e.target.value);
              setLeyendaGuardadaOk(false);
            }}
            multiline
            minRows={3}
            fullWidth
            helperText="Aparece debajo del nombre de fantasía en el PDF. Respeta los saltos de línea tal cual los escribas."
            sx={{ mt: 2 }}
          />
          {errorLeyenda && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {errorLeyenda}
            </Alert>
          )}
          {leyendaGuardadaOk && (
            <Alert severity="success" sx={{ mt: 2 }}>
              Se guardaron los cambios.
            </Alert>
          )}
          <Box sx={{ mt: 1.5 }}>
            <Button variant="outlined" size="small" onClick={handleGuardarLeyenda} disabled={guardandoLeyenda}>
              {guardandoLeyenda ? 'Guardando…' : 'Guardar'}
            </Button>
          </Box>
        </Paper>

        <Paper variant="outlined" sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Perfil fiscal
          </Typography>

          <Stack spacing={2}>
            <TextField label="Razón social" value={razonSocial} fullWidth disabled />
            <TextField label="CUIT" value={cuit} fullWidth disabled sx={{ fontVariantNumeric: 'tabular-nums' }} />
            <TextField
              select
              label="Condición frente al IVA"
              value={valores.condicion_iva}
              onChange={handleChange('condicion_iva')}
              required
              fullWidth
            >
              {CONDICIONES_IVA.map((opcion) => (
                <MenuItem key={opcion} value={opcion}>
                  {opcion}
                </MenuItem>
              ))}
            </TextField>

            {condicionIvaArca &&
              (condicionIvaArca === valores.condicion_iva ? (
                <Alert severity="success" variant="outlined">
                  Coincide con lo que ARCA tiene registrado.
                </Alert>
              ) : (
                <Alert severity="warning" variant="outlined">
                  ARCA tiene registrado "{condicionIvaArca}", no "{valores.condicion_iva}". Esto puede hacer que ARCA rechace facturas —
                  te conviene corregirlo acá para que coincida.
                </Alert>
              ))}

            <TextField
              label="Ingresos brutos"
              value={valores.ingresos_brutos}
              onChange={handleChange('ingresos_brutos')}
              fullWidth
            />
            <TextField
              label="Inicio de actividades"
              type="date"
              value={valores.inicio_actividades}
              onChange={handleChange('inicio_actividades')}
              fullWidth
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField label="Domicilio" value={valores.domicilio} onChange={handleChange('domicilio')} fullWidth />

            <FormControlLabel
              control={<Checkbox checked={valores.alcanzado_rg_3368} onChange={handleChangeAlcanzadoRg3368} />}
              label="Establecimiento de educación de gestión privada (RG 3.368)"
            />
            {valores.alcanzado_rg_3368 && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: -1.5 }}>
                Cada factura va a incluir el dato adicional que exige ARCA para esta actividad (el mismo tipo y número de documento del
                cliente, repetidos como lo pide la RG 3.368).
              </Typography>
            )}

            {errorGuardado && <Alert severity="error">{errorGuardado}</Alert>}
            {guardadoOk && <Alert severity="success">Se guardaron los cambios.</Alert>}

            <Box>
              <Button variant="contained" size="large" onClick={handleGuardar} disabled={guardando}>
                {guardando ? 'Guardando…' : 'Guardar cambios'}
              </Button>
            </Box>
          </Stack>
        </Paper>

        <Paper variant="outlined" sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="h6">Conexión con ARCA</Typography>
            {certificado ? (
              <Chip
                label={
                  certificado.estado_conexion === 'ok'
                    ? 'Conectado'
                    : certificado.estado_conexion === 'error'
                      ? 'Con error'
                      : 'Sin probar'
                }
                color={certificado.estado_conexion === 'ok' ? 'success' : certificado.estado_conexion === 'error' ? 'error' : 'warning'}
                size="small"
                variant="outlined"
              />
            ) : (
              <Chip label="Sin configurar" size="small" variant="outlined" />
            )}
          </Box>

          {certificado ? (
            <Stack spacing={0.5} sx={{ mb: 2 }}>
              <Typography color="text.secondary">
                Alias: {certificado.alias} · {certificado.ambiente === 'produccion' ? 'Producción' : 'Homologación (pruebas)'}
              </Typography>
              {certificado.ultima_verificacion && (
                <Typography variant="body2" color="text.secondary">
                  Última verificación: {new Date(certificado.ultima_verificacion).toLocaleString('es-AR')}
                </Typography>
              )}
            </Stack>
          ) : (
            <Typography color="text.secondary" sx={{ mb: 2 }}>
              Todavía no cargaste el certificado digital de ARCA para esta cuenta. Hasta que lo hagas, no vas a poder emitir facturas.
            </Typography>
          )}

          <Stack direction="row" spacing={2} sx={{ mb: errorPrueba ? 2 : 0 }}>
            <Button variant="outlined" onClick={() => setDialogCertificadoAbierto(true)}>
              {certificado ? 'Actualizar certificado' : 'Configurar certificado'}
            </Button>
            <Button variant="outlined" onClick={handleProbarConexion} disabled={!certificado || probando}>
              {probando ? 'Probando…' : 'Probar conexión'}
            </Button>
          </Stack>

          {errorPrueba && <Alert severity="error">{errorPrueba}</Alert>}

          {puntosVentaArca && (
            <Alert severity="success" sx={{ mt: 2 }}>
              {puntosVentaArca.length === 0
                ? 'Conectado. ARCA no tiene ningún punto de venta habilitado para este CUIT todavía.'
                : `Conectado. ARCA tiene habilitados estos puntos de venta: ${puntosVentaArca
                    .map((p) => String(p.numero).padStart(4, '0') + (p.bloqueado ? ' (bloqueado)' : ''))
                    .join(', ')}.`}
            </Alert>
          )}

          {padronDebug && (
            <Paper variant="outlined" sx={{ mt: 2, p: 2, bgcolor: 'background.default' }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                Respuesta del padrón de ARCA (temporal, solo para revisar)
              </Typography>
              <Typography
                component="pre"
                variant="body2"
                sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'monospace', fontSize: 12, m: 0 }}
              >
                {padronDebug}
              </Typography>
            </Paper>
          )}
        </Paper>
      </Stack>
      )}

      <ConfigurarCertificadoDialog
        open={dialogCertificadoAbierto}
        onClose={() => setDialogCertificadoAbierto(false)}
        onGuardado={cargarCertificado}
      />
    </>
  );
}
