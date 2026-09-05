export interface Cliente {
  id: string;
  tipo_documento: 'CUIT' | 'CUIL' | 'DNI' | 'CF';
  numero_documento: string;
  razon_social: string;
  domicilio: string | null;
  condicion_iva: string;
  email: string | null;
  creado_en: string;
}

export interface Grupo {
  id: string;
  nombre: string;
}
