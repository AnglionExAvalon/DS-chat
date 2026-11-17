-- 云同步表结构。在 Supabase 控制台的 SQL Editor 里整段执行，可重复执行。
-- 旧表 public.snapshots 保留：会话级快照迁移完成后仍可作为退路。

-- ---------------------------------------------------------------------------
-- 会话级快照：一行一个会话，客户端只上传有改动的会话
-- ---------------------------------------------------------------------------
create table if not exists public.session_snapshots (
  user_id uuid not null references auth.users on delete cascade,
  session_id text not null,
  payload text not null default '',
  -- 删除墓碑：整包快照靠“新快照里没有它”表达删除，逐会话必须显式标记
  deleted boolean not null default false,
  -- 服务端自增版本号，客户端据此判断云端是否变过，不受设备时钟偏差影响
  version bigint not null default 0,
  updated_at timestamptz not null default now(),
  device_id text,
  device_name text,
  primary key (user_id, session_id)
);

-- 每次写入由服务端推进版本与时间，客户端不传这两个字段
create or replace function public.touch_session_snapshot()
returns trigger
language plpgsql
as $$
begin
  new.version := coalesce(old.version, 0) + 1;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists touch_session_snapshot on public.session_snapshots;
create trigger touch_session_snapshot
before insert or update on public.session_snapshots
for each row execute function public.touch_session_snapshot();

alter table public.session_snapshots enable row level security;

drop policy if exists "session_snapshots select own" on public.session_snapshots;
create policy "session_snapshots select own" on public.session_snapshots
  for select using (auth.uid() = user_id);

drop policy if exists "session_snapshots insert own" on public.session_snapshots;
create policy "session_snapshots insert own" on public.session_snapshots
  for insert with check (auth.uid() = user_id);

drop policy if exists "session_snapshots update own" on public.session_snapshots;
create policy "session_snapshots update own" on public.session_snapshots
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "session_snapshots delete own" on public.session_snapshots;
create policy "session_snapshots delete own" on public.session_snapshots
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 设备租约：同一个同步码同一时间只让一台设备写入
-- ---------------------------------------------------------------------------
create table if not exists public.sync_devices (
  user_id uuid primary key references auth.users on delete cascade,
  device_id text not null,
  device_name text not null,
  seen_at timestamptz not null default now()
);

alter table public.sync_devices enable row level security;
-- 心跳时间统一用服务端时间，避免两台设备的时钟偏差影响判断
create or replace function public.touch_sync_device()
returns trigger
language plpgsql
as $$
begin
  new.seen_at := now();
  return new;
end;
$$;

drop trigger if exists touch_sync_device on public.sync_devices;
create trigger touch_sync_device
before insert or update on public.sync_devices
for each row execute function public.touch_sync_device();

drop policy if exists "sync_devices select own" on public.sync_devices;
create policy "sync_devices select own" on public.sync_devices
  for select using (auth.uid() = user_id);

drop policy if exists "sync_devices insert own" on public.sync_devices;
create policy "sync_devices insert own" on public.sync_devices
  for insert with check (auth.uid() = user_id);

drop policy if exists "sync_devices update own" on public.sync_devices;
create policy "sync_devices update own" on public.sync_devices
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "sync_devices delete own" on public.sync_devices;
create policy "sync_devices delete own" on public.sync_devices
  for delete using (auth.uid() = user_id);