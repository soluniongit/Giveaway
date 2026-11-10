-- Tests für Telefon/Geburtsdatum und «Termin wahrgenommen» (Migrationen 20261103120000 + …0100),
-- auf frischer DB nach Schema + Seed:
--   psql -U authenticator -d <db> -v ON_ERROR_STOP=1 -f tests/termin_tests.sql
\set QUIET on
set role service_role;
update public.campaigns set test_mode = true where slug in ('steuern-2027', 'buergenstock-2026');
update public.campaigns set requires_phone_verification = false;  -- SMS-Bestätigung eigene Tests (sms_tests.sql)

create function pg_temp.enter(p_campaign text, p_email text, p_phone text, p_birth date)
returns jsonb language plpgsql as $$
begin
  perform set_config('request.headers', jsonb_build_object('x-forwarded-for', '198.51.100.' || (length(p_email) % 200), 'user-agent', 'termin-test')::text, false);
  return public.submit_entry(p_campaign, 'Test', 'Person', p_email, '8834', null, true, false, null, '{}'::jsonb, null, null, null, p_phone, p_birth);
end $$;
create function pg_temp.token(p_email text) returns text language sql as $$
  select (regexp_match(payload ->> 'confirm_url', 'token=([0-9a-f]+)'))[1]
    from private.email_outbox where to_email = p_email and template_key = 'confirm_entry' order by id desc limit 1 $$;

do $$
declare r jsonb; adult date := (now()::date - interval '30 years')::date;
begin
  -- Pflichtfelder bei collect_contact_details
  r := pg_temp.enter('steuern-2027', 'ohne@example.ch', null, adult);
  assert r ->> 'error' = 'invalid_phone', 'phone required ' || r::text;
  r := pg_temp.enter('steuern-2027', 'kurz@example.ch', '079 12', adult);
  assert r ->> 'error' = 'invalid_phone', 'phone too short ' || r::text;
  r := pg_temp.enter('steuern-2027', 'gebdat@example.ch', '079 123 45 67', null);
  assert r ->> 'error' = 'invalid_birth_date', 'birth date required ' || r::text;
  r := pg_temp.enter('steuern-2027', 'jung@example.ch', '079 123 45 67', (now()::date - interval '17 years')::date);
  assert r ->> 'error' = 'too_young', 'under 18 ' || r::text;
  r := pg_temp.enter('steuern-2027', 'zukunft@example.ch', '079 123 45 67', (now()::date + 1));
  assert r ->> 'error' = 'invalid_birth_date', 'future birth date ' || r::text;

  -- gültig: Telefon wird auf +41… normalisiert (079…, 0041…, +41 …)
  r := pg_temp.enter('steuern-2027', 'mia@example.ch', '079 123 45 67', adult);
  assert r ->> 'status' = 'check_email', 'mia ' || r::text;
  r := pg_temp.enter('steuern-2027', 'tom@example.ch', '0041 78 765 43 21', adult);
  assert r ->> 'status' = 'check_email', 'tom ' || r::text;
  r := pg_temp.enter('steuern-2027', 'ines@example.ch', '+41 (0)44-687 55 44', adult);
  assert r ->> 'status' = 'check_email', 'ines ' || r::text;
  assert (select phone from public.entries where email_normalized = 'ines@example.ch') = '+41446875544', 'normalized (0)';
  r := pg_temp.enter('steuern-2027', 'lang@example.ch', '079 123 45 678', adult);
  assert r ->> 'error' = 'invalid_phone', 'swiss number too long ' || r::text;
  r := pg_temp.enter('steuern-2027', 'de@example.ch', '+49 30 1234567', adult);
  assert r ->> 'status' = 'check_email', 'foreign number ok ' || r::text;
  assert (select phone from public.entries where email_normalized = 'mia@example.ch') = '+41791234567', 'normalized 079';
  assert (select phone from public.entries where email_normalized = 'tom@example.ch') = '+41787654321', 'normalized 0041';
  assert (select birth_date from public.entries where email_normalized = 'mia@example.ch') = adult, 'birth date stored';

  -- PS5 (ohne collect_contact_details): Telefon wird ignoriert, alte Aufrufe ohne Telefon funktionieren
  update public.campaigns set test_mode = true where slug = 'ps5-gta6-2026';
  r := public.submit_entry('ps5-gta6-2026', 'Alt', 'Aufruf', 'alt@example.ch', '8000', null, true, false, null, '{}', null, null);
  assert r ->> 'status' = 'check_email', 'legacy call ' || r::text;
  assert (select phone from public.entries where email_normalized = 'alt@example.ch') is null, 'no phone stored for ps5';

  -- Bürgenstock: gleiche Pflichtfelder
  r := pg_temp.enter('buergenstock-2026', 'lea@example.ch', '076 555 44 33', adult);
  assert r ->> 'status' = 'check_email', 'buergenstock ' || r::text;

  -- bestätigen
  perform public.confirm_entry(pg_temp.token(e)) from unnest(array['mia@example.ch', 'tom@example.ch', 'ines@example.ch', 'lea@example.ch']) e;
  assert (select count(*) from public.entries where status = 'confirmed' and email_normalized in ('mia@example.ch', 'tom@example.ch', 'ines@example.ch')) = 3, 'confirmed';
end $$;
reset role;

-- Termin wahrnehmen + Ziehung nur mit Termin
select set_config('request.jwt.claims', '{"role": "service_role"}', false);
set role service_role;
do $$
declare r jsonb; v_draw jsonb; v_winner uuid;
begin
  r := public.admin_mark_appointment('steuern-2027', 'MIA@example.ch ');
  assert r ->> 'ok' = 'true', 'mark mia ' || r::text;
  r := public.admin_mark_appointment('steuern-2027', 'niemand@example.ch');
  assert r ->> 'error' = 'not_found', 'unknown email';
  r := public.admin_mark_appointment('steuern-2027', 'tom@example.ch', true, 'Videocall');
  r := public.admin_mark_appointment('steuern-2027', 'tom@example.ch', false);
  assert (select appointment_attended_at from public.entries where email_normalized = 'tom@example.ch') is null, 'unmark tom';
  assert (select appointment_note from public.entries where email_normalized = 'tom@example.ch') = 'Videocall', 'note kept';

  v_draw := public.admin_draw('steuern-2027', null, 3, 'Test', 'Zweite Person');
  assert (v_draw -> 'pools' -> 0 ->> 'valid_entries')::int = 1, 'only attended entries count ' || v_draw::text;
  v_winner := (v_draw -> 'pools' -> 0 -> 'selected' -> 0 ->> 'entry_id')::uuid;
  assert (select email_normalized from public.entries where id = v_winner) = 'mia@example.ch', 'winner attended';
  assert jsonb_array_length(v_draw -> 'pools' -> 0 -> 'selected') = 1, 'no reserves without appointment';
  assert (select method from public.draws d join public.campaigns c on c.id = d.campaign_id where c.slug = 'steuern-2027') like 'Nur Teilnahmen mit wahrgenommenem Termin.%', 'method notes appointment';

  -- Anonymisierung löscht Telefon und Geburtsdatum (ausser bei der Gewinnperson)
  perform public.admin_anonymize_campaign('steuern-2027');
  assert (select count(*) from public.entries e join public.campaigns c on c.id = e.campaign_id
           where c.slug = 'steuern-2027' and e.status = 'anonymized' and (e.phone is not null or e.birth_date is not null)) = 0, 'contact details removed';
  assert (select phone from public.entries where id = v_winner) = '+41791234567', 'winner kept';
end $$;
reset role;

-- anon darf Termine nicht markieren
set role anon;
do $$
begin
  begin
    perform public.admin_mark_appointment('steuern-2027', 'mia@example.ch');
    assert false, 'anon must not mark';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

\echo ALL TERMIN TESTS PASSED
