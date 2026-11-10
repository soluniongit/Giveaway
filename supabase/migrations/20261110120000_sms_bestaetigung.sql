-- =====================================================================
-- SMS-Bestätigung der Telefonnummer (Twilio Verify) für alle Gewinnspiele.
--
--  Ablauf:
--   1. Formular: «Code per SMS senden» → Edge Function sms-verify (action start)
--      → public.sms_verify_start (Prüfung + Rate-Limits) → Twilio Verify sendet den Code.
--   2. «Bestätigen» → Edge Function (action check) → Twilio prüft den Code
--      → public.sms_verify_approved erzeugt einen Einmal-Token (30 Min.).
--   3. submit_entry(…, p_phone_token) nimmt die Teilnahme nur mit gültigem Token an
--      (gleiche Kampagne, gleiche Nummer, unbenutzt) und setzt entries.phone_verified_at.
--   Die E-Mail-Bestätigung (Double-Opt-in) bleibt zusätzlich bestehen.
--
--  * campaigns.requires_phone_verification (für alle bestehenden Gewinnspiele eingeschaltet)
--  * Nur Schweizer Handynummern (+41 74–79): SMS-Kosten und Missbrauch begrenzen.
--  * Rate-Limits pro Nummer, pro IP und pro Gewinnspiel (siehe sms_verify_start).
--  * Nummern in den SMS-Tabellen nur gehasht; Einträge werden nach 2 Tagen gelöscht.
--  * Twilio-Zugangsdaten liegen nur in der Edge Function (Supabase Secrets), nie im Browser.
-- =====================================================================

alter table public.campaigns
  add column requires_phone_verification boolean not null default false;
comment on column public.campaigns.requires_phone_verification is 'Teilnahme nur mit per SMS-Code bestätigter Schweizer Handynummer (Twilio Verify, Edge Function sms-verify).';

alter table public.entries
  add column phone_verified_at timestamptz;
comment on column public.entries.phone_verified_at is 'Zeitpunkt der SMS-Bestätigung der Telefonnummer (campaigns.requires_phone_verification).';
create index entries_phone_idx on public.entries (campaign_id, phone) where phone is not null;

update public.campaigns set requires_phone_verification = true
 where slug in ('ps5-gta6-2026', 'steuern-2027', 'buergenstock-2026');

-- Telefon normalisieren wie im Formular: 079 … / 0041 … / +41 (0)… → +41…; ungültig → null
create or replace function private.norm_phone(p text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := nullif(regexp_replace(coalesce(p, ''), '[^0-9+]', '', 'g'), '');
begin
  if v is null then return null; end if;
  if v like '00%' then v := '+' || substr(v, 3); end if;
  if v ~ '^0[1-9]' then v := '+41' || substr(v, 2); end if;
  v := regexp_replace(v, '^\+410', '+41');
  if v !~ '^\+[1-9][0-9]{7,14}$' or (v like '+41%' and v !~ '^\+41[1-9][0-9]{8}$') then
    return null;
  end if;
  return v;
end;
$$;

create or replace function private.phone_hash(p_campaign uuid, p_phone text)
returns text
language sql
immutable
set search_path = ''
as $$ select encode(extensions.digest(p_phone || ':' || p_campaign::text, 'sha256'), 'hex') $$;

-- SMS-Versand (für Rate-Limits) und bestätigte Nummern (Einmal-Token)
create table private.sms_sends (
  id bigint generated always as identity primary key,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  phone_hash text not null,
  ip_hash text,
  created_at timestamptz not null default now()
);
comment on table private.sms_sends is 'Angeforderte SMS-Codes (nur Hashes), für Rate-Limits. Einträge älter als 2 Tage werden gelöscht.';
create index sms_sends_phone_idx on private.sms_sends (campaign_id, phone_hash, created_at);
create index sms_sends_ip_idx on private.sms_sends (ip_hash, created_at);
create index sms_sends_campaign_idx on private.sms_sends (campaign_id, created_at);

create table private.phone_verifications (
  id bigint generated always as identity primary key,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  phone_hash text not null,
  token_hash bytea not null unique,
  token_expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
comment on table private.phone_verifications is 'Per SMS bestätigte Nummern (nur Hash) mit Einmal-Token für submit_entry. Einträge älter als 2 Tage werden gelöscht.';

alter table private.sms_sends enable row level security;
alter table private.phone_verifications enable row level security;
grant all on private.sms_sends, private.phone_verifications to service_role;

-- Schritt 1 (nur Edge Function / service_role): darf an diese Nummer ein Code gesendet werden?
create or replace function public.sms_verify_start(p_campaign text, p_phone text, p_ip text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c public.campaigns;
  v_phone text := private.norm_phone(private.clean_text(p_phone, 30));
  v_hash text;
  v_ip_hash text;
begin
  select * into c from public.campaigns where slug = p_campaign;
  if not found or (c.status <> 'published' and not c.test_mode) or not c.requires_phone_verification then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if c.status = 'published' then
    if now() < c.starts_at then return jsonb_build_object('ok', false, 'error', 'not_started'); end if;
    if now() > c.ends_at then return jsonb_build_object('ok', false, 'error', 'closed'); end if;
  end if;
  if v_phone is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_phone');
  end if;
  -- nur Schweizer Handynummern (074–079)
  if v_phone !~ '^\+417[4-9][0-9]{7}$' then
    return jsonb_build_object('ok', false, 'error', 'phone_not_mobile');
  end if;

  delete from private.sms_sends where created_at < now() - interval '2 days';
  delete from private.phone_verifications where created_at < now() - interval '2 days';

  v_hash := private.phone_hash(c.id, v_phone);
  v_ip_hash := case when nullif(trim(p_ip), '') is not null
                    then encode(extensions.digest(trim(p_ip) || ':' || c.id::text, 'sha256'), 'hex') end;

  -- Rate-Limits: pro Nummer 3 Codes / 15 Min. und 6 / 24 h, pro IP 10 / h, pro Gewinnspiel 300 / h
  if (select count(*) from private.sms_sends s
       where s.campaign_id = c.id and s.phone_hash = v_hash and s.created_at > now() - interval '15 minutes') >= 3
     or (select count(*) from private.sms_sends s
       where s.campaign_id = c.id and s.phone_hash = v_hash and s.created_at > now() - interval '24 hours') >= 6
     or (v_ip_hash is not null and (select count(*) from private.sms_sends s
       where s.ip_hash = v_ip_hash and s.created_at > now() - interval '1 hour') >= 10) then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  if (select count(*) from private.sms_sends s
       where s.campaign_id = c.id and s.created_at > now() - interval '1 hour') >= 300 then
    return jsonb_build_object('ok', false, 'error', 'busy');
  end if;

  insert into private.sms_sends (campaign_id, phone_hash, ip_hash) values (c.id, v_hash, v_ip_hash);
  -- test: Gewinnspiel noch nicht veröffentlicht (Testmodus) → Edge Function darf ohne Twilio einen Testcode verwenden, falls so konfiguriert
  return jsonb_build_object('ok', true, 'phone', v_phone, 'test', c.status <> 'published');
end;
$$;

-- Schritt 2 (nur Edge Function / service_role, nachdem Twilio den Code als «approved» gemeldet hat):
-- Einmal-Token für submit_entry ausstellen
create or replace function public.sms_verify_approved(p_campaign text, p_phone text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c public.campaigns;
  v_phone text := private.norm_phone(private.clean_text(p_phone, 30));
  v_token text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  select * into c from public.campaigns where slug = p_campaign;
  if not found or not c.requires_phone_verification then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_phone is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_phone');
  end if;
  insert into private.phone_verifications (campaign_id, phone_hash, token_hash, token_expires_at)
  values (c.id, private.phone_hash(c.id, v_phone), extensions.digest(v_token, 'sha256'), now() + interval '30 minutes');
  return jsonb_build_object('ok', true, 'token', v_token, 'phone', v_phone);
end;
$$;

revoke execute on function public.sms_verify_start(text, text, text) from public, anon, authenticated;
revoke execute on function public.sms_verify_approved(text, text) from public, anon, authenticated;
grant execute on function public.sms_verify_start(text, text, text) to service_role;
grant execute on function public.sms_verify_approved(text, text) to service_role;
revoke execute on function private.norm_phone(text) from public;
revoke execute on function private.phone_hash(uuid, text) from public;
grant execute on function private.norm_phone(text) to service_role;
grant execute on function private.phone_hash(uuid, text) to service_role;

-- get_campaign: Formular erfährt, ob Kontaktangaben und SMS-Bestätigung nötig sind
create or replace function public.get_campaign(p_campaign text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c public.campaigns;
begin
  select * into c from public.campaigns where slug = p_campaign;
  if not found or (c.status <> 'published' and not c.test_mode and not private.is_admin()) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  return jsonb_build_object(
    'ok', true,
    'server_time', now(),
    'phase', private.campaign_phase(c.starts_at, c.ends_at),
    'campaign', jsonb_build_object(
      'slug', c.slug, 'kind', c.kind, 'status', c.status, 'test_mode', c.test_mode,
      'title', c.title, 'tagline', c.tagline, 'summary', c.summary,
      'sponsor_brand', c.sponsor_brand, 'organizer_name', c.organizer_name,
      'organizer_address', c.organizer_address, 'organizer_email', c.organizer_email,
      'public_url', c.public_url, 'timezone', c.timezone,
      'starts_at', c.starts_at, 'ends_at', c.ends_at,
      'starts_at_label', private.fmt_ts(c.starts_at, c.timezone),
      'ends_at_label', private.fmt_ts(c.ends_at, c.timezone),
      'draw_on', c.draw_on, 'redeem_until', c.redeem_until,
      'min_age', c.min_age, 'allowed_cantons', to_jsonb(c.allowed_cantons),
      'requires_pool_choice', c.requires_pool_choice, 'terms_version', c.terms_version,
      'referral_bonus_max', c.referral_bonus_max,
      'collect_contact_details', c.collect_contact_details,
      'requires_phone_verification', c.requires_phone_verification
    ),
    'pools', coalesce((
      select jsonb_agg(jsonb_build_object(
        'key', p.key, 'title', p.title, 'short_title', p.short_title, 'description', p.description,
        'winners', p.winners, 'details', p.details,
        'partner', case
          when pa.id is null then null
          when pa.status = 'zugesagt' then jsonb_build_object(
            'confirmed', true, 'label', pa.label, 'name', pa.name, 'description', pa.description,
            'street', pa.street, 'postal_code', pa.postal_code, 'city', pa.city, 'canton', pa.canton,
            'latitude', pa.latitude, 'longitude', pa.longitude, 'logo_url', pa.logo_url,
            'website_url', pa.website_url, 'booking_url', pa.booking_url,
            'transmissions', to_jsonb(pa.transmissions), 'languages', to_jsonb(pa.languages),
            'requirements', pa.requirements)
          else jsonb_build_object('confirmed', false, 'label', pa.label)
        end
      ) order by p.sort_order, p.key)
      from public.prize_pools p
      left join public.partners pa on pa.id = p.partner_id
      where p.campaign_id = c.id and p.is_active
    ), '[]'::jsonb),
    'page', (
      select jsonb_build_object(
        'path', lp.path, 'seo_title', lp.seo_title, 'seo_description', lp.seo_description,
        'og_image_url', lp.og_image_url, 'video_url', lp.video_url, 'content', lp.content)
      from public.landing_pages lp
      where lp.campaign_id = c.id
    )
  );
end;
$$;

-- submit_entry mit p_phone_token (alte Signatur entfernen, damit PostgREST eindeutig bleibt)
drop function public.submit_entry(text, text, text, text, text, text, boolean, boolean, text, jsonb, timestamptz, text, text, text, date);

create or replace function public.submit_entry(
  p_campaign text,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_postal_code text,
  p_canton text,
  p_consent_terms boolean,
  p_marketing_opt_in boolean default false,
  p_pool text default null,
  p_source jsonb default '{}'::jsonb,
  p_form_started_at timestamptz default null,
  p_website text default null,
  p_instagram text default null,
  p_phone text default null,
  p_birth_date date default null,
  p_phone_token text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c public.campaigns;
  v_pool_id uuid;
  v_first text := private.clean_text(p_first_name, 80);
  v_last text := private.clean_text(p_last_name, 80);
  v_email text := lower(private.clean_text(p_email, 254));
  v_plz text := private.clean_text(p_postal_code, 4);
  v_canton text := upper(private.clean_text(p_canton, 2));
  v_insta text := nullif(lower(ltrim(private.clean_text(p_instagram, 31), '@')), '');
  -- Telefon: nur Ziffern und führendes + behalten; 0041… / 079… → +41…
  v_phone text := nullif(regexp_replace(coalesce(private.clean_text(p_phone, 30), ''), '[^0-9+]', '', 'g'), '');
  v_birth date;
  v_ip text := private.request_ip();
  v_ip_hash text;
  v_is_test boolean;
  v_existing public.entries;
  v_entry_id uuid;
  v_token text;
  v_expires timestamptz;
  v_src jsonb := coalesce(p_source, '{}'::jsonb);
  v_ref_id uuid;
  v_pv private.phone_verifications;
  v_verified_at timestamptz;
begin
  select * into c from public.campaigns where slug = p_campaign;
  if not found or (c.status <> 'published' and not c.test_mode) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  v_is_test := c.status <> 'published';

  if not v_is_test then
    if now() < c.starts_at then
      return jsonb_build_object('ok', false, 'error', 'not_started', 'starts_at', c.starts_at);
    elsif now() > c.ends_at then
      return jsonb_build_object('ok', false, 'error', 'closed');
    end if;
  end if;

  -- Bot-Bremse: Honeypot-Feld wird still verworfen, Formular schneller als 3 s ist verdächtig.
  if coalesce(trim(p_website), '') <> '' then
    return jsonb_build_object('ok', true, 'status', 'check_email');
  end if;
  if p_form_started_at is not null and p_form_started_at > now() - interval '3 seconds' then
    return jsonb_build_object('ok', false, 'error', 'too_fast');
  end if;

  if v_ip is not null then
    v_ip_hash := encode(extensions.digest(v_ip || ':' || c.id::text, 'sha256'), 'hex');
    if (select count(*) from public.entries e
         where e.ip_hash = v_ip_hash and e.created_at > now() - interval '1 hour') >= 10 then
      return jsonb_build_object('ok', false, 'error', 'rate_limited');
    end if;
  end if;

  -- Validierung
  if v_first is null or v_last is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_name');
  end if;
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_email');
  end if;
  if v_plz is null or v_plz !~ '^[1-9][0-9]{3}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_postal_code');
  end if;
  -- leere Liste allowed_cantons = ganze Schweiz (Kanton dann optional)
  if cardinality(c.allowed_cantons) > 0 and (v_canton is null or not (v_canton = any (c.allowed_cantons))) then
    return jsonb_build_object('ok', false, 'error', 'invalid_canton');
  end if;
  if v_insta is not null and v_insta !~ '^[a-z0-9._]{1,30}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_instagram');
  end if;
  -- Telefon: Pflicht bei Kontaktangaben oder SMS-Bestätigung
  if c.collect_contact_details or c.requires_phone_verification then
    v_phone := private.norm_phone(v_phone);
    if v_phone is null then
      return jsonb_build_object('ok', false, 'error', 'invalid_phone');
    end if;
  else
    v_phone := null;
  end if;
  if c.collect_contact_details then
    if p_birth_date is null or p_birth_date < date '1900-01-01' or p_birth_date > (now() at time zone c.timezone)::date then
      return jsonb_build_object('ok', false, 'error', 'invalid_birth_date');
    end if;
    if p_birth_date > ((now() at time zone c.timezone)::date - make_interval(years => c.min_age))::date then
      return jsonb_build_object('ok', false, 'error', 'too_young');
    end if;
    v_birth := p_birth_date;
  end if;
  if not coalesce(p_consent_terms, false) then
    return jsonb_build_object('ok', false, 'error', 'consent_required');
  end if;

  if c.requires_pool_choice then
    select p.id into v_pool_id from public.prize_pools p
     where p.campaign_id = c.id and p.key = p_pool and p.is_active;
    if v_pool_id is null then
      return jsonb_build_object('ok', false, 'error', 'invalid_pool');
    end if;
  else
    select p.id into v_pool_id from public.prize_pools p
     where p.campaign_id = c.id and p.is_active
     order by p.sort_order, p.key limit 1;
    if v_pool_id is null then
      return jsonb_build_object('ok', false, 'error', 'invalid_pool');
    end if;
  end if;

  -- SMS-Bestätigung: Einmal-Token aus public.sms_verify_approved (Edge Function sms-verify),
  -- gültig 30 Minuten, nur für diese Kampagne und genau diese Nummer.
  if c.requires_phone_verification then
    select * into v_pv from private.phone_verifications pv
     where pv.campaign_id = c.id
       and pv.token_hash = extensions.digest(coalesce(p_phone_token, ''), 'sha256')
     for update;
    if not found or v_pv.phone_hash <> private.phone_hash(c.id, v_phone)
       or v_pv.used_at is not null or v_pv.token_expires_at < now() then
      return jsonb_build_object('ok', false, 'error', 'phone_not_verified');
    end if;
    -- eine bestätigte Nummer gehört zu höchstens einer Teilnahme (E-Mail) pro Gewinnspiel
    if exists (select 1 from public.entries e
                where e.campaign_id = c.id and e.phone = v_phone and e.phone_verified_at is not null
                  and e.email_normalized is distinct from v_email and e.status <> 'anonymized') then
      return jsonb_build_object('ok', false, 'error', 'phone_in_use');
    end if;
    update private.phone_verifications set used_at = now() where id = v_pv.id;
    v_verified_at := now();
  end if;

  -- Einladungslink (?ref=…): merkt sich die einladende Teilnahme. Ob daraus ein Bonuslos wird,
  -- entscheidet private.bonus_entries() erst anhand bestätigter Teilnahmen.
  if c.referral_bonus_max > 0 and coalesce(v_src ->> 'ref', '') ~ '^[a-z2-9]{8}$' then
    select r.id into v_ref_id from public.entries r
     where r.campaign_id = c.id and r.share_code = v_src ->> 'ref'
       and r.email_normalized is distinct from v_email;
  end if;

  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  v_expires := case when v_is_test then now() + interval '7 days'
                    else least(now() + interval '7 days', c.ends_at) end;

  select * into v_existing from public.entries e
   where e.campaign_id = c.id and e.email_normalized = v_email
   for update;

  if found then
    if v_existing.status = 'pending' then
      -- erneut abgeschickt: letzte Angaben gelten; Bestätigungslink höchstens 1× pro 2 Minuten neu senden
      if v_existing.last_confirmation_sent_at > now() - interval '2 minutes' then
        update public.entries
           set pool_id = v_pool_id, first_name = v_first, last_name = v_last, email = v_email,
               postal_code = v_plz, canton = v_canton, instagram_handle = v_insta, phone = v_phone, birth_date = v_birth, phone_verified_at = coalesce(v_verified_at, phone_verified_at),
               consent_terms = true, consent_terms_at = now(), terms_version = c.terms_version,
               marketing_opt_in = coalesce(p_marketing_opt_in, false),
               marketing_opt_in_at = case when coalesce(p_marketing_opt_in, false) then now() end,
               referred_by = coalesce(referred_by, v_ref_id)
         where id = v_existing.id;
        return jsonb_build_object('ok', true, 'status', 'check_email');
      end if;
      update public.entries
         set pool_id = v_pool_id, first_name = v_first, last_name = v_last, email = v_email,
             postal_code = v_plz, canton = v_canton, instagram_handle = v_insta, phone = v_phone, birth_date = v_birth, phone_verified_at = coalesce(v_verified_at, phone_verified_at),
             consent_terms = true, consent_terms_at = now(), terms_version = c.terms_version,
             marketing_opt_in = coalesce(p_marketing_opt_in, false),
             marketing_opt_in_at = case when coalesce(p_marketing_opt_in, false) then now() end,
             confirm_token_hash = extensions.digest(v_token, 'sha256'),
             confirm_token_expires_at = v_expires,
             confirmation_sent_count = confirmation_sent_count + 1,
             last_confirmation_sent_at = now(),
             referred_by = coalesce(referred_by, v_ref_id)
       where id = v_existing.id;
      v_entry_id := v_existing.id;
    elsif v_existing.status = 'confirmed' then
      -- bereits gültig: höchstens 1× pro Tag ein Hinweis per Mail, sonst nichts verraten
      if v_existing.last_confirmation_sent_at is null or v_existing.last_confirmation_sent_at < now() - interval '1 day' then
        update public.entries set last_confirmation_sent_at = now() where id = v_existing.id;
        insert into private.email_outbox (campaign_id, entry_id, template_key, to_email, payload)
        values (c.id, v_existing.id, 'already_registered', v_email,
                jsonb_build_object('first_name', v_existing.first_name, 'campaign_title', c.title,
                                   'ends_at', private.fmt_ts(c.ends_at, c.timezone)));
      end if;
      return jsonb_build_object('ok', true, 'status', 'check_email');
    else
      return jsonb_build_object('ok', true, 'status', 'check_email');
    end if;
  else
    insert into public.entries (
      campaign_id, pool_id, is_test, first_name, last_name, email, email_normalized, postal_code, canton, instagram_handle, phone, birth_date, phone_verified_at,
      consent_terms, consent_terms_at, terms_version, marketing_opt_in, marketing_opt_in_at,
      confirm_token_hash, confirm_token_expires_at, confirmation_sent_count, last_confirmation_sent_at,
      utm_source, utm_medium, utm_campaign, utm_content, utm_term, referrer, landing_path,
      ip_hash, user_agent, share_code, referred_by)
    values (
      c.id, v_pool_id, v_is_test, v_first, v_last, v_email, v_email, v_plz, v_canton, v_insta, v_phone, v_birth, v_verified_at,
      true, now(), c.terms_version, coalesce(p_marketing_opt_in, false),
      case when coalesce(p_marketing_opt_in, false) then now() end,
      extensions.digest(v_token, 'sha256'), v_expires, 1, now(),
      private.clean_text(v_src ->> 'utm_source', 100), private.clean_text(v_src ->> 'utm_medium', 100),
      private.clean_text(v_src ->> 'utm_campaign', 100), private.clean_text(v_src ->> 'utm_content', 100),
      private.clean_text(v_src ->> 'utm_term', 100), private.clean_text(v_src ->> 'referrer', 500),
      private.clean_text(v_src ->> 'landing_path', 300),
      v_ip_hash, private.request_user_agent(), private.new_share_code(), v_ref_id)
    returning id into v_entry_id;
  end if;

  insert into private.email_outbox (campaign_id, entry_id, template_key, to_email, payload)
  values (c.id, v_entry_id, 'confirm_entry', v_email,
          jsonb_build_object(
            'first_name', v_first,
            'campaign_title', c.title,
            'confirm_url', coalesce(c.confirm_url, c.public_url, '') || '?token=' || v_token,
            'ends_at', private.fmt_ts(c.ends_at, c.timezone)));

  return jsonb_build_object('ok', true, 'status', 'check_email');
end;
$$;

revoke execute on function public.submit_entry(text, text, text, text, text, text, boolean, boolean, text, jsonb, timestamptz, text, text, text, date, text) from public, anon, authenticated;
grant execute on function public.submit_entry(text, text, text, text, text, text, boolean, boolean, text, jsonb, timestamptz, text, text, text, date, text) to anon, authenticated, service_role;

create or replace view public.entries_export with (security_invoker = true) as
select c.slug as campaign, p.key as pool, p.title as prize,
       e.id as entry_id, e.first_name, e.last_name, e.email, e.postal_code, e.canton, e.instagram_handle,
       e.confirmed_at, e.marketing_opt_in, e.utm_source, e.utm_medium, e.utm_campaign, e.utm_content,
       private.bonus_entries(e.id) as bonus_entries, e.referred_by as referred_by_entry_id,
       e.phone, e.birth_date, e.appointment_attended_at, e.phone_verified_at
  from public.entries e
  join public.campaigns c on c.id = e.campaign_id
  join public.prize_pools p on p.id = e.pool_id
 where e.status = 'confirmed' and not e.is_test;
revoke all on public.entries_export from anon;
