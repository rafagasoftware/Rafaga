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

  const [guardando, setGuardando] = useState(false);
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null);
  const [guardadoOk, setGuardadoOk] = useState(false);

  const [certificado, setCertificado] = useState<EstadoCertificado | null>(null);
  const [dialogCertificadoAbierto, setDialogCertificadoAbierto] = useState(false);
  const [probando, setProbando] = useState(false);
  const [errorPrueba, setErrorPrueba] = useState<string | null>(null);
  const [puntosVentaArca, setPuntosVentaArca] = useState<{ numero: number; bloqueado: boolean }[] | null>(null);
  const [condicionIvaArca, setCondicionIvaArca] = useState<string | null>(null);
  const [avisoPadron, setAvisoPadron] = useState<string | null>(null);

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
        }
        setLoading(false);
      });
  }, [session]);

  async function handleProbarConexion() {
    if (!session) return;

    setProbando(true);
    setErrorPrueba(null);
    setPuntosVentaArca(null);
    setAvisoPadron(null);

    try {
      const response = await fetch(`${backendUrl}/me/certificado/probar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await response.json();

      // condicionIvaArca puede venir incluso si el resto de la prueba
      // falló (son dos consultas independientes del lado del backend).
      if (data.condicionIvaArca) setCondicionIvaArca(data.condicionIvaArca);
      setAvisoPadron(data.avisoPadron ?? null);

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

          {avisoPadron && (
            <Alert severity="info" sx={{ mt: 2 }}>
              {avisoPadron}
            </Alert>
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
