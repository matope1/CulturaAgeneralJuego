-- Rotación global compartida para las salas online.
create table if not exists public.brava_question_rotation (
  mode text primary key check (mode in ('mc','ojo')),
  cycle int not null default 1,
  cycle_used_ids text[] not null default '{}',
  repeat_uses bigint not null default 0,
  updated_at timestamptz not null default now()
);
create table if not exists public.brava_question_usage (
  mode text not null check (mode in ('mc','ojo')),
  question_id text not null references public.game_questions(id),
  last_used_at timestamptz not null,
  use_count int not null default 1,
  primary key(mode,question_id)
);
create index if not exists brava_question_usage_recency on public.brava_question_usage(mode,last_used_at);
create table if not exists public.brava_rotation_games (
  id bigserial primary key,
  room_id uuid not null,
  mode text not null check (mode in ('mc','ojo')),
  question_count int not null,
  question_ids text[] not null,
  repeated_count int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists brava_rotation_games_recent on public.brava_rotation_games(mode,id desc);

alter table public.brava_question_rotation enable row level security;
alter table public.brava_question_usage enable row level security;
alter table public.brava_rotation_games enable row level security;
revoke all on public.brava_question_rotation,public.brava_question_usage,public.brava_rotation_games from anon,authenticated;
insert into public.brava_question_rotation(mode) values('mc'),('ojo') on conflict(mode) do nothing;

-- Conserva en la rotación las preguntas de partidas anteriores que aún guarda brava_rounds.
insert into public.brava_question_usage(mode,question_id,last_used_at,use_count)
select q.mode,r.question_id,max(room.created_at),count(*)::int
from public.brava_rounds r
join public.brava_rooms room on room.id=r.room_id
join public.game_questions q on q.id=r.question_id
group by q.mode,r.question_id
on conflict(mode,question_id) do update set
  last_used_at=greatest(brava_question_usage.last_used_at,excluded.last_used_at),
  use_count=greatest(brava_question_usage.use_count,excluded.use_count);

update public.brava_question_rotation x set cycle_used_ids=coalesce((
  select array_agg(u.question_id order by u.question_id) from public.brava_question_usage u where u.mode=x.mode
),'{}');

insert into public.brava_rotation_games(room_id,mode,question_count,question_ids,created_at)
select r.room_id,room.mode,count(*)::int,array_agg(r.question_id order by r.round_no),room.created_at
from public.brava_rounds r join public.brava_rooms room on room.id=r.room_id
group by r.room_id,room.mode,room.created_at
order by room.created_at
on conflict do nothing;

update public.brava_question_rotation rot set repeat_uses=coalesce((
  select sum(greatest(u.use_count-1,0)) from public.brava_question_usage u where u.mode=rot.mode
),0);

create or replace function public.brava_start_room(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare
  v_room brava_rooms%rowtype; v_rotation brava_question_rotation%rowtype;
  v_total int; v_available int; v_qid text; v_category text; v_difficulty text;
  v_ids text[]:='{}'; v_recent text[]:='{}'; v_union text[];
  v_repeats int:=0;
  v_last_category text; v_last_difficulty text; v_index int;
begin
  select * into v_room from brava_rooms where id=p_room_id for update;
  if not found or v_room.host_id<>auth.uid() then raise exception 'Solo el anfitrión puede iniciar.'; end if;
  if v_room.status<>'lobby' then raise exception 'La sala ya se inició.'; end if;
  select count(*) into v_total from brava_room_players where room_id=p_room_id;
  if v_total<2 or exists(select 1 from brava_room_players where room_id=p_room_id and (not ready or last_seen_at<now()-interval '45 seconds')) then raise exception 'Falta alguien conectado y listo.'; end if;
  select count(*) into v_available from game_questions q where q.mode=v_room.mode and (v_room.difficulty='mixed' or q.difficulty=v_room.difficulty or (v_room.difficulty='expert' and q.difficulty='difficult'));
  if v_available<v_room.question_count then raise exception 'No hay suficientes preguntas para esa combinación.'; end if;
  -- El ciclo es por modo, no por duración o dificultad: cambiar filtros no borra memoria.
  select count(*) into v_total from game_questions q where q.mode=v_room.mode;

  insert into brava_question_rotation(mode) values(v_room.mode) on conflict(mode) do nothing;
  select * into v_rotation from brava_question_rotation where mode=v_room.mode for update;
  select coalesce(array_agg(distinct x.qid),'{}') into v_recent
  from (select unnest(g.question_ids) qid from (select question_ids from brava_rotation_games where mode=v_room.mode order by id desc limit 3) g) x;

  -- Agota primero preguntas nuevas y evita las tres partidas más recientes.
  -- Si quedan pocas para completar la partida, añade las menos recientes antes de reciclar el ciclo.
  for v_index in 1..v_room.question_count loop
    select q.id,q.category,q.difficulty into v_qid,v_category,v_difficulty
    from game_questions q left join brava_question_usage u on u.mode=q.mode and u.question_id=q.id
    where q.mode=v_room.mode
      and (v_room.difficulty='mixed' or q.difficulty=v_room.difficulty or (v_room.difficulty='expert' and q.difficulty='difficult'))
      and not (q.id=any(v_ids))
    order by
      (q.id=any(v_rotation.cycle_used_ids)) asc,
      (q.id=any(v_recent)) asc,
      case when v_last_category is null or q.category<>v_last_category then 0 else 1 end asc,
      case when v_last_difficulty is null or q.difficulty<>v_last_difficulty then 0 else 1 end asc,
      coalesce(u.last_used_at,'epoch'::timestamptz) asc,
      random()
    limit 1;
    if v_qid is null then raise exception 'No se pudo completar la selección de preguntas.'; end if;
    if exists(select 1 from brava_question_usage u where u.mode=v_room.mode and u.question_id=v_qid) then v_repeats:=v_repeats+1; end if;
    v_ids:=array_append(v_ids,v_qid);
    v_last_category:=v_category; v_last_difficulty:=v_difficulty;
  end loop;

  delete from brava_rounds where room_id=p_room_id;
  for v_index in 1..array_length(v_ids,1) loop
    insert into brava_rounds(room_id,round_no,question_id) values(p_room_id,v_index,v_ids[v_index]);
    insert into brava_question_usage(mode,question_id,last_used_at,use_count) values(v_room.mode,v_ids[v_index],now(),1)
    on conflict(mode,question_id) do update set last_used_at=excluded.last_used_at,use_count=brava_question_usage.use_count+1;
  end loop;
  select array_agg(distinct id) into v_union from unnest(v_rotation.cycle_used_ids||v_ids) as ids(id);
  if cardinality(coalesce(v_union,'{}'))>=v_total then
    update brava_question_rotation set cycle=cycle+1,cycle_used_ids=v_ids,repeat_uses=repeat_uses+v_repeats,updated_at=now() where mode=v_room.mode;
  else
    update brava_question_rotation set cycle_used_ids=coalesce(v_union,'{}'),repeat_uses=repeat_uses+v_repeats,updated_at=now() where mode=v_room.mode;
  end if;
  insert into brava_rotation_games(room_id,mode,question_count,question_ids,repeated_count) values(p_room_id,v_room.mode,v_room.question_count,v_ids,v_repeats);

  update brava_rooms set status='playing',round_no=1 where id=p_room_id;
  update brava_room_players set score=0,correct=0,streak=0,best_streak=0,last_seen_at=now() where room_id=p_room_id;
  perform brava_sync_live(p_room_id);
  return public.brava_room_state(p_room_id);
end; $$;

create or replace function public.brava_rotation_stats(p_mode text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Inicia sesión para consultar la rotación.'; end if;
  if p_mode is not null and p_mode not in ('mc','ojo') then raise exception 'Modo no válido.'; end if;
  select jsonb_build_object(
    'modes',(select coalesce(jsonb_agg(jsonb_build_object('mode',q.mode,'total',q.total,'usedUnique',q.used,'availableThisCycle',greatest(0,q.total-cardinality(coalesce(rot.cycle_used_ids,'{}'))),'cycle',coalesce(rot.cycle,1),'repeatUses',coalesce(rot.repeat_uses,0))),'[]'::jsonb)
      from (select mode,count(*)::int total,(select count(*)::int from brava_question_usage u where u.mode=g.mode) used from game_questions g where p_mode is null or g.mode=p_mode group by mode) q
      left join brava_question_rotation rot on rot.mode=q.mode),
    'repeated',(select coalesce(jsonb_agg(jsonb_build_object('id',u.question_id,'question',q.question,'uses',u.use_count) order by u.use_count desc),'[]'::jsonb)
      from brava_question_usage u join game_questions q on q.id=u.question_id where u.use_count>1 and (p_mode is null or u.mode=p_mode)),
    'history',(select coalesce(jsonb_agg(jsonb_build_object('mode',h.mode,'count',h.question_count,'repeats',h.repeated_count,'at',h.created_at,'ids',h.question_ids) order by h.id desc),'[]'::jsonb)
      from (select * from brava_rotation_games where p_mode is null or mode=p_mode order by id desc limit 5) h)
  ) into v_result;
  return v_result;
end; $$;

-- Reinicio compartido solo para anfitriones, desde una sala de espera.
create or replace function public.brava_reset_rotation(p_room_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_room brava_rooms%rowtype;
begin
  select * into v_room from brava_rooms where id=p_room_id for update;
  if not found or v_room.host_id<>auth.uid() then raise exception 'Solo el anfitrión puede reiniciar la rotación.'; end if;
  if v_room.status<>'lobby' then raise exception 'Reinicia la rotación desde la sala de espera.'; end if;
  perform 1 from brava_question_rotation where mode=v_room.mode for update;
  delete from brava_question_usage where mode=v_room.mode;
  delete from brava_rotation_games where mode=v_room.mode;
  update brava_question_rotation set cycle=1,cycle_used_ids='{}',repeat_uses=0,updated_at=now() where mode=v_room.mode;
end; $$;

revoke all on function public.brava_start_room(uuid) from public,anon;
grant execute on function public.brava_start_room(uuid) to authenticated;
revoke all on function public.brava_rotation_stats(text) from public,anon;
grant execute on function public.brava_rotation_stats(text) to authenticated;
revoke all on function public.brava_reset_rotation(uuid) from public,anon;
grant execute on function public.brava_reset_rotation(uuid) to authenticated;

