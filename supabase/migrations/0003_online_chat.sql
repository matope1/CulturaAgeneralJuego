-- Chat/reacciones por partida. Solo miembros pueden leer; escrituras exclusivamente por RPC.
alter table public.brava_rooms add column if not exists chat_epoch int not null default 0;

create table if not exists public.brava_room_chat (
  id bigserial primary key,
  room_id uuid not null references public.brava_rooms(id) on delete cascade,
  game_epoch int not null,
  user_id uuid not null,
  player_name text not null,
  kind text not null check(kind in ('message','reaction')),
  body text not null check(char_length(body) between 1 and 240),
  created_at timestamptz not null default now()
);
create index if not exists brava_room_chat_game on public.brava_room_chat(room_id,game_epoch,id);
alter table public.brava_room_chat enable row level security;
revoke all on public.brava_room_chat from anon,authenticated;
grant select on public.brava_room_chat to authenticated;
create or replace function private.brava_can_read_current_chat(p_room_id uuid,p_epoch int)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.brava_room_players p join public.brava_rooms r on r.id=p.room_id
    where p.room_id=p_room_id and p.user_id=auth.uid() and r.chat_epoch=p_epoch);
$$;
revoke all on function private.brava_can_read_current_chat(uuid,int) from public,anon,authenticated;
grant execute on function private.brava_can_read_current_chat(uuid,int) to authenticated;
create policy "room members read chat" on public.brava_room_chat for select to authenticated
  using (private.brava_can_read_current_chat(room_id,game_epoch));

do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='brava_room_chat') then
    alter publication supabase_realtime add table public.brava_room_chat;
  end if;
end $$;

create or replace function public.brava_chat_history(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_epoch int;
begin
  if not exists(select 1 from brava_room_players where room_id=p_room_id and user_id=auth.uid()) then
    raise exception 'No perteneces a esta sala.';
  end if;
  select chat_epoch into v_epoch from brava_rooms where id=p_room_id;
  return jsonb_build_object('epoch',v_epoch,'messages',coalesce((
    select jsonb_agg(jsonb_build_object('id',id,'user_id',user_id,'player_name',player_name,'kind',kind,'body',body,'created_at',created_at) order by id)
    from (select * from brava_room_chat where room_id=p_room_id and game_epoch=v_epoch and kind='message' order by id) recent
  ),'[]'::jsonb));
end; $$;

create or replace function public.brava_chat_send(p_room_id uuid,p_body text,p_kind text default 'message')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_room brava_rooms%rowtype; v_name text; v_body text:=trim(coalesce(p_body,'')); v_item brava_room_chat%rowtype;
begin
  select * into v_room from brava_rooms where id=p_room_id;
  if not found or not exists(select 1 from brava_room_players where room_id=p_room_id and user_id=auth.uid()) then raise exception 'No perteneces a esta sala.'; end if;
  if v_room.status not in ('playing','reveal') then raise exception 'El chat está disponible durante la partida.'; end if;
  if p_kind is null or p_kind not in ('message','reaction') or char_length(v_body)<1 or char_length(v_body)>240 or v_body ~ '[[:cntrl:]]' then raise exception 'Mensaje no válido (máximo 240 caracteres).'; end if;
  if p_kind='reaction' and v_body not in ('😂','🍻','💀','🤡','❤️','🔥','😭','👀','😎','🤯','🥳','🫡') then raise exception 'Reacción no válida.'; end if;
  select name into v_name from brava_room_players where room_id=p_room_id and user_id=auth.uid() for update;
  if exists(select 1 from brava_room_chat where room_id=p_room_id and user_id=auth.uid() and created_at>now()-interval '800 milliseconds') then raise exception 'Espera un momento antes de enviar otra cosa.'; end if;
  insert into brava_room_chat(room_id,game_epoch,user_id,player_name,kind,body)
    values(p_room_id,v_room.chat_epoch,auth.uid(),v_name,p_kind,v_body) returning * into v_item;
  return jsonb_build_object('id',v_item.id,'user_id',v_item.user_id,'player_name',v_item.player_name,'kind',v_item.kind,'body',v_item.body,'created_at',v_item.created_at);
end; $$;

create or replace function public.brava_chat_new_game()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if old.status='lobby' and new.status='playing' then
    new.chat_epoch:=old.chat_epoch+1;
    delete from public.brava_room_chat where room_id=new.id;
  end if;
  return new;
end; $$;
drop trigger if exists brava_chat_new_game on public.brava_rooms;
create trigger brava_chat_new_game before update of status on public.brava_rooms
for each row execute function public.brava_chat_new_game();

revoke all on function public.brava_chat_history(uuid) from public,anon;
grant execute on function public.brava_chat_history(uuid) to authenticated;
revoke all on function public.brava_chat_send(uuid,text,text) from public,anon;
grant execute on function public.brava_chat_send(uuid,text,text) to authenticated;
