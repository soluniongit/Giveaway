-- Smoke tests for the public RPCs, run as the PostgREST "authenticator" login:
--   psql -U authenticator -d <db> -v ON_ERROR_STOP=1 -f tests/rpc_tests.sql
-- Each block raises an exception if an expectation fails.
\set QUIET on
select set_config('request.headers', '{"x-forwarded-for": "203.0.113.7, 10.0.0.1", "user-agent": "rpc-test"}', false);

-- 1) Draft campaigns are invisible, tables are closed for anon
set role anon;
do $$ begin
  assert (public.get_campaign('ps5-gta6-2026') ->> 'ok')::boolean = false, 'draft must be hidden';
  begin
    perform 1 from public.entries limit 1;
    raise exception 'anon could read entries';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.admin_draw('ps5-gta6-2026');
    raise exception 'anon could call admin_draw';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- enable test mode (as service_role, the platform's trusted key)
set role service_role;
update public.campaigns set test_mode = true;
reset role;

-- 2) Giveaway: submit, validation (ganze Schweiz, Instagram optional), duplicates, honeypot, confirmation
set role anon;
do $$
declare r jsonb;
begin
  r := public.get_campaign('ps5-gta6-2026');
  assert (r ->> 'ok')::boolean, 'test-mode campaign visible';
  assert r -> 'campaign' ->> 'ends_at_label' = '18.11.2026, 23:59 Uhr', 'ends label ' || (r -> 'campaign' ->> 'ends_at_label');
  assert jsonb_array_length(r -> 'campaign' -> 'allowed_cantons') = 0, 'whole Switzerland';
  assert jsonb_array_length(r -> 'pools') = 1, 'one pool';
  assert r #>> '{pools,0,short_title}' = 'PS5 Pro + GTA VI', 'prize';
  assert r #>> '{page,content,form,submit}' = 'Kostenlos teilnehmen', 'page content';

  r := public.submit_entry('ps5-gta6-2026', 'Lea', 'Muster', 'lea@example.ch', '8834', null, true, true,
                           null, '{"utm_source":"instagram","utm_medium":"organic","utm_campaign":"ps5_gta6"}', now() - interval '20 seconds', '', '@Lea.Muster');
  assert r ->> 'status' = 'check_email', 'submit ok: ' || r::text;

  r := public.submit_entry('ps5-gta6-2026', 'Lea', 'Muster', 'LEA@example.ch ', '8834', null, true, false, null, '{}', null, null, 'lea.muster');
  assert r ->> 'status' = 'check_email', 'duplicate answers identically';

  r := public.submit_entry('ps5-gta6-2026', 'Max', 'Muster', 'max@example', '3000', null, true, false, null, '{}', null, null);
  assert r ->> 'error' = 'invalid_email', 'invalid email';
  r := public.submit_entry('ps5-gta6-2026', 'Max', 'Muster', 'max@example.ch', '80', null, true, false, null, '{}', null, null);
  assert r ->> 'error' = 'invalid_postal_code', 'plz';
  r := public.submit_entry('ps5-gta6-2026', 'Max', 'Muster', 'max@example.ch', '3000', null, true, false, null, '{}', null, null, 'max muster!');
  assert r ->> 'error' = 'invalid_instagram', 'instagram format';
  r := public.submit_entry('ps5-gta6-2026', 'Max', 'Muster', 'max@example.ch', '3000', null, false, false, null, '{}', null, null);
  assert r ->> 'error' = 'consent_required', 'consent';
  r := public.submit_entry('ps5-gta6-2026', 'Max', 'Muster', 'max@example.ch', '3000', null, true, false, null, '{}', now(), null);
  assert r ->> 'error' = 'too_fast', 'bot brake';
  r := public.submit_entry('ps5-gta6-2026', 'Bot', 'Bot', 'bot@example.ch', '8000', null, true, false, null, '{}', null, 'http://spam');
  assert r ->> 'status' = 'check_email', 'honeypot answers like success';
  -- Bern, Genf, Tessin: ganze Schweiz zugelassen, Kanton optional
  r := public.submit_entry('ps5-gta6-2026', 'Max', 'Muster', 'max@example.ch', '3000', 'BE', true, false, null, '{}', null, null);
  assert r ->> 'status' = 'check_email', 'any canton ok: ' || r::text;
  r := public.submit_entry('ps5-gta6-2026', 'Lia', 'Rossi', 'lia@example.ch', '6900', null, true, false, null, '{}', null, null, '');
  assert r ->> 'status' = 'check_email', 'empty instagram ok: ' || r::text;

  assert (public.confirm_entry('nonsense') ->> 'error') = 'invalid_token', 'bad token';
  assert public.track_event('ps5-gta6-2026', 'instagram_embed_load', '{}', '{}', 'sess-1'), 'event stored';
  assert public.track_event('ps5-gta6-2026', 'instagram_click', '{}', '{}', 'sess-1'), 'instagram click stored';
  assert not public.track_event('ps5-gta6-2026', 'drop_table', '{}', '{}', null), 'unknown event rejected';
end $$;
reset role;

-- fetch the confirmation link like the mail sender would
set role service_role;
select (regexp_match(payload ->> 'confirm_url', 'token=([0-9a-f]+)'))[1] as token
  from private.email_outbox where to_email = 'lea@example.ch' and template_key = 'confirm_entry'
 order by id desc limit 1 \gset
do $$ begin
  assert (select count(*) from private.email_outbox where to_email = 'lea@example.ch') = 1, 'throttled resend';
  assert not exists (select 1 from public.entries where email_normalized = 'bot@example.ch'), 'honeypot stored nothing';
  assert (select utm_source from public.entries where email_normalized = 'lea@example.ch') = 'instagram', 'utm stored';
  assert (select instagram_handle from public.entries where email_normalized = 'lea@example.ch') = 'lea.muster', 'instagram normalized';
  assert (select instagram_handle is null from public.entries where email_normalized = 'lia@example.ch'), 'empty instagram → null';
  assert (select canton from public.entries where email_normalized = 'max@example.ch') = 'BE', 'canton kept when given';
  assert (select ip_hash is not null and user_agent = 'rpc-test' from public.entries where email_normalized = 'lea@example.ch'), 'request meta';
  assert (select payload ->> 'confirm_url' from private.email_outbox where to_email = 'lea@example.ch') like 'https://gewinnspiel.allnova.ch/bestaetigen/?token=%', 'confirm url';
end $$;
reset role;

set role anon;
select public.confirm_entry(:'token') as confirm1 \gset
select public.confirm_entry(:'token') as confirm2 \gset
reset role;
\echo confirm1: :confirm1
\echo confirm2: :confirm2

set role service_role;
do $$ begin
  assert (select status from public.entries where email_normalized = 'lea@example.ch') = 'confirmed', 'entry confirmed';
  assert (select count(*) from public.marketing_consents where email = 'lea@example.ch') = 0, 'latest submission (no opt-in) wins';
end $$;
reset role;

-- 3) Rate limit per IP, opt-in for the winner test
set role anon;
do $$
declare r jsonb; i int;
begin
  r := public.submit_entry('ps5-gta6-2026', 'Noah', 'Beispiel', 'noah@example.ch', '8640', null, true, true, null, '{}', null, null, 'noah_b');
  assert r ->> 'status' = 'check_email', 'noah submit';

  perform set_config('request.headers', '{"x-forwarded-for": "198.51.100.9"}', false);
  for i in 1..10 loop
    r := public.submit_entry('ps5-gta6-2026', 'Spam', 'Test', 'spam' || i || '@example.ch', '8000', null, true, false, null, '{}', null, null);
  end loop;
  r := public.submit_entry('ps5-gta6-2026', 'Spam', 'Test', 'spam11@example.ch', '8000', null, true, false, null, '{}', null, null);
  assert r ->> 'error' = 'rate_limited', 'rate limit after 10/h per IP: ' || r::text;
end $$;
reset role;

set role service_role;
select (regexp_match(payload ->> 'confirm_url', 'token=([0-9a-f]+)'))[1] as token2
  from private.email_outbox where to_email = 'noah@example.ch' order by id desc limit 1 \gset
reset role;
set role anon;
select public.confirm_entry(:'token2') ->> 'status' as s2 \gset
reset role;
\echo noah confirm: :s2

-- 4) Admin functions: authenticated non-admin is refused, service_role may draw in test mode
set role authenticated;
do $$ begin
  begin
    perform public.admin_draw('ps5-gta6-2026');
    raise exception 'non-admin could draw';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select set_config('request.jwt.claims', '{"role": "service_role"}', false);
set role service_role;
select jsonb_pretty(public.admin_draw('ps5-gta6-2026', 'hauptpreis', 1, 'Test-Ziehung', 'Zweite Person')) as protocol \gset
do $$
declare v_winner text;
begin
  assert (select count(*) from public.draw_results r join public.draws d on d.id = r.draw_id
           join public.prize_pools p on p.id = d.pool_id where p.key = 'hauptpreis' and r.role = 'winner') = 1, 'one winner';
  select e.email_normalized into v_winner from public.draw_results r join public.entries e on e.id = r.entry_id where r.role = 'winner';
  assert v_winner in ('lea@example.ch', 'noah@example.ch'), 'winner is a confirmed entry: ' || coalesce(v_winner, 'null');
  begin
    perform public.admin_draw('ps5-gta6-2026', 'hauptpreis');
    raise exception 'double draw allowed';
  exception when raise_exception then
    if sqlerrm = 'double draw allowed' then raise; end if;
  end;
end $$;
select public.admin_anonymize_campaign('ps5-gta6-2026') as anonymized \gset
do $$ begin
  assert (select count(*) from public.entries e join public.campaigns c on c.id = e.campaign_id
           where c.slug = 'ps5-gta6-2026' and e.status = 'anonymized') >= 10, 'non-winners anonymized';
  assert (select count(*) from public.entries e join public.draw_results r on r.entry_id = e.id
           where r.role = 'winner' and e.email is not null) = 1, 'winner kept';
  assert (select count(*) from public.entries where status = 'anonymized' and instagram_handle is not null) = 0, 'instagram removed';
  assert (select count(*) from public.marketing_consents where email = 'noah@example.ch') = 1, 'consent kept separately';
end $$;
reset role;
\echo draw protocol: :protocol
\echo anonymized: :anonymized

-- 5) Published + closed campaign refuses entries
set role service_role;
update public.campaigns set test_mode = false, status = 'published', starts_at = now() - interval '30 days', ends_at = now() - interval '1 day' where slug = 'ps5-gta6-2026';
reset role;
set role anon;
do $$ begin
  assert public.submit_entry('ps5-gta6-2026', 'Spät', 'Dran', 'late@example.ch', '6300', null, true, false, null, '{}', null, null) ->> 'error' = 'closed', 'closed campaign';
  assert public.get_campaign('ps5-gta6-2026') ->> 'phase' = 'closed', 'phase closed';
end $$;
reset role;
\echo ALL RPC TESTS PASSED
