export const ESTADO_COLOR: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
  emitida: 'success',
  pendiente: 'warning',
  con_error: 'error',
  anulada: 'default',
};

export const ESTADO_LABEL: Record<string, string> = {
  emitida: 'Emitida',
  pendiente: 'Pendiente',
  con_error: 'Con error',
  anulada: 'Anulada',
};
