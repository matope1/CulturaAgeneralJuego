-- Cultura Brava online. Aplicar en Supabase SQL Editor antes de importar seed_questions.sql.
create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;
revoke create on schema public from public,anon,authenticated;

create table if not exists public.game_questions (
  id text primary key,
  mode text not null check (mode in ('mc','ojo')),
  category text not null,
  difficulty text not null check (difficulty in ('easy','normal','difficult','expert')),
  question text not null,
  answer jsonb not null,
  options jsonb,
  unit text,
  tolerance numeric not null default 0,
  explanation text not null,
  source text not null,
  check ((mode='mc' and jsonb_typeof(options)='array') or (mode='ojo' and unit is not null))
);

create table if not exists public.brava_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  host_id uuid not null,
  status text not null default 'lobby' check (status in ('lobby','playing','reveal','finished')),
  mode text not null check (mode in ('mc','ojo')),
  question_count int not null check (question_count in (10,30,50)),
  difficulty text not null check (difficulty in ('mixed','easy','normal','difficult','expert')),
  round_no int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.brava_room_players (
  room_id uuid not null references public.brava_rooms(id) on delete cascade,
  user_id uuid not null,
  name text not null check (char_length(name) between 1 and 18),
  is_host boolean not null default false,
  ready boolean not null default false,
  score int not null default 0,
  correct int not null default 0,
  streak int not null default 0,
  best_streak int not null default 0,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (room_id,user_id),
  unique (room_id,name)
);

-- Tabla privada: un jugador nunca puede leer las apuestas de los demás.
create table if not exists public.brava_answers (
  room_id uuid not null references public.brava_rooms(id) on delete cascade,
  round_no int not null,
  user_id uuid not null,
  answer jsonb not null,
  submitted_at timestamptz not null default now(),
  primary key (room_id,round_no,user_id)
);
-- Solo indica que alguien ya respondió; jamás contiene el valor de su respuesta.
create table if not exists public.brava_round_progress (
  room_id uuid not null references public.brava_rooms(id) on delete cascade,
  round_no int not null,
  user_id uuid not null,
  submitted boolean not null default true,
  primary key (room_id,round_no,user_id)
);

-- Réplica pública sin pregunta, respuestas ni datos de puntuación manipulables.
create table if not exists public.brava_room_live (
  room_id uuid primary key references public.brava_rooms(id) on delete cascade,
  code text not null,
  host_id uuid not null,
  status text not null,
  mode text not null,
  question_count int not null,
  difficulty text not null,
  round_no int not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.brava_rounds (
  room_id uuid not null references public.brava_rooms(id) on delete cascade,
  round_no int not null,
  question_id text not null references public.game_questions(id),
  primary key (room_id,round_no)
);

alter table public.game_questions enable row level security;
alter table public.brava_rooms enable row level security;
alter table public.brava_room_players enable row level security;
alter table public.brava_answers enable row level security;
alter table public.brava_round_progress enable row level security;
alter table public.brava_room_live enable row level security;
alter table public.brava_rounds enable row level security;

create or replace function private.brava_is_room_member(p_room_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.brava_room_players where room_id=p_room_id and user_id=auth.uid());
$$;
revoke all on function private.brava_is_room_member(uuid) from public,anon,authenticated;
grant usage on schema private to authenticated;
grant execute on function private.brava_is_room_member(uuid) to authenticated;

-- La tabla pública contiene únicamente datos visibles en la sala. Todas las escrituras son RPC.
create policy "room members read live room" on public.brava_room_live for select to authenticated
  using (private.brava_is_room_member(room_id));
create policy "room members read player cards" on public.brava_room_players for select to authenticated
  using (private.brava_is_room_member(room_id));
create policy "room members read answer progress" on public.brava_round_progress for select to authenticated
  using (private.brava_is_room_member(room_id));

revoke all on public.game_questions, public.brava_rooms, public.brava_answers, public.brava_rounds from anon, authenticated;
revoke insert, update, delete on public.brava_room_players, public.brava_room_live, public.brava_round_progress from anon, authenticated;
grant select on public.brava_room_players, public.brava_room_live, public.brava_round_progress to authenticated;

create or replace function public.brava_sync_live(p_room_id uuid)
returns void language sql security definer set search_path=public,pg_temp as $$
  insert into brava_room_live(room_id,code,host_id,status,mode,question_count,difficulty,round_no,updated_at)
  select id,code,host_id,status,mode,question_count,difficulty,round_no,now() from brava_rooms where id=p_room_id
  on conflict(room_id) do update set code=excluded.code,host_id=excluded.host_id,status=excluded.status,
    mode=excluded.mode,question_count=excluded.question_count,difficulty=excluded.difficulty,
    round_no=excluded.round_no,updated_at=excluded.updated_at;
$$;
revoke all on function public.brava_sync_live(uuid) from public,anon,authenticated;

create or replace function public.brava_create_room(p_name text,p_mode text,p_count int,p_difficulty text)
returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare v_uid uuid:=auth.uid(); v_id uuid; v_code text; v_attempt int:=0;
begin
  if v_uid is null then raise exception 'Inicia sesión para crear una sala.'; end if;
  if length(trim(p_name)) not between 1 and 18 or p_mode not in ('mc','ojo') or p_count not in (10,30,50)
     or p_difficulty not in ('mixed','easy','normal','difficult','expert') then raise exception 'Configuración no válida.'; end if;
  if not exists(select 1 from game_questions q where q.mode=p_mode and (p_difficulty='mixed' or q.difficulty=p_difficulty or (p_difficulty='expert' and q.difficulty='difficult')) having count(*)>=p_count) then
    raise exception 'No hay suficientes preguntas para esa combinación.';
  end if;
  loop
    v_code:=upper(substr(encode(gen_random_bytes(8),'hex'),1,6));
    begin insert into brava_rooms(id,code,host_id,mode,question_count,difficulty) values(gen_random_uuid(),v_code,v_uid,p_mode,p_count,p_difficulty) returning id into v_id; exit;
    exception when unique_violation then v_attempt:=v_attempt+1; if v_attempt>10 then raise exception 'No se pudo reservar un código. Inténtalo de nuevo.'; end if;
    end;
  end loop;
  insert into brava_room_players(room_id,user_id,name,is_host,ready) values(v_id,v_uid,trim(p_name),true,true);
  perform brava_sync_live(v_id);
  return jsonb_build_object('room_id',v_id,'code',v_code);
end; $$;

create or replace function public.brava_join_room(p_code text,p_name text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_uid uuid:=auth.uid(); v_room brava_rooms%rowtype;
begin
  if v_uid is null then raise exception 'Inicia sesión para unirte.'; end if;
  if length(trim(p_name)) not between 1 and 18 then raise exception 'El nombre debe tener entre 1 y 18 caracteres.'; end if;
  select * into v_room from brava_rooms where code=upper(trim(p_code)) for update;
  if not found or v_room.status<>'lobby' then raise exception 'No existe una sala abierta con ese código.'; end if;
  if exists(select 1 from brava_room_players where room_id=v_room.id and user_id=v_uid) then return jsonb_build_object('room_id',v_room.id,'code',v_room.code); end if;
  if (select count(*) from brava_room_players where room_id=v_room.id)>=4 then raise exception 'La sala ya está llena.'; end if;
  if exists(select 1 from brava_room_players where room_id=v_room.id and lower(name)=lower(trim(p_name))) then raise exception 'Ese nombre ya está en la sala.'; end if;
  insert into brava_room_players(room_id,user_id,name) values(v_room.id,v_uid,trim(p_name));
  perform brava_sync_live(v_room.id);
  return jsonb_build_object('room_id',v_room.id,'code',v_room.code);
end; $$;

create or replace function public.brava_set_ready(p_room_id uuid,p_ready boolean)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_status text;
begin
  if not exists(select 1 from brava_room_players where room_id=p_room_id and user_id=auth.uid()) then raise exception 'No perteneces a esta sala.'; end if;
  select status into v_status from brava_rooms where id=p_room_id for update;
  if v_status is distinct from 'lobby' then raise exception 'La partida ya ha comenzado.'; end if;
  update brava_room_players set ready=p_ready,last_seen_at=now() where room_id=p_room_id and user_id=auth.uid();
end; $$;

create or replace function public.brava_start_room(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_room brava_rooms%rowtype; v_total int;
begin
  select * into v_room from brava_rooms where id=p_room_id for update;
  if not found or v_room.host_id<>auth.uid() then raise exception 'Solo el anfitrión puede iniciar.'; end if;
  if v_room.status<>'lobby' then raise exception 'La sala ya se inició.'; end if;
  select count(*) into v_total from brava_room_players where room_id=p_room_id;
  if v_total<2 or exists(select 1 from brava_room_players where room_id=p_room_id and (not ready or last_seen_at<now()-interval '45 seconds')) then raise exception 'Falta alguien conectado y listo.'; end if;
  if (select count(*) from game_questions q where q.mode=v_room.mode and (v_room.difficulty='mixed' or q.difficulty=v_room.difficulty or (v_room.difficulty='expert' and q.difficulty='difficult')))<v_room.question_count then raise exception 'No hay suficientes preguntas para esa combinación.'; end if;
  delete from brava_rounds where room_id=p_room_id;
  insert into brava_rounds(room_id,round_no,question_id)
    select p_room_id,row_number() over(order by random())::int,q.id from game_questions q
    where q.mode=v_room.mode and (v_room.difficulty='mixed' or q.difficulty=v_room.difficulty or (v_room.difficulty='expert' and q.difficulty='difficult'))
    order by random() limit v_room.question_count;
  update brava_rooms set status='playing',round_no=1 where id=p_room_id;
  update brava_room_players set score=0,correct=0,streak=0,best_streak=0,last_seen_at=now() where room_id=p_room_id;
  perform brava_sync_live(p_room_id);
  return public.brava_room_state(p_room_id);
end; $$;

create or replace function public.brava_submit_answer(p_room_id uuid,p_answer jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_room brava_rooms%rowtype; v_q game_questions%rowtype; v_answer jsonb; v_count int;
begin
  select * into v_room from brava_rooms where id=p_room_id for update;
  if not found or not exists(select 1 from brava_room_players where room_id=p_room_id and user_id=auth.uid()) then raise exception 'No perteneces a esta sala.'; end if;
  if v_room.status<>'playing' then raise exception 'Esta ronda no acepta respuestas.'; end if;
  select q.* into v_q from brava_rounds r join game_questions q on q.id=r.question_id where r.room_id=p_room_id and r.round_no=v_room.round_no;
  if v_room.mode='mc' then
    if jsonb_typeof(p_answer)<>'string' or not exists(select 1 from jsonb_array_elements_text(v_q.options) o where o.value=p_answer#>>'{}') then raise exception 'Elige una opción válida.'; end if;
  else
    if jsonb_typeof(p_answer)<>'number' or (p_answer#>>'{}')::numeric not between -1000000000000 and 1000000000000 then raise exception 'Escribe una cifra válida.'; end if;
  end if;
  insert into brava_answers(room_id,round_no,user_id,answer) values(p_room_id,v_room.round_no,auth.uid(),p_answer)
  on conflict(room_id,round_no,user_id) do nothing;
  if not found then raise exception 'Ya habías respondido esta ronda.'; end if;
  insert into brava_round_progress(room_id,round_no,user_id) values(p_room_id,v_room.round_no,auth.uid()) on conflict do nothing;
  update brava_room_players set last_seen_at=now() where room_id=p_room_id and user_id=auth.uid();
  select count(*) into v_count from brava_answers where room_id=p_room_id and round_no=v_room.round_no;
  if v_count=(select count(*) from brava_room_players where room_id=p_room_id) then
    if v_room.mode='mc' then
      update brava_room_players p set
        score=p.score+case when a.answer=v_q.answer then 1 else 0 end,
        correct=p.correct+case when a.answer=v_q.answer then 1 else 0 end,
        streak=case when a.answer=v_q.answer then p.streak+1 else 0 end,
        best_streak=greatest(p.best_streak,case when a.answer=v_q.answer then p.streak+1 else 0 end)
      from brava_answers a where p.room_id=p_room_id and a.room_id=p_room_id and a.round_no=v_room.round_no and a.user_id=p.user_id;
    else
      with distances as (select a.user_id,abs((a.answer#>>'{}')::numeric-(v_q.answer#>>'{}')::numeric) d from brava_answers a where a.room_id=p_room_id and a.round_no=v_room.round_no),
      best as (select min(d) d from distances)
      update brava_room_players p set score=p.score+case when d.d=b.d then 1 else 0 end,
        streak=case when d.d=b.d then p.streak+1 else 0 end,
        best_streak=greatest(p.best_streak,case when d.d=b.d then p.streak+1 else 0 end)
      from distances d cross join best b where p.room_id=p_room_id and p.user_id=d.user_id;
    end if;
    update brava_rooms set status='reveal' where id=p_room_id;
    perform brava_sync_live(p_room_id);
  end if;
  return public.brava_room_state(p_room_id);
end; $$;

create or replace function public.brava_advance_room(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_room brava_rooms%rowtype;
begin
  select * into v_room from brava_rooms where id=p_room_id for update;
  if not found or v_room.host_id<>auth.uid() then raise exception 'Solo el anfitrión puede avanzar.'; end if;
  if v_room.status<>'reveal' then raise exception 'La ronda aún no se puede cerrar.'; end if;
  if v_room.round_no>=v_room.question_count then update brava_rooms set status='finished' where id=p_room_id;
  else update brava_rooms set status='playing',round_no=round_no+1 where id=p_room_id; end if;
  perform brava_sync_live(p_room_id);
  return public.brava_room_state(p_room_id);
end; $$;

create or replace function public.brava_room_state(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_room brava_rooms%rowtype; v_q game_questions%rowtype; v_state jsonb; v_uid uuid:=auth.uid();
begin
  select * into v_room from brava_rooms where id=p_room_id;
  if not found or not exists(select 1 from brava_room_players where room_id=p_room_id and user_id=v_uid) then raise exception 'No tienes acceso a esta sala.'; end if;
  if v_room.round_no>0 and v_room.status<>'lobby' then select q.* into v_q from brava_rounds r join game_questions q on q.id=r.question_id where r.room_id=p_room_id and r.round_no=v_room.round_no; end if;
  select jsonb_build_object(
    'roomId',v_room.id,'code',v_room.code,'hostId',v_room.host_id,'status',v_room.status,'mode',v_room.mode,
    'count',v_room.question_count,'difficulty',v_room.difficulty,'round',v_room.round_no,
    'players',(select coalesce(jsonb_agg(jsonb_build_object('id',p.user_id,'name',p.name,'host',p.is_host,'ready',p.ready,'score',p.score,'correct',p.correct,'streak',p.streak,'bestStreak',p.best_streak,'connected',p.last_seen_at>now()-interval '45 seconds','submitted',exists(select 1 from brava_round_progress pr where pr.room_id=p_room_id and pr.round_no=v_room.round_no and pr.user_id=p.user_id)) order by p.joined_at),'[]'::jsonb) from brava_room_players p where p.room_id=p_room_id),
    'answered',(select count(*) from brava_answers a where a.room_id=p_room_id and a.round_no=v_room.round_no),
    'myAnswer',(select a.answer from brava_answers a where a.room_id=p_room_id and a.round_no=v_room.round_no and a.user_id=v_uid),
    'question',case when v_q.id is null then null else jsonb_build_object('id',v_q.id,'mode',v_q.mode,'category',v_q.category,'difficulty',v_q.difficulty,'q',v_q.question,'o',v_q.options,'unit',v_q.unit) end,
    'reveal',case when v_room.status in ('reveal','finished') and v_q.id is not null then jsonb_build_object('answer',v_q.answer,'explanation',v_q.explanation,'source',v_q.source,'answers',(select coalesce(jsonb_agg(jsonb_build_object('playerId',x.user_id,'name',x.name,'color',case x.pos when 1 then '#d4ff55' when 2 then '#7cacf8' when 3 then '#ff987e' else '#c693ff' end,'answer',x.answer) order by x.pos),'[]'::jsonb) from (select p.user_id,p.name,a.answer,row_number() over(order by p.joined_at) pos from brava_answers a join brava_room_players p on p.room_id=a.room_id and p.user_id=a.user_id where a.room_id=p_room_id and a.round_no=v_room.round_no) x)) else null end
  ) into v_state;
  return v_state;
end; $$;

create or replace function public.brava_heartbeat(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_room brava_rooms%rowtype; v_host_seen timestamptz;
begin
  select * into v_room from brava_rooms where id=p_room_id for update;
  if not found or not exists(select 1 from brava_room_players where room_id=p_room_id and user_id=auth.uid()) then raise exception 'No perteneces a esta sala.'; end if;
  update brava_room_players set last_seen_at=now() where room_id=p_room_id and user_id=auth.uid();
  select last_seen_at into v_host_seen from brava_room_players where room_id=p_room_id and user_id=v_room.host_id;
  if v_host_seen is null or v_host_seen<now()-interval '45 seconds' then
    update brava_rooms set host_id=(select user_id from brava_room_players where room_id=p_room_id and last_seen_at>now()-interval '45 seconds' order by joined_at limit 1) where id=p_room_id;
    update brava_room_players set is_host=(user_id=(select host_id from brava_rooms where id=p_room_id)) where room_id=p_room_id;
    perform brava_sync_live(p_room_id);
  end if;
  return public.brava_room_state(p_room_id);
end; $$;

create or replace function public.brava_leave_room(p_room_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_room brava_rooms%rowtype; v_next uuid;
begin
  select * into v_room from brava_rooms where id=p_room_id for update;
  if not found or not exists(select 1 from brava_room_players where room_id=p_room_id and user_id=auth.uid()) then return; end if;
  delete from brava_room_players where room_id=p_room_id and user_id=auth.uid();
  if v_room.host_id=auth.uid() then
    select user_id into v_next from brava_room_players where room_id=p_room_id order by joined_at limit 1;
    if v_next is null then delete from brava_rooms where id=p_room_id; return; end if;
    update brava_rooms set host_id=v_next where id=p_room_id;
    update brava_room_players set is_host=(user_id=v_next) where room_id=p_room_id;
  end if;
  perform brava_sync_live(p_room_id);
end; $$;

create or replace function public.brava_reset_room(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_room brava_rooms%rowtype;
begin
  select * into v_room from brava_rooms where id=p_room_id for update;
  if not found or v_room.host_id<>auth.uid() then raise exception 'Solo el anfitrión puede reiniciar.'; end if;
  delete from brava_rounds where room_id=p_room_id;
  delete from brava_answers where room_id=p_room_id;
  update brava_rooms set status='lobby',round_no=0 where id=p_room_id;
  update brava_room_players set score=0,correct=0,streak=0,best_streak=0,ready=(user_id=auth.uid()) where room_id=p_room_id;
  perform brava_sync_live(p_room_id);
  return public.brava_room_state(p_room_id);
end; $$;

create or replace function public.brava_rpc_heartbeat(p_room_id uuid)
returns void language sql security definer set search_path=public,pg_temp as $$
  update brava_room_players set last_seen_at=now() where room_id=p_room_id and user_id=auth.uid();
$$;

do $$ declare f text; begin
  foreach f in array array['brava_create_room(text,text,int,text)','brava_join_room(text,text)','brava_set_ready(uuid,boolean)','brava_start_room(uuid)','brava_submit_answer(uuid,jsonb)','brava_advance_room(uuid)','brava_room_state(uuid)','brava_heartbeat(uuid)','brava_leave_room(uuid)','brava_reset_room(uuid)','brava_rpc_heartbeat(uuid)'] loop
    execute format('revoke all on function public.%s from public,anon',f);
    execute format('grant execute on function public.%s to authenticated',f);
  end loop;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.brava_room_live;
  alter publication supabase_realtime add table public.brava_room_players;
  alter publication supabase_realtime add table public.brava_round_progress;
exception when duplicate_object then null;
end $$;
