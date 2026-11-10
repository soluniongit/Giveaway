-- Tests für die SMS-Bestätigung (Migration 20261110120000), auf frischer DB nach allen Migrationen:
--   psql -U authenticator -d <db> -v ON_ERROR_STOP=1 -f tests/sms_tests.sql
\set QUIET on
set role service_role;
update public.campaigns set test_mode = true where slug in ('ps5-gta6-2026', 'steuern-2027', 'buergenstock-2026');

-- Teilnahme als anon (wie aus dem Browser), mit IP aus der E-Mail abgeleitet
create function pg_temp.enter(p_campaign text, p_email text, p_phone text, p_token text, p_birth date default (now()::date - interval '30 years')::date)
returns jsonb language plpgsql security invoker as $$
begin
  perform set_config('request.headers', jsonb_build_object('x-forwarded-for', '203.0.113.' || (length(p_email) % 200), 'user-agent', 'sms-test')::text, false);
  return public.submit_entry(p_campaign, 'Test', 'Person', p_email, '6000', null, true, false, null, '{}'::jsonb, null, null, null, p_phone, p_birth, p_token);
end $$;
grant execute on function pg_temp.enter(text, text, text, text, date) to anon;
-- Token wie die Edge Function nach «approved» von Twilio
create function pg_temp.approve(p_campaign text, p_phone text) returns text language sql as $$
  select public.sms_verify_approved(p_campaign, p_phone) ->> 'token' $$;
reset role;

-- 1) anon darf die SMS-Funktionen nicht aufrufen (nur Edge Function mit service_role)
set role anon;
do $$
begin
  begin
    perform public.sms_verify_start('ps5-gta6-2026', '079 123 45 67', '1.2.3.4');
    raise exception 'anon could call sms_verify_start';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.sms_verify_approved('ps5-gta6-2026', '079 123 45 67');
    raise exception 'anon could call sms_verify_approved';
  exception when insufficient_privilege then null;
  end;
end $$;
-- get_campaign meldet die Pflicht
do $$
begin
  assert (public.get_campaign('ps5-gta6-2026') -> 'campaign' ->> 'requires_phone_verification')::boolean, 'flag in get_campaign';
  assert (public.get_campaign('steuern-2027') -> 'campaign' ->> 'collect_contact_details')::boolean, 'contact flag in get_campaign';
end $$;
reset role;

-- 2) sms_verify_start: Validierung, nur Schweizer Handynummern, Rate-Limits
set role service_role;
do $$
declare r jsonb; i int;
begin
  r := public.sms_verify_start('gibts-nicht', '079 123 45 67', '1.1.1.1');
  assert r ->> 'error' = 'not_found', 'unknown campaign ' || r::text;
  r := public.sms_verify_start('ps5-gta6-2026', '079 12', '1.1.1.1');
  assert r ->> 'error' = 'invalid_phone', 'short ' || r::text;
  r := public.sms_verify_start('ps5-gta6-2026', '044 687 55 44', '1.1.1.1');
  assert r ->> 'error' = 'phone_not_mobile', 'landline ' || r::text;
  r := public.sms_verify_start('ps5-gta6-2026', '+49 151 23456789', '1.1.1.1');
  assert r ->> 'error' = 'phone_not_mobile', 'foreign ' || r::text;
  r := public.sms_verify_start('ps5-gta6-2026', '0041 (0)79 111 22 33', '1.1.1.1');
  assert r ->> 'ok' = 'true' and r ->> 'phone' = '+41791112233', 'normalized ' || r::text;
  -- Nummern nur gehasht gespeichert
  assert not exists (select 1 from private.sms_sends where phone_hash like '%791112233%'), 'phone stored in clear';

  -- pro Nummer max. 3 Codes in 15 Minuten
  r := public.sms_verify_start('ps5-gta6-2026', '079 111 22 33', '1.1.1.2');
  r := public.sms_verify_start('ps5-gta6-2026', '079 111 22 33', '1.1.1.3');
  assert r ->> 'ok' = 'true', '3rd send ok ' || r::text;
  r := public.sms_verify_start('ps5-gta6-2026', '079 111 22 33', '1.1.1.4');
  assert r ->> 'error' = 'rate_limited', '4th send per phone ' || r::text;
  -- gleiche Nummer, anderes Gewinnspiel: eigenes Kontingent
  r := public.sms_verify_start('buergenstock-2026', '079 111 22 33', '1.1.1.5');
  assert r ->> 'ok' = 'true', 'other campaign ' || r::text;

  -- pro IP max. 10 Codes pro Stunde
  for i in 1..10 loop
    r := public.sms_verify_start('steuern-2027', '078 200 00 ' || lpad(i::text, 2, '0'), '9.9.9.9');
    assert r ->> 'ok' = 'true', 'ip send ' || i || ' ' || r::text;
  end loop;
  r := public.sms_verify_start('steuern-2027', '078 200 00 99', '9.9.9.9');
  assert r ->> 'error' = 'rate_limited', '11th send per ip ' || r::text;
end $$;

-- abgelaufene / geschlossene Gewinnspiele senden keine Codes
insert into public.campaigns (slug, kind, status, test_mode, title, public_url, confirm_url, starts_at, ends_at, allowed_cantons, terms_version, requires_phone_verification)
values ('sms-zu', 'giveaway', 'published', false, 'Zu', 'https://example.ch/', 'https://example.ch/b/', now() - interval '10 days', now() - interval '1 day', '{}', 't1', true),
       ('sms-aus', 'giveaway', 'published', false, 'Ohne SMS', 'https://example.ch/', 'https://example.ch/b/', now() - interval '1 day', now() + interval '10 days', '{}', 't1', false);
do $$
begin
  assert public.sms_verify_start('sms-zu', '079 123 45 67', '2.2.2.2') ->> 'error' = 'closed', 'closed campaign';
  assert public.sms_verify_start('sms-aus', '079 123 45 67', '2.2.2.2') ->> 'error' = 'not_found', 'campaign without sms';
end $$;
reset role;

-- 3) submit_entry: nur mit gültigem Token für genau diese Nummer
set role service_role;
create temp table toks (k text primary key, t text);
grant all on toks to anon;
insert into toks values
  ('lea', pg_temp.approve('ps5-gta6-2026', '079 555 11 22')),
  ('lea_reuse', null),
  ('nora', pg_temp.approve('ps5-gta6-2026', '079 555 33 44')),
  ('fremd', pg_temp.approve('buergenstock-2026', '079 555 66 77')),
  ('alt', pg_temp.approve('ps5-gta6-2026', '079 555 88 99')),
  ('dieb', pg_temp.approve('ps5-gta6-2026', '079 555 11 22')),
  ('lea2', pg_temp.approve('ps5-gta6-2026', '079 555 11 22')),
  ('steuer', pg_temp.approve('steuern-2027', '076 123 45 67'));
update private.phone_verifications set token_expires_at = now() - interval '1 minute'
 where token_hash = extensions.digest((select t from toks where k = 'alt'), 'sha256');
reset role;

set role anon;
do $$
declare r jsonb; tk text;
begin
  -- ohne Token
  r := pg_temp.enter('ps5-gta6-2026', 'lea@example.ch', '079 555 11 22', null);
  assert r ->> 'error' = 'phone_not_verified', 'no token ' || r::text;
  -- falscher Token
  r := pg_temp.enter('ps5-gta6-2026', 'lea@example.ch', '079 555 11 22', 'deadbeef');
  assert r ->> 'error' = 'phone_not_verified', 'bad token ' || r::text;
  -- Token einer anderen Nummer
  r := pg_temp.enter('ps5-gta6-2026', 'lea@example.ch', '079 555 11 22', (select t from toks where k = 'nora'));
  assert r ->> 'error' = 'phone_not_verified', 'token of other phone ' || r::text;
  -- Token eines anderen Gewinnspiels
  r := pg_temp.enter('ps5-gta6-2026', 'lea@example.ch', '079 555 66 77', (select t from toks where k = 'fremd'));
  assert r ->> 'error' = 'phone_not_verified', 'token of other campaign ' || r::text;
  -- abgelaufener Token
  r := pg_temp.enter('ps5-gta6-2026', 'max@example.ch', '079 555 88 99', (select t from toks where k = 'alt'));
  assert r ->> 'error' = 'phone_not_verified', 'expired token ' || r::text;
  -- Telefon fehlt → invalid_phone (vor der Token-Prüfung)
  r := pg_temp.enter('ps5-gta6-2026', 'lea@example.ch', null, (select t from toks where k = 'lea'));
  assert r ->> 'error' = 'invalid_phone', 'phone required ' || r::text;

  -- gültig (Schreibweise der Nummer egal)
  r := pg_temp.enter('ps5-gta6-2026', 'lea@example.ch', '+41 79 555 11 22', (select t from toks where k = 'lea'));
  assert r ->> 'status' = 'check_email', 'valid ' || r::text;
  -- Token ist verbraucht
  r := pg_temp.enter('ps5-gta6-2026', 'lea@example.ch', '079 555 11 22', (select t from toks where k = 'lea'));
  assert r ->> 'error' = 'phone_not_verified', 'token reuse ' || r::text;
  -- gleiche Nummer, andere E-Mail → phone_in_use (Token bleibt unverbraucht)
  r := pg_temp.enter('ps5-gta6-2026', 'zweitmail@example.ch', '079 555 11 22', (select t from toks where k = 'dieb'));
  assert r ->> 'error' = 'phone_in_use', 'phone in use ' || r::text;
  -- gleiche Person schickt erneut ab (neuer Code) → ok
  r := pg_temp.enter('ps5-gta6-2026', 'lea@example.ch', '079 555 11 22', (select t from toks where k = 'lea2'));
  assert r ->> 'status' = 'check_email', 'resubmit same person ' || r::text;

  -- Steuern: Geburtsdatum bleibt Pflicht, Token wird erst bei gültigen Angaben verbraucht
  r := pg_temp.enter('steuern-2027', 'sara@example.ch', '076 123 45 67', (select t from toks where k = 'steuer'), null);
  assert r ->> 'error' = 'invalid_birth_date', 'birth date still required ' || r::text;
  r := pg_temp.enter('steuern-2027', 'sara@example.ch', '076 123 45 67', (select t from toks where k = 'steuer'));
  assert r ->> 'status' = 'check_email', 'steuern valid ' || r::text;
end $$;
reset role;

set role service_role;
do $$
begin
  assert (select phone_verified_at is not null and phone = '+41795551122' from public.entries where email_normalized = 'lea@example.ch'), 'lea verified';
  assert (select phone_verified_at is not null from public.entries where email_normalized = 'sara@example.ch'), 'sara verified';
  assert not exists (select 1 from public.entries where email_normalized in ('max@example.ch', 'zweitmail@example.ch')), 'no entries for rejected';
  assert (select used_at is null from private.phone_verifications where token_hash = extensions.digest((select t from toks where k = 'dieb'), 'sha256')), 'phone_in_use does not consume';
  -- Bestätigungsmail (Double-Opt-in) bleibt zusätzlich bestehen
  assert (select count(*) from private.email_outbox where to_email = 'lea@example.ch' and template_key = 'confirm_entry') >= 1, 'confirm mail queued';
end $$;
reset role;

\echo ALL SMS TESTS PASSED
