-- =============================================================================
-- TRAMO — esquema de base de datos
-- Pegar completo en Supabase → SQL Editor → New query → Run.
-- Idempotente: se puede volver a ejecutar sin romper nada.
--
-- Regla que no se negocia: RLS activado en toda tabla con datos de usuario.
-- Sin eso, cualquiera con la clave pública lee los gastos de todos.
-- =============================================================================

-- ---------- PERFILES --------------------------------------------------------
create table if not exists public.perfiles (
  id              uuid primary key references auth.users on delete cascade,
  nombre          text,
  correo          text,
  telefono        text,
  pais            text,
  moneda_base     text default 'USD',
  pasaporte       text,
  idioma          text default 'es' check (idioma in ('es','en','pt')),
  avisos_mail     boolean default true,
  avisos_whatsapp boolean default false,
  avisos_diario   boolean default true,
  umbral_sobre    int default 85 check (umbral_sobre between 50 and 100),
  umbral_desvio   int default 3  check (umbral_desvio between 1 and 30),
  creado_en       timestamptz default now()
);

-- ---------- PLANES DE VIAJE -------------------------------------------------
create table if not exists public.planes (
  id            uuid primary key default gen_random_uuid(),
  usuario_id    uuid not null references auth.users on delete cascade,
  nombre        text,
  origen_iata   text,
  destino_iata  text,
  destino_texto text,
  presupuesto   numeric(10,2) not null check (presupuesto > 0),
  dias_total    int not null check (dias_total > 0),
  colchon_pct   numeric(4,2) default 10,
  fecha_inicio  date,
  activo        boolean default true,
  creado_en     timestamptz default now()
);
create index if not exists planes_usuario_idx on public.planes(usuario_id);

-- ---------- GASTOS ----------------------------------------------------------
create table if not exists public.gastos (
  id          bigserial primary key,
  plan_id     uuid not null references public.planes on delete cascade,
  usuario_id  uuid not null references auth.users on delete cascade,
  dia         int not null check (dia > 0),
  categoria   text not null check (categoria in
                ('estadia','traslados','transporte','comida','cowork','ocio','imprevistos')),
  subtipo     text,
  monto       numeric(12,2) not null check (monto >= 0),
  moneda      text not null default 'USD',
  monto_usd   numeric(12,2) not null,
  nota        text,
  creado_en   timestamptz default now()
);
create index if not exists gastos_plan_idx on public.gastos(plan_id, dia);

-- ---------- SUSCRIPCIONES Y PAGOS ------------------------------------------
create table if not exists public.suscripciones (
  usuario_id     uuid primary key references auth.users on delete cascade,
  plan           text not null default 'free'
                 check (plan in ('free','pro','anual','fundador')),
  estado         text not null default 'inactiva'
                 check (estado in ('activa','inactiva','cancelada','vencida')),
  proveedor      text,
  proveedor_id   text,
  metodo_ultimos text,
  proximo_cobro  date,
  actualizado_en timestamptz default now()
);

create table if not exists public.pagos (
  id           bigserial primary key,
  usuario_id   uuid not null references auth.users on delete cascade,
  concepto     text not null,
  monto        numeric(10,2) not null,
  moneda       text default 'USD',
  metodo       text,
  estado       text default 'pagado',
  proveedor_id text unique,
  creado_en    timestamptz default now()
);
create index if not exists pagos_usuario_idx on public.pagos(usuario_id, creado_en desc);

-- ---------- CACHÉ DE VUELOS -------------------------------------------------
-- Vive en la base y no solo en memoria porque las funciones sin servidor
-- se reinician constantemente. Cien búsquedas de la misma ruta el mismo día
-- consumen una sola llamada a la API en lugar de cien.
create table if not exists public.cache_vuelos (
  ruta        text primary key,          -- ej. LIM-LIS-rt-medio
  precio_bajo int not null,
  precio_alto int not null,
  fuente      text,
  creado_en   timestamptz default now()
);

-- ---------- APORTES DE COSTOS -----------------------------------------------
create table if not exists public.aportes_costos (
  id          bigserial primary key,
  usuario_id  uuid references auth.users on delete set null,
  ciudad_iata text not null,
  campo       text not null check (campo in ('rent','food','tr','cw','fun')),
  valor       numeric(10,2) not null check (valor >= 0),
  revisado    boolean default false,
  creado_en   timestamptz default now()
);

-- =============================================================================
-- SEGURIDAD A NIVEL DE FILA
-- =============================================================================
alter table public.perfiles       enable row level security;
alter table public.planes         enable row level security;
alter table public.gastos         enable row level security;
alter table public.suscripciones  enable row level security;
alter table public.pagos          enable row level security;
alter table public.cache_vuelos   enable row level security;
alter table public.aportes_costos enable row level security;

-- Cada quien ve y edita solo lo suyo
drop policy if exists p_perfiles on public.perfiles;
create policy p_perfiles on public.perfiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists p_planes on public.planes;
create policy p_planes on public.planes
  for all using (auth.uid() = usuario_id) with check (auth.uid() = usuario_id);

drop policy if exists p_gastos on public.gastos;
create policy p_gastos on public.gastos
  for all using (auth.uid() = usuario_id) with check (auth.uid() = usuario_id);

-- Suscripciones y pagos: el usuario solo lee. Escribe el webhook,
-- que usa la clave service_role y por tanto salta el RLS.
drop policy if exists p_susc_lectura on public.suscripciones;
create policy p_susc_lectura on public.suscripciones
  for select using (auth.uid() = usuario_id);

drop policy if exists p_pagos_lectura on public.pagos;
create policy p_pagos_lectura on public.pagos
  for select using (auth.uid() = usuario_id);

-- Caché de vuelos: cualquiera lee, solo el servidor escribe
drop policy if exists p_cache_lectura on public.cache_vuelos;
create policy p_cache_lectura on public.cache_vuelos for select using (true);

-- Aportes: cualquiera lee los revisados, un usuario autenticado puede enviar
drop policy if exists p_aportes_lectura on public.aportes_costos;
create policy p_aportes_lectura on public.aportes_costos
  for select using (revisado = true);

drop policy if exists p_aportes_insert on public.aportes_costos;
create policy p_aportes_insert on public.aportes_costos
  for insert with check (auth.uid() = usuario_id);

-- =============================================================================
-- AUTOMATISMOS
-- =============================================================================
-- Crear perfil y suscripción gratuita al registrarse
create or replace function public.nuevo_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfiles (id, correo) values (new.id, new.email)
    on conflict (id) do nothing;
  insert into public.suscripciones (usuario_id, plan, estado)
    values (new.id, 'free', 'activa') on conflict (usuario_id) do nothing;
  return new;
end; $$;

drop trigger if exists al_crear_usuario on auth.users;
create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.nuevo_usuario();

-- ¿Este usuario tiene acceso Pro? Úsala en el servidor antes de servir el gestor.
create or replace function public.es_pro(uid uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from public.suscripciones
    where usuario_id = uid and estado = 'activa' and plan in ('pro','anual','fundador')
  );
$$;
