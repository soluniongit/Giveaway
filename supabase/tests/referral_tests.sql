-- Tests für Einladungslink + Bonuslos (Migration 20261006120200), auf frischer DB nach Schema + Seed:
--   psql -U authenticator -d <db> -v ON_ERROR_STOP=1 -f tests/referral_tests.sql
\set QUIET on
set role service_role;
update public.campaigns set test_mode = true;
reset role;

-- Hilfsfunktion nur für den Test: Teilnahme von einer bestimmten IP, liefert den Bestätigungstoken
set role service_role;
create function pg_temp.enter(p_email text, p_ip text, p_ref text default null, p_pool text default null, p_campaign text default 'steuern-2027')
returns text language plpgsql as $$
declare r jsonb; v_tok text;
begin
  perform set_config('request.headers', jsonb_build_object('x-forwarded-for', p_ip, 'user-agent', 'ref-test')::text, false);
  r := public.submit_entry(p_campaign, 'Test', 'Person', p_email, '8000', 'ZH', true, false, p_pool,
                           case when p_ref is null then '{}'::jsonb else jsonb_build_object('ref', p_ref) end, null, null);
  assert r ->> 'status' = 'check_email', 'submit ' || p_email || ': ' || r::text;
  select (regexp_match(payload ->> 'confirm_url', 'token=([0-9a-f]+)'))[1] into v_tok
    from private.email_outbox where to_email = p_email and template_key = 'confirm_entry' order by id desc limit 1;
  return v_tok;
end $$;
create function pg_temp.bonus(p_email text, p_campaign text default 'steuern-2027') returns int language sql as $$
  select private.bonus_entries(e.id) from public.entries e join public.campaigns c on c.id = e.campaign_id
   where c.slug = p_campaign and e.email_normalized = p_email $$;

do $$
declare r jsonb; v_anna text; v_eva text; t text;
begin
  -- 1) Bestätigung liefert Einladungscode
  r := public.confirm_entry(pg_temp.enter('anna@example.ch', '203.0.113.1'));
  assert r ->> 'status' = 'confirmed', 'anna confirmed ' || r::text;
  v_anna := r ->> 'share_code';
  assert v_anna ~ '^[a-z2-9]{8}$', 'share code format ' || coalesce(v_anna, 'null');
  assert (r ->> 'bonus_entries')::int = 0 and (r ->> 'bonus_max')::int = 1, 'no bonus yet';

  -- 2) Eingeladene Person zählt erst nach ihrer Bestätigung
  t := pg_temp.enter('ben@example.ch', '203.0.113.2', v_anna);
  assert pg_temp.bonus('anna@example.ch') = 0, 'pending invite does not count';
  assert public.confirm_entry(t) ->> 'status' = 'confirmed', 'ben confirmed';
  assert pg_temp.bonus('anna@example.ch') = 1, 'confirmed invite gives bonus';
  assert pg_temp.bonus('ben@example.ch') = 0, 'invited person gets no bonus';

  -- 3) Deckel: höchstens 1 Bonuslos (doppelte Chance)
  perform public.confirm_entry(pg_temp.enter('carla@example.ch', '203.0.113.3', v_anna));
  assert pg_temp.bonus('anna@example.ch') = 1, 'bonus capped at 1';
  r := public.confirm_entry(pg_temp.enter('anna@example.ch', '203.0.113.1'));  -- erneut eintragen → nur Hinweis
  assert (select count(*) from public.entries where email_normalized = 'anna@example.ch') = 1, 'still one entry';

  -- 4) Gleicher Internetanschluss zählt nicht
  r := public.confirm_entry(pg_temp.enter('eva@example.ch', '198.51.100.20'));
  v_eva := r ->> 'share_code';
  perform public.confirm_entry(pg_temp.enter('eva.zweit@example.ch', '198.51.100.20', v_eva));
  assert pg_temp.bonus('eva@example.ch') = 0, 'same IP invite ignored';
  assert (select referred_by is not null from public.entries where email_normalized = 'eva.zweit@example.ch'), 'link still recorded';

  -- 5) Ungültige / fremde Codes werden ignoriert, Teilnahme klappt trotzdem
  perform public.confirm_entry(pg_temp.enter('fritz@example.ch', '203.0.113.6', 'DROP TABLE'));
  perform public.confirm_entry(pg_temp.enter('gina@example.ch', '203.0.113.7', 'zzzzzzzz'));
  assert (select count(*) from public.entries where email_normalized in ('fritz@example.ch', 'gina@example.ch') and referred_by is null) = 2, 'bad refs ignored';

  -- 6) Code einer anderen Kampagne zählt nicht
  t := pg_temp.enter('hugo@example.ch', '203.0.113.8', v_anna, 'a', 'fahrstart-2026');
  assert (select referred_by is null from public.entries where email_normalized = 'hugo@example.ch'), 'cross-campaign ref ignored';

  -- 7) Status-Abruf über den Bestätigungslink zeigt das Bonuslos
  select (regexp_match(payload ->> 'confirm_url', 'token=([0-9a-f]+)'))[1] into t
    from private.email_outbox where to_email = 'anna@example.ch' and template_key = 'confirm_entry' order by id limit 1;
  r := public.confirm_entry(t);
  assert r ->> 'status' = 'already_confirmed' and (r ->> 'bonus_entries')::int = 1 and r ->> 'share_code' = v_anna, 'status page ' || r::text;

  -- 8) Kampagnendaten und Inhalte
  r := public.get_campaign('steuern-2027');
  assert (r #>> '{campaign,referral_bonus_max}')::int = 1, 'bonus max exposed';
  assert r #>> '{campaign,terms_version}' = 'v2', 'terms v2';
  assert jsonb_array_length(r #> '{page,content,terms}') = 9, 'nine terms';
  assert r #>> '{page,content,terms,8,title}' = '9. Bonuslos durch Einladung', 'bonus term last';
  assert r #>> '{page,content,terms,3,text}' like '%zweiten Los%', 'draw term updated';
  assert r #>> '{page,content,faq,-1,q}' = 'Kann ich meine Gewinnchance verdoppeln?', 'faq added';
  assert public.track_event('steuern-2027', 'invite_share', '{}', '{}', 's1') and public.track_event('steuern-2027', 'referral_visit', '{}', '{}', 's1'), 'invite events allowed';
end $$;
reset role;

-- 9) Gewichtung: Schlüssel -ln(u)/w → Person mit 2 Losen liegt in 2/3 der Fälle vor Person mit 1 Los
set role service_role;
do $$
declare p double precision;
begin
  select avg(case when -ln(private.random_unit()) / 2 < -ln(private.random_unit()) / 1 then 1 else 0 end) into p
    from generate_series(1, 30000);
  assert p between 0.65 and 0.683, 'weighting off: ' || p;
  raise notice 'P(2 Lose vor 1 Los) = % (erwartet 0.667)', round(p::numeric, 4);
  assert (select min(private.random_unit()) > 0 and max(private.random_unit()) <= 1 from generate_series(1, 10000)), 'unit range';
end $$;
reset role;

-- 10) Ziehung protokolliert Lose; Anonymisierung löscht Codes
select set_config('request.jwt.claims', '{"role": "service_role"}', false);
set role service_role;
select public.admin_draw('steuern-2027', null, 3, 'Test', 'Zweite Person') as protocol \gset
do $$
declare v_entries int; v_tickets int;
begin
  select valid_entry_count, ticket_count into v_entries, v_tickets from public.draws d join public.campaigns c on c.id = d.campaign_id where c.slug = 'steuern-2027';
  assert v_tickets = v_entries + 1, format('tickets %s vs entries %s', v_tickets, v_entries);
  assert (select bonus_entries from public.entries_export where email = 'anna@example.ch') is null, 'export excludes tests';
  perform public.admin_anonymize_campaign('steuern-2027');
  assert (select count(*) from public.entries e join public.campaigns c on c.id = e.campaign_id
           where c.slug = 'steuern-2027' and e.status = 'anonymized' and e.share_code is not null) = 0, 'codes removed';
end $$;
\echo draw protocol: :protocol

-- 11) Funktion abschaltbar
update public.campaigns set referral_bonus_max = 0 where slug = 'fahrstart-2026';
do $$
declare r jsonb; v_code text;
begin
  select share_code into v_code from public.entries where email_normalized = 'hugo@example.ch';
  r := public.confirm_entry((select (regexp_match(payload ->> 'confirm_url', 'token=([0-9a-f]+)'))[1]
                               from private.email_outbox where to_email = 'hugo@example.ch' order by id desc limit 1));
  assert r ->> 'status' = 'confirmed' and not r ? 'share_code', 'no share info when disabled ' || r::text;
  perform public.confirm_entry(pg_temp.enter('ida@example.ch', '203.0.113.9', v_code, 'a', 'fahrstart-2026'));
  assert (select referred_by is null from public.entries where email_normalized = 'ida@example.ch'), 'ref ignored when disabled';
end $$;
reset role;
\echo ALL REFERRAL TESTS PASSED
