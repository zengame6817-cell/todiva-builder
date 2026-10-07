-- 既存の共有画像設定を残し、全員共通のカード登録を追加します。
begin;
create sequence if not exists public.builder_custom_card_ids start 1000000;
create table if not exists public.builder_custom_cards(
  card_id integer primary key references public.builder_card_ids(card_id),
  payload jsonb not null,
  created_at timestamptz not null default clock_timestamp()
);
create unique index if not exists builder_custom_identity on public.builder_custom_cards
  ((regexp_replace(payload->>'name','[[:space:]]','','g')),(regexp_replace(payload->>'cardName','[[:space:]]','','g')),(payload->>'rarity'));
alter table public.builder_custom_cards enable row level security;
revoke all on public.builder_custom_cards from anon,authenticated;
revoke all on sequence public.builder_custom_card_ids from anon,authenticated;
create or replace function public.builder_card_list() returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce(jsonb_agg(payload||jsonb_build_object('id',card_id) order by card_id desc),'[]'::jsonb)
  from public.builder_custom_cards;
$$;
create or replace function public.builder_card_add(p_card jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare card integer; payload jsonb; category text; skill jsonb;
begin
  if jsonb_typeof(p_card) is distinct from 'object'
    or jsonb_typeof(p_card->'name') is distinct from 'string'
    or jsonb_typeof(p_card->'cardName') is distinct from 'string'
    or length(trim(p_card->>'name')) not between 1 and 80
    or length(trim(p_card->>'cardName')) not between 1 and 120
    or coalesce(p_card->>'rarity','') not in ('SSR','SR','R')
    or coalesce(p_card->>'attribute','') not in ('緑','赤','青')
    or jsonb_typeof(p_card->'image') is distinct from 'string'
    or length(p_card->>'image')>250000
    or (p_card->>'image') !~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+=*$'
    then raise exception 'invalid_card'; end if;
  foreach category in array array['passive','active','unique'] loop
    if jsonb_typeof(p_card->'skillDetails'->category) is distinct from 'array' then raise exception 'invalid_skills'; end if;
    if jsonb_array_length(p_card->'skillDetails'->category)>12 then raise exception 'invalid_skills'; end if;
    for skill in select * from jsonb_array_elements(p_card->'skillDetails'->category) loop
      if jsonb_typeof(skill->'name') is distinct from 'string' or length(trim(skill->>'name')) not between 1 and 100
        or jsonb_typeof(skill->'description') is distinct from 'string' or length(skill->>'description')>2000
        then raise exception 'invalid_skill'; end if;
    end loop;
  end loop;
  perform pg_advisory_xact_lock(842168);
  if exists(select 1 from public.builder_custom_cards where created_at>clock_timestamp()-interval '5 seconds')
    or (select count(*) from public.builder_custom_cards)>=5000 then raise exception 'rate_limit'; end if;
  payload=jsonb_build_object('name',trim(p_card->>'name'),'cardName',trim(p_card->>'cardName'),
    'rarity',p_card->>'rarity','attribute',p_card->>'attribute','image',p_card->>'image','skillDetails',p_card->'skillDetails');
  card=nextval('public.builder_custom_card_ids');
  insert into public.builder_card_ids(card_id) values(card);
  insert into public.builder_custom_cards(card_id,payload) values(card,payload);
  return payload||jsonb_build_object('id',card);
exception when unique_violation then raise exception 'duplicate_card';
end $$;
revoke all on function public.builder_card_list(),public.builder_card_add(jsonb) from public;
grant execute on function public.builder_card_list(),public.builder_card_add(jsonb) to anon,authenticated;
commit;
