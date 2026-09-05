import { useEffect, useState } from 'react';

export function useDebouncedValue<T>(valor: T, esperaMs = 350): T {
  const [valorConDemora, setValorConDemora] = useState(valor);

  useEffect(() => {
    const temporizador = setTimeout(() => setValorConDemora(valor), esperaMs);
    return () => clearTimeout(temporizador);
  }, [valor, esperaMs]);

  return valorConDemora;
}
