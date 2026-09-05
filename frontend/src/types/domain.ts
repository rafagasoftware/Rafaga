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

export interface CatalogoItem {
  id: string;
  codigo: number;
  descripcion: string;
  unidad_medida: string | null;
}

export interface PuntoVenta {
  id: string;
  numero: number;
  descripcion: string | null;
  habilitado: boolean;
}
