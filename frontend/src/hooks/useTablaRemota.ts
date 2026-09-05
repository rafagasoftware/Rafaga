import { useCallback, useEffect, useState } from 'react';
import { useDebouncedValue } from './useDebouncedValue';

export interface ParametrosPagina {
  busqueda: string;
  pagina: number;
  filasPorPagina: number;
}

export interface ResultadoPagina<T> {
  data: T[];
  count: number;
}

// Paginación + búsqueda con filtro resuelto en el backend (Supabase),
// no en el navegador. fetchPage se re-ejecuta solo cuando cambia su
// identidad (envolvé el callback del que llama en useCallback con las
// dependencias propias de esa pantalla, ej. un filtro extra).
export function useTablaRemota<T>(fetchPage: (params: ParametrosPagina) => Promise<ResultadoPagina<T>>) {
  const [busqueda, setBusqueda] = useState('');
  const busquedaConDemora = useDebouncedValue(busqueda);
  const [pagina, setPagina] = useState(0);
  const [filasPorPagina, setFilasPorPagina] = useState(10);
  const [filas, setFilas] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tickRecarga, setTickRecarga] = useState(0);

  useEffect(() => {
    setPagina(0);
  }, [busquedaConDemora, fetchPage]);

  useEffect(() => {
    let cancelado = false;
    setLoading(true);

    fetchPage({ busqueda: busquedaConDemora, pagina, filasPorPagina }).then(({ data, count }) => {
      if (cancelado) return;
      setFilas(data);
      setTotal(count);
      setLoading(false);
    });

    return () => {
      cancelado = true;
    };
  }, [busquedaConDemora, pagina, filasPorPagina, tickRecarga, fetchPage]);

  const recargar = useCallback(() => setTickRecarga((t) => t + 1), []);

  return { busqueda, setBusqueda, pagina, setPagina, filasPorPagina, setFilasPorPagina, filas, total, loading, recargar };
}
