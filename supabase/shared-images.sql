-- Supabase SQL Editorで一度実行します。共有画像のみを公開します。
begin;
create table if not exists public.builder_card_ids(card_id integer primary key);
create table if not exists public.builder_image_revisions(
  revision bigint generated always as identity primary key,
  card_id integer not null references public.builder_card_ids(card_id),
  settings jsonb not null,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists builder_image_card_revision on public.builder_image_revisions(card_id,revision desc);
alter table public.builder_card_ids enable row level security;
alter table public.builder_image_revisions enable row level security;
revoke all on public.builder_card_ids, public.builder_image_revisions from anon, authenticated;
revoke all on sequence public.builder_image_revisions_revision_seq from anon, authenticated;

create or replace function public.builder_image_current() returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from
  (select distinct on(card_id) card_id,revision,settings,created_at
   from public.builder_image_revisions order by card_id,revision desc) r;
$$;

create or replace function public.builder_image_save(p_card_id integer,p_settings jsonb,p_expected_revision bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare latest public.builder_image_revisions; result public.builder_image_revisions;
begin
  if not exists(select 1 from public.builder_card_ids where card_id=p_card_id) then raise exception 'unknown_card'; end if;
  if jsonb_typeof(p_settings)<>'object' or jsonb_typeof(p_settings->'zoom') is distinct from 'number'
     or jsonb_typeof(p_settings->'x') is distinct from 'number' or jsonb_typeof(p_settings->'y') is distinct from 'number'
     or (p_settings->>'zoom')::numeric not between 0.5 and 3
     or abs((p_settings->>'x')::numeric)>100 or abs((p_settings->>'y')::numeric)>100
     or (p_settings - 'zoom' - 'x' - 'y' - 'src') <> '{}'::jsonb
     then raise exception 'invalid_settings'; end if;
  if p_settings ? 'src' and (jsonb_typeof(p_settings->'src')<>'string'
     or length(p_settings->>'src')>250000 or (p_settings->>'src') !~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+=*$')
     then raise exception 'invalid_image'; end if;
  -- 同時編集の衝突と連続投稿をサーバー側で処理します。
  perform pg_advisory_xact_lock(842167);
  select * into latest from public.builder_image_revisions where card_id=p_card_id order by revision desc limit 1;
  if p_expected_revision is null or p_expected_revision<>coalesce(latest.revision,0) then raise exception 'revision_conflict'; end if;
  if latest.created_at>clock_timestamp()-interval '3 seconds'
     or (select count(*) from public.builder_image_revisions where created_at>clock_timestamp()-interval '10 seconds')>=20
     then raise exception 'rate_limit'; end if;
  insert into public.builder_image_revisions(card_id,settings) values(p_card_id,p_settings) returning * into result;
  -- 最新30件を保持。最新設定も履歴から取得します。
  delete from public.builder_image_revisions where card_id=p_card_id and revision not in
    (select revision from public.builder_image_revisions where card_id=p_card_id order by revision desc limit 30);
  return to_jsonb(result);
end $$;

create or replace function public.builder_image_history(p_card_id integer) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from
    (select revision,created_at from public.builder_image_revisions where card_id=p_card_id order by revision desc limit 30) r;
$$;
create or replace function public.builder_image_restore(p_card_id integer,p_revision bigint,p_expected_revision bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare value jsonb;
begin
  select settings into value from public.builder_image_revisions where card_id=p_card_id and revision=p_revision;
  if value is null then raise exception 'missing_revision'; end if;
  return public.builder_image_save(p_card_id,value,p_expected_revision);
end $$;

revoke all on function public.builder_image_current(),public.builder_image_save(integer,jsonb,bigint),
  public.builder_image_history(integer),public.builder_image_restore(integer,bigint,bigint) from public;
grant execute on function public.builder_image_current(),public.builder_image_save(integer,jsonb,bigint),
  public.builder_image_history(integer),public.builder_image_restore(integer,bigint,bigint) to anon,authenticated;
insert into public.builder_card_ids(card_id) values (100061),(100060),(100059),(100058),(100057),(100056),(100055),(100054),(100053),(100052),(100051),(100050),(100049),(100048),(100047),(100046),(100045),(100044),(100043),(100042),(100041),(100040),(100039),(100038),(100037),(100036),(100035),(100034),(100033),(100032),(100031),(100030),(100029),(100028),(100027),(100026),(100025),(100024),(100023),(100022),(100021),(100020),(100019),(100018),(100017),(100016),(100015),(100014),(100013),(100012),(100011),(100010),(100009),(100008),(100007),(100006),(100005),(100004),(100003),(100002),(100001),(100000),(537),(535),(533),(531),(529),(527),(525),(523),(521),(519),(517),(515),(513),(511),(509),(507),(505),(503),(500),(498),(496),(494),(492),(490),(488),(486),(484),(482),(480),(477),(475),(473),(471),(469),(467),(465),(463),(460),(458),(456),(454),(452),(450),(448),(446),(444),(441),(439),(437),(435),(433),(431),(429),(426),(424),(422),(420),(418),(416),(414),(411),(409),(407),(405),(403),(401),(399),(397),(394),(392),(390),(388),(386),(384),(382),(380),(377),(375),(373),(371),(369),(367),(365),(362),(360),(358),(356),(354),(352),(350),(348),(346),(343),(341),(339),(337),(335),(333),(331),(328),(326),(324),(322),(319),(317),(315),(313),(309),(307),(305),(303),(301),(299),(297),(295),(293),(291),(287),(285),(283),(281),(279),(277),(275),(273),(271),(269),(267),(265),(263),(258),(256),(254),(252),(250),(248),(246),(244),(242),(237),(235),(233),(231),(229),(224),(222),(220),(218),(216),(214),(209),(207),(203),(201),(199),(197),(195),(191),(187),(185),(183),(181),(177),(175),(173),(171),(169),(167),(165),(161),(159),(157),(155),(153),(151),(149),(147),(145),(143),(141),(137),(135),(133),(131),(129),(127),(125),(123),(121),(119),(117),(115),(113),(111),(109),(107),(105),(103),(101),(99),(97),(95),(93),(91),(89),(87),(85),(83),(81),(79),(77),(75),(73),(71),(69),(67),(65),(63),(61),(59),(57),(55),(53),(51),(49),(47),(45),(43),(41),(39),(37),(35),(33),(31) on conflict do nothing;
commit;
