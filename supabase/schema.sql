-- Rafaga — esquema inicial de base de datos (Supabase / Postgres)
-- Corresponde al diagrama entidad-relación del documento de arquitectura.
-- Pensado para pegarse entero en el SQL Editor de Supabase, en un proyecto nuevo.

-- =========================================================
-- 1. Cuentas y acceso
-- =========================================================

create table public.emisores (
  id uuid primary key references auth.users(id) on delete cascade,
  cuit text not null unique,
  razon_social text not null,
  condicion_iva text not null,
  ingresos_brutos text,
  inicio_actividades date,
  domicilio text,
  estado text not null default 'activo' check (estado in ('activo', 'suspendido')),
  creado_en timestamptz not null default now()
);
comment on table public.emisores is 'Una fila por cuenta. El id coincide con el usuario de Supabase Auth: no hay tabla de usuarios aparte.';

create table public.administradores (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null,
  creado_en timestamptz not null default now()
);
comment on table public.administradores is 'Super-administradores del producto. No tienen emisor_id: su acceso es a todas las cuentas, no a una en particular. Se agregan a mano (service role), no hay alta desde la app.';

-- Función auxiliar: ¿el usuario actual es super-administrador?
-- security definer: puede leer "administradores" aunque esa tabla
-- tenga RLS habilitado y el usuario que llama no tenga permiso directo.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.administradores where id = auth.uid()
  );
$$;

create table public.certificados_arca (
  id uuid primary key default gen_random_uuid(),
  emisor_id uuid not null unique references public.emisores(id) on delete cascade,
  alias text not null,
  secreto_vault_id uuid,
  vencimiento date,
  estado_conexion text not null default 'sin_probar' check (estado_conexion in ('sin_probar', 'ok', 'error')),
  ultima_verificacion timestamptz,
  creado_en timestamptz not null default now()
);
comment on table public.certificados_arca is 'Un certificado por emisor (no por punto de venta). El certificado y la clave privada en sí NO se guardan acá como texto plano: secreto_vault_id referencia el secreto guardado en Supabase Vault.';

-- =========================================================
-- 2. Clientes
-- =========================================================

create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  emisor_id uuid not null references public.emisores(id) on delete cascade,
  tipo_documento text not null check (tipo_documento in ('CUIT', 'CUIL', 'DNI', 'CF')),
  numero_documento text not null,
  razon_social text not null,
  domicilio text,
  condicion_iva text not null,
  email text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index clientes_emisor_idx on public.clientes (emisor_id);

create table public.grupos (
  id uuid primary key default gen_random_uuid(),
  emisor_id uuid not null references public.emisores(id) on delete cascade,
  nombre text not null,
  creado_en timestamptz not null default now(),
  unique (emisor_id, nombre)
);

create table public.clientes_grupos (
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  grupo_id uuid not null references public.grupos(id) on delete cascade,
  primary key (cliente_id, grupo_id)
);

create table public.clientes_historial (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  snapshot jsonb not null,
  modificado_en timestamptz not null default now()
);
create index clientes_historial_cliente_idx on public.clientes_historial (cliente_id);
comment on table public.clientes_historial is 'Se llena sola con un trigger: guarda una copia del cliente antes de cada modificación.';

-- =========================================================
-- 3. Catálogo y puntos de venta
-- =========================================================

create table public.catalogo_items (
  id uuid primary key default gen_random_uuid(),
  emisor_id uuid not null references public.emisores(id) on delete cascade,
  codigo text not null,
  descripcion text not null,
  unidad_medida text,
  creado_en timestamptz not null default now(),
  unique (emisor_id, codigo)
);
comment on table public.catalogo_items is 'Catálogo reutilizable sin precio: el precio se carga cada vez en lote_items.';

create table public.puntos_venta (
  id uuid primary key default gen_random_uuid(),
  emisor_id uuid not null references public.emisores(id) on delete cascade,
  numero int not null check (numero > 0),
  descripcion text,
  habilitado boolean not null default true,
  creado_en timestamptz not null default now(),
  unique (emisor_id, numero)
);
comment on table public.puntos_venta is 'Deberían coincidir con los puntos de venta habilitados en ARCA (ver FEParamGetPtosVenta en los puntos abiertos).';

-- =========================================================
-- 4. Emisión y facturación
-- =========================================================

create table public.lotes (
  id uuid primary key default gen_random_uuid(),
  emisor_id uuid not null references public.emisores(id) on delete cascade,
  punto_venta_id uuid not null references public.puntos_venta(id),
  tipo_comprobante text not null check (tipo_comprobante in ('factura_a', 'factura_b', 'factura_c', 'nc_a', 'nc_b', 'nc_c')),
  concepto text not null check (concepto in ('productos', 'servicios', 'productos_servicios')),
  fecha_emision date not null default current_date,
  periodo_desde date,
  periodo_hasta date,
  vencimiento_pago date,
  condicion_venta text not null,
  moneda text not null default 'ARS',
  observaciones text,
  estado text not null default 'en_progreso' check (estado in ('en_progreso', 'pausado', 'finalizado')),
  total_clientes int not null default 0,
  emitidas int not null default 0,
  con_error int not null default 0,
  creado_en timestamptz not null default now()
);
create index lotes_emisor_idx on public.lotes (emisor_id);
comment on table public.lotes is 'Los datos que se cargan una sola vez. Una factura simple es, para la base, un lote de un solo cliente.';

create table public.lote_items (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references public.lotes(id) on delete cascade,
  emisor_id uuid not null references public.emisores(id) on delete cascade,
  catalogo_item_id uuid references public.catalogo_items(id),
  codigo text not null,
  descripcion text not null,
  cantidad numeric not null check (cantidad > 0),
  unidad_medida text,
  precio_unitario numeric not null check (precio_unitario >= 0),
  bonificacion_pct numeric not null default 0 check (bonificacion_pct between 0 and 100),
  alicuota_iva text not null check (alicuota_iva in ('21', '10.5', '0', 'exento')),
  orden int not null default 0
);
create index lote_items_lote_idx on public.lote_items (lote_id);
comment on table public.lote_items is 'emisor_id se completa solo (trigger) a partir del lote; no lo escribe la aplicación.';

create table public.facturas (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references public.lotes(id) on delete cascade,
  emisor_id uuid not null references public.emisores(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id),
  factura_original_id uuid references public.facturas(id),
  numero_comprobante text,
  cae text,
  cae_vencimiento date,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'emitida', 'con_error', 'anulada')),
  motivo_error text,
  importe_neto numeric,
  iva_total numeric,
  otros_tributos numeric default 0,
  importe_total numeric,
  pdf_path text,
  email_estado text not null default 'no_enviado' check (email_estado in ('no_enviado', 'enviado', 'error')),
  fecha_emision timestamptz,
  creado_en timestamptz not null default now()
);
create index facturas_lote_idx on public.facturas (lote_id);
create index facturas_cliente_idx on public.facturas (cliente_id);
create index facturas_emisor_idx on public.facturas (emisor_id);
comment on table public.facturas is 'Una fila por cliente emitido. factura_original_id solo se usa en notas de crédito, para apuntar a la factura que anulan.';

-- =========================================================
-- 5. Triggers
-- =========================================================

-- 5.1 Historial de clientes: guarda el estado anterior antes de cada cambio.
create or replace function public.fn_clientes_historial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.clientes_historial (cliente_id, snapshot)
  values (old.id, to_jsonb(old));
  new.actualizado_en := now();
  return new;
end;
$$;

create trigger trg_clientes_historial
  before update on public.clientes
  for each row execute function public.fn_clientes_historial();

-- 5.2 emisor_id en lote_items y facturas: siempre se toma del lote,
-- nunca del valor que mande el cliente (evita que alguien lo falsee).
create or replace function public.fn_set_emisor_from_lote()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select emisor_id into new.emisor_id from public.lotes where id = new.lote_id;
  return new;
end;
$$;

create trigger trg_lote_items_emisor
  before insert on public.lote_items
  for each row execute function public.fn_set_emisor_from_lote();

create trigger trg_facturas_emisor
  before insert on public.facturas
  for each row execute function public.fn_set_emisor_from_lote();

-- 5.3 Solo un super-administrador puede activar/suspender una cuenta.
create or replace function public.fn_proteger_estado_emisor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado is distinct from old.estado and not public.is_admin() then
    raise exception 'Solo un administrador puede cambiar el estado de la cuenta';
  end if;
  return new;
end;
$$;

create trigger trg_proteger_estado_emisor
  before update of estado on public.emisores
  for each row execute function public.fn_proteger_estado_emisor();

-- =========================================================
-- 6. Seguridad por fila (RLS): cada emisor ve solo lo suyo
-- =========================================================

alter table public.emisores enable row level security;
alter table public.administradores enable row level security;
alter table public.certificados_arca enable row level security;
alter table public.clientes enable row level security;
alter table public.grupos enable row level security;
alter table public.clientes_grupos enable row level security;
alter table public.clientes_historial enable row level security;
alter table public.catalogo_items enable row level security;
alter table public.puntos_venta enable row level security;
alter table public.lotes enable row level security;
alter table public.lote_items enable row level security;
alter table public.facturas enable row level security;

-- emisores: cada uno ve y edita su propio perfil; el admin ve todos
-- (el cambio de "estado" queda bloqueado aparte por el trigger de arriba).
create policy emisores_propio on public.emisores
  for select using (id = auth.uid() or public.is_admin());
create policy emisores_edita_propio on public.emisores
  for update using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- administradores: solo lo ven los propios administradores.
-- No hay policy de insert/update/delete: se administra con la service role.
create policy administradores_solo_admin on public.administradores
  for select using (public.is_admin());

-- certificados_arca: el emisor administra el propio; el admin solo lo lee (soporte).
create policy certificados_propio on public.certificados_arca
  for select using (emisor_id = auth.uid() or public.is_admin());
create policy certificados_modifica_propio on public.certificados_arca
  for insert with check (emisor_id = auth.uid());
create policy certificados_actualiza_propio on public.certificados_arca
  for update using (emisor_id = auth.uid()) with check (emisor_id = auth.uid());
create policy certificados_borra_propio on public.certificados_arca
  for delete using (emisor_id = auth.uid());

-- Tablas donde el emisor tiene control total sobre lo suyo y el admin solo lee.
-- (clientes, grupos, catalogo_items, puntos_venta, lotes, lote_items, facturas)
create policy clientes_lee_propio on public.clientes for select using (emisor_id = auth.uid() or public.is_admin());
create policy clientes_crea_propio on public.clientes for insert with check (emisor_id = auth.uid());
create policy clientes_edita_propio on public.clientes for update using (emisor_id = auth.uid()) with check (emisor_id = auth.uid());
create policy clientes_borra_propio on public.clientes for delete using (emisor_id = auth.uid());

create policy grupos_lee_propio on public.grupos for select using (emisor_id = auth.uid() or public.is_admin());
create policy grupos_crea_propio on public.grupos for insert with check (emisor_id = auth.uid());
create policy grupos_edita_propio on public.grupos for update using (emisor_id = auth.uid()) with check (emisor_id = auth.uid());
create policy grupos_borra_propio on public.grupos for delete using (emisor_id = auth.uid());

-- clientes_grupos no tiene emisor_id propio: se valida a través del cliente.
create policy clientes_grupos_lee_propio on public.clientes_grupos for select using (
  exists (select 1 from public.clientes c where c.id = cliente_id and (c.emisor_id = auth.uid() or public.is_admin()))
);
create policy clientes_grupos_escribe_propio on public.clientes_grupos for all using (
  exists (select 1 from public.clientes c where c.id = cliente_id and c.emisor_id = auth.uid())
) with check (
  exists (select 1 from public.clientes c where c.id = cliente_id and c.emisor_id = auth.uid())
);

create policy clientes_historial_lee_propio on public.clientes_historial for select using (
  exists (select 1 from public.clientes c where c.id = cliente_id and (c.emisor_id = auth.uid() or public.is_admin()))
);
-- Sin policy de insert/update/delete: solo lo escribe el trigger (security definer).

create policy catalogo_lee_propio on public.catalogo_items for select using (emisor_id = auth.uid() or public.is_admin());
create policy catalogo_crea_propio on public.catalogo_items for insert with check (emisor_id = auth.uid());
create policy catalogo_edita_propio on public.catalogo_items for update using (emisor_id = auth.uid()) with check (emisor_id = auth.uid());
create policy catalogo_borra_propio on public.catalogo_items for delete using (emisor_id = auth.uid());

create policy puntos_venta_lee_propio on public.puntos_venta for select using (emisor_id = auth.uid() or public.is_admin());
create policy puntos_venta_crea_propio on public.puntos_venta for insert with check (emisor_id = auth.uid());
create policy puntos_venta_edita_propio on public.puntos_venta for update using (emisor_id = auth.uid()) with check (emisor_id = auth.uid());
create policy puntos_venta_borra_propio on public.puntos_venta for delete using (emisor_id = auth.uid());

create policy lotes_lee_propio on public.lotes for select using (emisor_id = auth.uid() or public.is_admin());
create policy lotes_crea_propio on public.lotes for insert with check (emisor_id = auth.uid());
create policy lotes_edita_propio on public.lotes for update using (emisor_id = auth.uid()) with check (emisor_id = auth.uid());
create policy lotes_borra_propio on public.lotes for delete using (emisor_id = auth.uid());

-- lote_items: el insert se valida contra el lote (emisor_id todavía no existe en la fila nueva
-- hasta que corre el trigger); select/update/delete ya pueden usar el emisor_id propio de la fila.
create policy lote_items_lee_propio on public.lote_items for select using (emisor_id = auth.uid() or public.is_admin());
create policy lote_items_crea_propio on public.lote_items for insert with check (
  exists (select 1 from public.lotes l where l.id = lote_id and l.emisor_id = auth.uid())
);
create policy lote_items_edita_propio on public.lote_items for update using (emisor_id = auth.uid()) with check (emisor_id = auth.uid());
create policy lote_items_borra_propio on public.lote_items for delete using (emisor_id = auth.uid());

create policy facturas_lee_propio on public.facturas for select using (emisor_id = auth.uid() or public.is_admin());
create policy facturas_crea_propio on public.facturas for insert with check (
  exists (select 1 from public.lotes l where l.id = lote_id and l.emisor_id = auth.uid())
);
create policy facturas_edita_propio on public.facturas for update using (emisor_id = auth.uid()) with check (emisor_id = auth.uid());
