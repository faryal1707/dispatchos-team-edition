-- DispatchOS Team Edition schema
-- Run this entire file in Supabase SQL Editor.
-- It creates a multi-user organization model with RLS.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Dispatcher',
  xp integer not null default 0,
  shift_active boolean not null default false,
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'dispatcher' check (role in ('admin','dispatcher','trainer')),
  status text not null default 'active' check (status in ('active','disabled')),
  joined_at timestamptz not null default now(),
  primary key (org_id,user_id)
);

create or replace function public.is_org_member(p_org uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.organization_members m where m.org_id=p_org and m.user_id=auth.uid() and m.status='active');
$$;

create or replace function public.current_org_role(p_org uuid)
returns text language sql stable security definer set search_path=public as $$
  select role from public.organization_members where org_id=p_org and user_id=auth.uid() and status='active' limit 1;
$$;

create or replace function public.is_org_admin(p_org uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select coalesce(public.current_org_role(p_org)='admin',false);
$$;

create or replace function public.can_supervise(p_org uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select coalesce(public.current_org_role(p_org) in ('admin','trainer'),false);
$$;

create or replace function public.generate_invite_code()
returns text language plpgsql as $$
declare c text;
begin
  loop
    c := upper(substr(encode(gen_random_bytes(8),'hex'),1,8));
    exit when not exists(select 1 from public.organizations where invite_code=c);
  end loop;
  return c;
end; $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id,display_name)
  values(new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)))
  on conflict(id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.create_organization(p_name text)
returns table(org_id uuid, invite_code text)
language plpgsql security definer set search_path=public as $$
declare oid uuid; code text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  code := public.generate_invite_code();
  insert into public.organizations(name,invite_code,created_by) values(trim(p_name),code,auth.uid()) returning id into oid;
  insert into public.organization_members(org_id,user_id,role) values(oid,auth.uid(),'admin');
  return query select oid, code;
end; $$;

create or replace function public.join_organization(p_invite_code text)
returns uuid language plpgsql security definer set search_path=public as $$
declare oid uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select id into oid from public.organizations where invite_code=upper(trim(p_invite_code));
  if oid is null then raise exception 'Invalid team code'; end if;
  insert into public.organization_members(org_id,user_id,role) values(oid,auth.uid(),'dispatcher') on conflict(org_id,user_id) do update set status='active';
  return oid;
end; $$;

create table if not exists public.trucks (
  id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id) on delete cascade,
  truck_no text not null, driver_name text not null, equipment text not null, driver_type text not null default 'Solo',
  current_location text, status text not null default 'Available', assigned_to uuid references auth.users(id), daily_target numeric not null default 1500,
  created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists trucks_org_no_idx on public.trucks(org_id,truck_no);

create table if not exists public.loads (
  id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id) on delete cascade,
  truck_id uuid references public.trucks(id) on delete set null, broker text not null, rate numeric not null default 0, source text not null default 'DAT',
  origin text not null, destination text not null, loaded_miles numeric not null default 0, deadhead_miles numeric not null default 0,
  pickup_at timestamptz, delivery_at timestamptz, reference_no text, status text not null default 'Booked', notes text,
  assigned_to uuid references auth.users(id), created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.issues (
  id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id) on delete cascade,
  title text not null, issue_type text not null, priority text not null default 'Medium', details text not null, next_action text,
  truck_id uuid references public.trucks(id) on delete set null, assigned_to uuid references auth.users(id), solved boolean not null default false,
  resolved_at timestamptz, created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade, title text not null, category text, priority text, due_date date, notes text,
  done boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.cases (
  id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade, problem text not null, category text, solution text not null, lesson text,
  tags text, visibility text not null default 'personal' check(visibility in('personal','company')), created_at timestamptz not null default now()
);

create table if not exists public.learning_notes (
  id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade, topic text not null, source text, note text not null, question text,
  created_at timestamptz not null default now()
);

create table if not exists public.daily_reviews (
  id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade, review_date date not null default current_date,
  biggest_win text, challenge text, improvement text, score integer, grade text, created_at timestamptz not null default now(),
  unique(org_id,user_id,review_date)
);

create table if not exists public.activity_logs (
  id bigint generated always as identity primary key, org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade, action text not null, entity_type text, entity_id text, details text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.trucks enable row level security;
alter table public.loads enable row level security;
alter table public.issues enable row level security;
alter table public.tasks enable row level security;
alter table public.cases enable row level security;
alter table public.learning_notes enable row level security;
alter table public.daily_reviews enable row level security;
alter table public.activity_logs enable row level security;

-- Profiles
create policy "profiles own read" on public.profiles for select using(id=auth.uid());
create policy "profiles team read" on public.profiles for select using(exists(select 1 from public.organization_members me join public.organization_members them on me.org_id=them.org_id where me.user_id=auth.uid() and them.user_id=profiles.id and me.status='active' and them.status='active'));
create policy "profiles own update" on public.profiles for update using(id=auth.uid()) with check(id=auth.uid());

-- Organizations and membership
create policy "org members read org" on public.organizations for select using(public.is_org_member(id));
create policy "members read membership" on public.organization_members for select using(public.is_org_member(org_id));
create policy "admins update membership" on public.organization_members for update using(public.is_org_admin(org_id)) with check(public.is_org_admin(org_id));

-- Shared operational tables
create policy "members read trucks" on public.trucks for select using(public.is_org_member(org_id));
create policy "operators insert trucks" on public.trucks for insert with check(public.current_org_role(org_id) in ('admin','dispatcher') and created_by=auth.uid());
create policy "operators update trucks" on public.trucks for update using(public.current_org_role(org_id) in ('admin','dispatcher')) with check(public.current_org_role(org_id) in ('admin','dispatcher'));
create policy "admins delete trucks" on public.trucks for delete using(public.is_org_admin(org_id));

create policy "members read loads" on public.loads for select using(public.is_org_member(org_id));
create policy "operators insert loads" on public.loads for insert with check(public.current_org_role(org_id) in ('admin','dispatcher') and created_by=auth.uid());
create policy "operators update loads" on public.loads for update using(public.current_org_role(org_id) in ('admin','dispatcher')) with check(public.current_org_role(org_id) in ('admin','dispatcher'));
create policy "admins delete loads" on public.loads for delete using(public.is_org_admin(org_id));

create policy "members read issues" on public.issues for select using(public.is_org_member(org_id));
create policy "operators insert issues" on public.issues for insert with check(public.current_org_role(org_id) in ('admin','dispatcher') and created_by=auth.uid());
create policy "operators update issues" on public.issues for update using(public.current_org_role(org_id) in ('admin','dispatcher')) with check(public.current_org_role(org_id) in ('admin','dispatcher'));
create policy "admins delete issues" on public.issues for delete using(public.is_org_admin(org_id));

-- Private work with supervision
create policy "tasks visible to owner supervisors" on public.tasks for select using(user_id=auth.uid() or public.can_supervise(org_id));
create policy "tasks owner insert" on public.tasks for insert with check(user_id=auth.uid() and public.is_org_member(org_id));
create policy "tasks owner update" on public.tasks for update using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy "tasks owner delete" on public.tasks for delete using(user_id=auth.uid());

create policy "cases visible" on public.cases for select using(public.is_org_member(org_id) and (visibility='company' or user_id=auth.uid() or public.can_supervise(org_id)));
create policy "cases owner insert" on public.cases for insert with check(user_id=auth.uid() and public.is_org_member(org_id));
create policy "cases owner update" on public.cases for update using(user_id=auth.uid() or public.is_org_admin(org_id)) with check(user_id=auth.uid() or public.is_org_admin(org_id));
create policy "cases owner delete" on public.cases for delete using(user_id=auth.uid() or public.is_org_admin(org_id));

create policy "learning visible to owner supervisors" on public.learning_notes for select using(user_id=auth.uid() or public.can_supervise(org_id));
create policy "learning owner insert" on public.learning_notes for insert with check(user_id=auth.uid() and public.is_org_member(org_id));
create policy "learning owner delete" on public.learning_notes for delete using(user_id=auth.uid());

create policy "reviews visible to owner supervisors" on public.daily_reviews for select using(user_id=auth.uid() or public.can_supervise(org_id));
create policy "reviews owner write" on public.daily_reviews for insert with check(user_id=auth.uid() and public.is_org_member(org_id));
create policy "reviews owner update" on public.daily_reviews for update using(user_id=auth.uid()) with check(user_id=auth.uid());

create policy "members read activity" on public.activity_logs for select using(public.is_org_member(org_id));
create policy "members insert activity" on public.activity_logs for insert with check(user_id=auth.uid() and public.is_org_member(org_id));

-- Grants for browser client
revoke all on function public.create_organization(text) from public;
revoke all on function public.join_organization(text) from public;
grant execute on function public.create_organization(text) to authenticated;
grant execute on function public.join_organization(text) to authenticated;
