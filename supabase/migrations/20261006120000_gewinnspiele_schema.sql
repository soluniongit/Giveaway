-- =====================================================================
-- allnova Gewinnspiele — Datenbasis für die Giveaway-Seite (gewinnspiel.allnova.ch)
--
-- Grundsätze (Marketingkonzept 06.10.2026, gilt für jedes Giveaway):
--   * ein Datensatz pro Person und Gewinnspiel (deduplizierte E-Mail)
--   * serverseitige Fristprüfung, E-Mail-Bestätigung per Einmal-Link
--   * einfache Bot-Bremse (Honeypot, Mindestausfüllzeit, IP-Rate-Limit)
--   * Kampagnenkennung + Quelle (UTM) je Teilnahme, App-Klicks separat
--   * Preispools (ein oder mehrere Gewinne), Ziehung mit Protokoll
--   * Anonymisierung der Nicht-Gewinner nach der Abwicklung
--
-- Zugriff von aussen (anon / Landingpages) ausschliesslich über RPCs:
--   get_campaign · submit_entry · confirm_entry · track_event
-- Tabellen: RLS aktiv, nur Admins (Tabelle admins) bzw. service_role.
-- =====================================================================

create schema if not exists private;
revoke all on schema private from public;

-- ---------------------------------------------------------------------
-- Typen
-- ---------------------------------------------------------------------
create type public.campaign_kind as enum ('giveaway');
create type public.publication_status as enum ('draft', 'published', 'archived');
create type public.partner_status as enum ('angefragt', 'im_gespraech', 'zugesagt', 'abgesagt');
create type public.entry_status as enum ('pending', 'confirmed', 'disqualified', 'anonymized');
create type public.draw_role as enum ('winner', 'reserve');
create type public.draw_result_status as enum ('selected', 'notified', 'accepted', 'declined', 'expired', 'replaced');
create type public.outbox_status as enum ('queued', 'sending', 'sent', 'failed', 'cancelled');

-- ---------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------
create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);
comment on table public.admins is 'Benutzer (Supabase Auth), die Teilnahmen sehen, Ziehungen durchführen und Inhalte pflegen dürfen.';

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  kind public.campaign_kind not null,
  status public.publication_status not null default 'draft',
  test_mode boolean not null default false,
  title text not null,
  tagline text,
  summary text,
  sponsor_brand text not null default 'allnova',
  organizer_name text not null default 'Allfinanz Consulting GmbH',
  organizer_address text not null default 'Chaltenbodenstrasse 26, 8834 Schindellegi',
  organizer_email text not null default 'info@allnova.ch',
  public_url text,
  confirm_url text,
  timezone text not null default 'Europe/Zurich',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  draw_on date,
  redeem_until date,
  min_age integer not null default 18 check (min_age >= 18),
  allowed_cantons text[] not null default '{}',
  requires_pool_choice boolean not null default false,
  terms_version text not null default 'v1',
  response_days integer not null default 7 check (response_days > 0),
  retention_days integer not null default 90 check (retention_days > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaigns_period check (ends_at > starts_at)
);
comment on table public.campaigns is 'Ein Gewinnspiel (Welle). status=published schaltet die Landingpage und das Formular frei; test_mode erlaubt Testteilnahmen ausserhalb der Laufzeit (als Test markiert).';
comment on column public.campaigns.confirm_url is 'Seite, die den Bestätigungslink entgegennimmt; ?token=… wird angehängt.';
comment on column public.campaigns.response_days is 'Rückmeldefrist der Gewinnperson in Kalendertagen, danach Nachziehung aus der Reserve.';
comment on column public.campaigns.allowed_cantons is 'Zugelassene Wohnkantone; leer = ganze Schweiz (Kanton im Formular dann optional).';
comment on column public.campaigns.retention_days is 'Nicht-Gewinner spätestens so viele Tage nach Abschluss der Gewinnabwicklung löschen/anonymisieren.';

create table public.partners (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  label text not null,
  name text,
  status public.partner_status not null default 'angefragt',
  description text,
  street text,
  postal_code text,
  city text,
  canton text,
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  logo_url text,
  website_url text,
  booking_url text,
  transmissions text[] not null default '{}',
  languages text[] not null default '{}',
  requirements text,
  contact_name text,
  contact_email text,
  contact_phone text,
  agreement_signed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.partners is 'Optionale Preispartner. Name, Ort und Logo erscheinen öffentlich erst mit status=zugesagt; bis dahin nur das neutrale label.';

create table public.prize_pools (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9_-]+$'),
  partner_id uuid references public.partners (id) on delete set null,
  title text not null,
  short_title text,
  description text,
  winners integer not null default 1 check (winners > 0),
  details jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, key)
);
comment on table public.prize_pools is 'Preispool = was gewonnen werden kann (Ziehung innerhalb des Pools). PS5-Giveaway: ein Pool.';

create table public.landing_pages (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null unique references public.campaigns (id) on delete cascade,
  path text not null unique,
  seo_title text,
  seo_description text,
  og_image_url text,
  video_url text,
  content jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.landing_pages is 'Inhalte der Gewinnspielseite (Hero, Leistungsumfang, FAQ, Formular- und Rechtstexte) als JSON, damit Texte ohne Deployment angepasst werden können.';

create table public.entries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete restrict,
  pool_id uuid not null references public.prize_pools (id) on delete restrict,
  status public.entry_status not null default 'pending',
  is_test boolean not null default false,
  first_name text,
  last_name text,
  email text,
  email_normalized text,
  postal_code text,
  canton text,
  instagram_handle text check (instagram_handle ~ '^[a-z0-9._]{1,30}$'),
  consent_terms boolean not null,
  consent_terms_at timestamptz not null default now(),
  terms_version text not null,
  marketing_opt_in boolean not null default false,
  marketing_opt_in_at timestamptz,
  confirm_token_hash bytea,
  confirm_token_expires_at timestamptz,
  confirmed_at timestamptz,
  confirmation_sent_count integer not null default 0,
  last_confirmation_sent_at timestamptz,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  referrer text,
  landing_path text,
  ip_hash text,
  user_agent text,
  disqualified_reason text,
  anonymized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint entries_one_per_person unique (campaign_id, email_normalized),
  constraint entries_consent_required check (consent_terms)
);
comment on table public.entries is 'Teilnahmen. Gültig erst mit status=confirmed (E-Mail bestätigt innerhalb der Laufzeit). Keine AHV-Nummern, Ausweis- oder Zahlungsdaten erfassen.';
comment on column public.entries.instagram_handle is 'Freiwillig: Instagram-Name ohne @ (nur für Gewinnerkontakt). Wird bei der Anonymisierung gelöscht.';

create table public.marketing_consents (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  first_name text,
  source_campaign_id uuid references public.campaigns (id) on delete set null,
  source_entry_id uuid references public.entries (id) on delete set null,
  consent_text text not null,
  consented_at timestamptz not null default now(),
  confirmed_at timestamptz,
  withdrawn_at timestamptz,
  created_at timestamptz not null default now()
);
comment on table public.marketing_consents is 'Freiwillige Werbeeinwilligungen, separat von den Teilnahmen dokumentiert (bleiben bei der Anonymisierung der Teilnahmen erhalten).';

create table public.events (
  id bigint generated always as identity primary key,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  entry_id uuid references public.entries (id) on delete set null,
  event_type text not null check (event_type in (
    'page_view', 'video_play', 'calculator_used', 'quiz_completed', 'roadmap_used', 'pool_selected',
    'form_started', 'form_submitted', 'app_cta_click', 'app_later_click', 'partner_link_click', 'share_click',
    'instagram_click', 'instagram_embed_load'
  )),
  session_id text,
  meta jsonb not null default '{}'::jsonb,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  created_at timestamptz not null default now()
);
comment on table public.events is 'Anonyme Interaktionen (ohne IP), u. a. App-Klicks nach der Teilnahme — separat von den Teilnahmen gemessen.';

create table public.draws (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete restrict,
  pool_id uuid not null references public.prize_pools (id) on delete restrict,
  drawn_at timestamptz not null default now(),
  drawn_by text not null,
  verified_by text,
  method text not null,
  valid_entry_count integer not null,
  notes text,
  voided_at timestamptz,
  voided_reason text,
  created_at timestamptz not null default now()
);
comment on table public.draws is 'Ziehungsprotokoll: Datum, Anzahl gültiger Einträge, Methode, durchführende und prüfende Person.';

create table public.draw_results (
  id uuid primary key default gen_random_uuid(),
  draw_id uuid not null references public.draws (id) on delete cascade,
  entry_id uuid not null references public.entries (id) on delete restrict,
  role public.draw_role not null,
  rank integer not null check (rank > 0),
  status public.draw_result_status not null default 'selected',
  notified_at timestamptz,
  response_due_at timestamptz,
  responded_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (draw_id, rank),
  unique (draw_id, entry_id)
);
comment on table public.draw_results is 'Gezogene Teilnahmen je Ziehung: Gewinner (role=winner) und Reserveliste in Ziehungsreihenfolge (role=reserve).';

create table public.email_templates (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.campaigns (id) on delete cascade,
  key text not null,
  subject text not null,
  body_text text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index email_templates_key_uq on public.email_templates (coalesce(campaign_id, '00000000-0000-0000-0000-000000000000'::uuid), key);
comment on table public.email_templates is 'Texte der Abwicklungs-Mails. Platzhalter: {{first_name}}, {{campaign_title}}, {{confirm_url}}, {{ends_at}}, {{prize}}.';

-- Mail-Warteschlange: wird von einer Edge Function / einem Mail-Dienst (service_role) abgearbeitet.
create table private.email_outbox (
  id bigint generated always as identity primary key,
  campaign_id uuid references public.campaigns (id) on delete set null,
  entry_id uuid references public.entries (id) on delete set null,
  template_key text not null,
  to_email text not null,
  payload jsonb not null default '{}'::jsonb,
  status public.outbox_status not null default 'queued',
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
comment on table private.email_outbox is 'Ausgehende Mails. payload.confirm_url enthält den Einmal-Token im Klartext — nach dem Versand entfernen (siehe private.mark_email_sent).';

-- ---------------------------------------------------------------------
-- Indizes
-- ---------------------------------------------------------------------
create index partners_campaign_idx on public.partners (campaign_id);
create index prize_pools_partner_idx on public.prize_pools (partner_id);
create index entries_campaign_status_idx on public.entries (campaign_id, status);
create index entries_pool_status_idx on public.entries (pool_id, status);
create index entries_token_idx on public.entries (confirm_token_hash) where confirm_token_hash is not null;
create index entries_ip_recent_idx on public.entries (ip_hash, created_at);
create index marketing_consents_email_idx on public.marketing_consents (lower(email));
create index marketing_consents_campaign_idx on public.marketing_consents (source_campaign_id);
create index marketing_consents_entry_idx on public.marketing_consents (source_entry_id);
create index events_campaign_type_idx on public.events (campaign_id, event_type, created_at);
create index events_entry_idx on public.events (entry_id);
create index draws_campaign_idx on public.draws (campaign_id);
create index draws_pool_idx on public.draws (pool_id);
create index draw_results_entry_idx on public.draw_results (entry_id);
create index email_outbox_queue_idx on private.email_outbox (status, created_at);
create index email_outbox_entry_idx on private.email_outbox (entry_id);
create index email_outbox_campaign_idx on private.email_outbox (campaign_id);

-- ---------------------------------------------------------------------
-- Hilfsfunktionen
-- ---------------------------------------------------------------------
create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger campaigns_touch before update on public.campaigns for each row execute function private.touch_updated_at();
create trigger partners_touch before update on public.partners for each row execute function private.touch_updated_at();
create trigger prize_pools_touch before update on public.prize_pools for each row execute function private.touch_updated_at();
create trigger landing_pages_touch before update on public.landing_pages for each row execute function private.touch_updated_at();
create trigger entries_touch before update on public.entries for each row execute function private.touch_updated_at();
create trigger draw_results_touch before update on public.draw_results for each row execute function private.touch_updated_at();
create trigger email_templates_touch before update on public.email_templates for each row execute function private.touch_updated_at();

-- Admin = eingetragener Supabase-Benutzer, service_role-Schlüssel oder SQL-Editor (postgres).
create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (select 1 from public.admins a where a.user_id = auth.uid())
    or coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role'
    or session_user in ('postgres', 'supabase_admin');
$$;

create or replace function private.campaign_phase(p_starts timestamptz, p_ends timestamptz)
returns text
language sql
stable
set search_path = ''
as $$
  select case when now() < p_starts then 'upcoming' when now() <= p_ends then 'open' else 'closed' end;
$$;

-- Erste IP aus X-Forwarded-For (PostgREST stellt die Request-Header als GUC bereit).
create or replace function private.request_ip()
returns text
language sql
stable
set search_path = ''
as $$
  select nullif(trim(split_part(coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for', ''), ',', 1)), '');
$$;

create or replace function private.request_user_agent()
returns text
language sql
stable
set search_path = ''
as $$
  select left(nullif(current_setting('request.headers', true), '')::json ->> 'user-agent', 300);
$$;

create or replace function private.fmt_ts(p_ts timestamptz, p_tz text)
returns text
language sql
stable
set search_path = ''
as $$
  select to_char(p_ts at time zone p_tz, 'DD.MM.YYYY, HH24:MI') || ' Uhr';
$$;

create or replace function private.clean_text(p text, p_max integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(left(regexp_replace(trim(coalesce(p, '')), '\s+', ' ', 'g'), p_max), '');
$$;

-- Mail-Versand quittieren (für die Versand-Funktion mit service_role); entfernt den Klartext-Token.
create or replace function private.mark_email_sent(p_id bigint, p_error text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.email_outbox
     set status = case when p_error is null then 'sent'::public.outbox_status else 'failed'::public.outbox_status end,
         attempts = attempts + 1,
         last_error = p_error,
         sent_at = case when p_error is null then now() else sent_at end,
         payload = case when p_error is null then payload - 'confirm_url' else payload end
   where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Öffentliche RPCs (Landingpages)
-- ---------------------------------------------------------------------

-- Kampagne + Preispools + öffentliche Partnerangaben + Seiteninhalte.
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
      'requires_pool_choice', c.requires_pool_choice, 'terms_version', c.terms_version
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

-- Teilnahme erfassen. Antwortet absichtlich gleich, ob die E-Mail schon erfasst ist oder nicht.
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
  p_instagram text default null
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
  v_ip text := private.request_ip();
  v_ip_hash text;
  v_is_test boolean;
  v_existing public.entries;
  v_entry_id uuid;
  v_token text;
  v_expires timestamptz;
  v_src jsonb := coalesce(p_source, '{}'::jsonb);
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
               postal_code = v_plz, canton = v_canton, instagram_handle = v_insta,
               consent_terms = true, consent_terms_at = now(), terms_version = c.terms_version,
               marketing_opt_in = coalesce(p_marketing_opt_in, false),
               marketing_opt_in_at = case when coalesce(p_marketing_opt_in, false) then now() end
         where id = v_existing.id;
        return jsonb_build_object('ok', true, 'status', 'check_email');
      end if;
      update public.entries
         set pool_id = v_pool_id, first_name = v_first, last_name = v_last, email = v_email,
             postal_code = v_plz, canton = v_canton, instagram_handle = v_insta,
             consent_terms = true, consent_terms_at = now(), terms_version = c.terms_version,
             marketing_opt_in = coalesce(p_marketing_opt_in, false),
             marketing_opt_in_at = case when coalesce(p_marketing_opt_in, false) then now() end,
             confirm_token_hash = extensions.digest(v_token, 'sha256'),
             confirm_token_expires_at = v_expires,
             confirmation_sent_count = confirmation_sent_count + 1,
             last_confirmation_sent_at = now()
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
      campaign_id, pool_id, is_test, first_name, last_name, email, email_normalized, postal_code, canton, instagram_handle,
      consent_terms, consent_terms_at, terms_version, marketing_opt_in, marketing_opt_in_at,
      confirm_token_hash, confirm_token_expires_at, confirmation_sent_count, last_confirmation_sent_at,
      utm_source, utm_medium, utm_campaign, utm_content, utm_term, referrer, landing_path,
      ip_hash, user_agent)
    values (
      c.id, v_pool_id, v_is_test, v_first, v_last, v_email, v_email, v_plz, v_canton, v_insta,
      true, now(), c.terms_version, coalesce(p_marketing_opt_in, false),
      case when coalesce(p_marketing_opt_in, false) then now() end,
      extensions.digest(v_token, 'sha256'), v_expires, 1, now(),
      private.clean_text(v_src ->> 'utm_source', 100), private.clean_text(v_src ->> 'utm_medium', 100),
      private.clean_text(v_src ->> 'utm_campaign', 100), private.clean_text(v_src ->> 'utm_content', 100),
      private.clean_text(v_src ->> 'utm_term', 100), private.clean_text(v_src ->> 'referrer', 500),
      private.clean_text(v_src ->> 'landing_path', 300),
      v_ip_hash, private.request_user_agent())
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

-- E-Mail-Bestätigung über den Einmal-Link. Erst danach ist die Teilnahme gültig.
create or replace function public.confirm_entry(p_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  e public.entries;
  c public.campaigns;
  v_pool public.prize_pools;
  v_result jsonb;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{48}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;

  select * into e from public.entries
   where confirm_token_hash = extensions.digest(p_token, 'sha256')
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;
  select * into c from public.campaigns where id = e.campaign_id;
  select * into v_pool from public.prize_pools where id = e.pool_id;

  v_result := jsonb_build_object(
    'campaign', c.slug, 'kind', c.kind, 'campaign_title', c.title, 'public_url', c.public_url,
    'first_name', e.first_name, 'prize', v_pool.title, 'draw_on', c.draw_on);

  if e.status = 'confirmed' then
    return v_result || jsonb_build_object('ok', true, 'status', 'already_confirmed');
  elsif e.status <> 'pending' then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;

  if now() > e.confirm_token_expires_at or (not e.is_test and now() > c.ends_at) then
    return v_result || jsonb_build_object('ok', false, 'error', 'expired');
  end if;

  update public.entries set status = 'confirmed', confirmed_at = now() where id = e.id;

  if e.marketing_opt_in then
    insert into public.marketing_consents (email, first_name, source_campaign_id, source_entry_id, consent_text, consented_at, confirmed_at)
    values (e.email, e.first_name, c.id, e.id,
            coalesce((select lp.content #>> '{form,marketing_label}' from public.landing_pages lp where lp.campaign_id = c.id),
                     'Werbeeinwilligung allnova'),
            coalesce(e.marketing_opt_in_at, now()), now());
  end if;

  return v_result || jsonb_build_object('ok', true, 'status', 'confirmed');
end;
$$;

-- Anonyme Interaktionen (z. B. App-CTA nach der Bestätigung, Rechner genutzt).
create or replace function public.track_event(
  p_campaign text,
  p_event text,
  p_meta jsonb default '{}'::jsonb,
  p_source jsonb default '{}'::jsonb,
  p_session text default null
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_campaign_id uuid;
  v_src jsonb := coalesce(p_source, '{}'::jsonb);
begin
  select id into v_campaign_id from public.campaigns
   where slug = p_campaign and (status = 'published' or test_mode);
  if v_campaign_id is null then
    return false;
  end if;
  if pg_column_size(coalesce(p_meta, '{}'::jsonb)) > 2048 then
    return false;
  end if;
  insert into public.events (campaign_id, event_type, session_id, meta, utm_source, utm_medium, utm_campaign, utm_content)
  values (v_campaign_id, p_event, private.clean_text(p_session, 64), coalesce(p_meta, '{}'::jsonb),
          private.clean_text(v_src ->> 'utm_source', 100), private.clean_text(v_src ->> 'utm_medium', 100),
          private.clean_text(v_src ->> 'utm_campaign', 100), private.clean_text(v_src ->> 'utm_content', 100));
  return true;
exception
  when check_violation then
    return false;
end;
$$;

-- ---------------------------------------------------------------------
-- Admin-RPCs
-- ---------------------------------------------------------------------

-- Zufallsziehung je Preispool (kryptografischer Zufall), inkl. Reserveliste und Protokoll.
create or replace function public.admin_draw(
  p_campaign text,
  p_pool text default null,
  p_reserves integer default 3,
  p_drawn_by text default null,
  p_verified_by text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c public.campaigns;
  p public.prize_pools;
  v_draw_id uuid;
  v_count integer;
  v_protocol jsonb := '[]'::jsonb;
  v_selected jsonb;
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into c from public.campaigns where slug = p_campaign;
  if not found then
    raise exception 'campaign % not found', p_campaign;
  end if;
  if now() <= c.ends_at and not c.test_mode then
    raise exception 'Die Teilnahmefrist läuft noch bis %', private.fmt_ts(c.ends_at, c.timezone);
  end if;

  for p in
    select * from public.prize_pools
     where campaign_id = c.id and is_active and (p_pool is null or key = p_pool)
     order by sort_order, key
  loop
    if exists (select 1 from public.draws d where d.pool_id = p.id and d.voided_at is null) then
      raise exception 'Für Pool % existiert bereits eine gültige Ziehung (zuerst voided_at setzen).', p.key;
    end if;

    select count(*) into v_count from public.entries e
     where e.pool_id = p.id and e.status = 'confirmed' and (e.is_test = c.test_mode or not e.is_test);

    insert into public.draws (campaign_id, pool_id, drawn_by, verified_by, method, valid_entry_count, notes)
    values (c.id, p.id, coalesce(p_drawn_by, auth.uid()::text, session_user::text), p_verified_by,
            'Zufällige Reihenfolge aller bestätigten Teilnahmen des Pools via pgcrypto gen_random_bytes (CSPRNG); Rang 1..n = Gewinner, danach Reserve.',
            v_count, p_notes)
    returning id into v_draw_id;

    insert into public.draw_results (draw_id, entry_id, role, rank)
    select v_draw_id, x.id,
           case when x.rn <= p.winners then 'winner'::public.draw_role else 'reserve'::public.draw_role end,
           x.rn
      from (
        select e.id, row_number() over (order by extensions.gen_random_bytes(16)) as rn
          from public.entries e
         where e.pool_id = p.id and e.status = 'confirmed' and (e.is_test = c.test_mode or not e.is_test)
      ) x
     where x.rn <= p.winners + greatest(p_reserves, 0);

    select coalesce(jsonb_agg(jsonb_build_object('rank', r.rank, 'role', r.role, 'entry_id', r.entry_id) order by r.rank), '[]'::jsonb)
      into v_selected
      from public.draw_results r where r.draw_id = v_draw_id;

    v_protocol := v_protocol || jsonb_build_object(
      'draw_id', v_draw_id, 'pool', p.key, 'prize', p.title,
      'valid_entries', v_count, 'winners', p.winners, 'selected', v_selected);
  end loop;

  return jsonb_build_object('campaign', c.slug, 'drawn_at', now(), 'pools', v_protocol);
end;
$$;

-- Nicht-Gewinner (und Reserve) nach Abschluss der Abwicklung anonymisieren. Werbeeinwilligungen bleiben separat erhalten.
create or replace function public.admin_anonymize_campaign(p_campaign text)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_campaign_id uuid;
  v_count integer;
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select id into v_campaign_id from public.campaigns where slug = p_campaign;
  if v_campaign_id is null then
    raise exception 'campaign % not found', p_campaign;
  end if;

  update public.entries e
     set first_name = null, last_name = null, email = null, email_normalized = null,
         postal_code = null, instagram_handle = null, ip_hash = null, user_agent = null, referrer = null,
         confirm_token_hash = null, status = 'anonymized', anonymized_at = now()
   where e.campaign_id = v_campaign_id
     and e.status <> 'anonymized'
     and not exists (
       select 1 from public.draw_results r join public.draws d on d.id = r.draw_id
        where r.entry_id = e.id and d.voided_at is null
          and r.role = 'winner' and r.status in ('selected', 'notified', 'accepted'));
  get diagnostics v_count = row_count;

  update private.email_outbox o set payload = '{}'::jsonb, to_email = 'anonymized'
   where o.campaign_id = v_campaign_id
     and o.entry_id in (select id from public.entries where campaign_id = v_campaign_id and status = 'anonymized');
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------
-- Auswertungen (Views respektieren RLS des Aufrufers → nur Admins)
-- ---------------------------------------------------------------------
create view public.campaign_stats with (security_invoker = true) as
select c.slug as campaign,
       p.key as pool,
       p.title as prize,
       count(e.id) filter (where not e.is_test) as entries_total,
       count(e.id) filter (where e.status = 'confirmed' and not e.is_test) as entries_confirmed,
       count(e.id) filter (where e.status = 'pending' and not e.is_test) as entries_pending,
       count(e.id) filter (where e.marketing_opt_in and e.status = 'confirmed' and not e.is_test) as marketing_opt_ins,
       count(e.id) filter (where e.is_test) as test_entries
  from public.campaigns c
  join public.prize_pools p on p.campaign_id = c.id
  left join public.entries e on e.pool_id = p.id
 group by c.slug, p.key, p.title, p.sort_order
 order by c.slug, p.sort_order;

create view public.campaign_source_stats with (security_invoker = true) as
select c.slug as campaign,
       coalesce(e.utm_source, '(direkt)') as utm_source,
       coalesce(e.utm_medium, '') as utm_medium,
       coalesce(e.utm_content, '') as utm_content,
       count(*) as entries_total,
       count(*) filter (where e.status = 'confirmed') as entries_confirmed
  from public.entries e
  join public.campaigns c on c.id = e.campaign_id
 where not e.is_test
 group by 1, 2, 3, 4;

create view public.campaign_event_stats with (security_invoker = true) as
select c.slug as campaign, ev.event_type, count(*) as events, count(distinct ev.session_id) as sessions
  from public.events ev
  join public.campaigns c on c.id = ev.campaign_id
 group by 1, 2;

-- Exportliste für die Ziehung: nur gültige (bestätigte) Teilnahmen, eine pro Person.
create view public.entries_export with (security_invoker = true) as
select c.slug as campaign, p.key as pool, p.title as prize,
       e.id as entry_id, e.first_name, e.last_name, e.email, e.postal_code, e.canton, e.instagram_handle,
       e.confirmed_at, e.marketing_opt_in, e.utm_source, e.utm_medium, e.utm_campaign, e.utm_content
  from public.entries e
  join public.campaigns c on c.id = e.campaign_id
  join public.prize_pools p on p.id = e.pool_id
 where e.status = 'confirmed' and not e.is_test;

-- ---------------------------------------------------------------------
-- Row Level Security & Rechte
-- ---------------------------------------------------------------------
alter table public.admins enable row level security;
alter table public.campaigns enable row level security;
alter table public.partners enable row level security;
alter table public.prize_pools enable row level security;
alter table public.landing_pages enable row level security;
alter table public.entries enable row level security;
alter table public.marketing_consents enable row level security;
alter table public.events enable row level security;
alter table public.draws enable row level security;
alter table public.draw_results enable row level security;
alter table public.email_templates enable row level security;
alter table private.email_outbox enable row level security;

create policy admins_admin_all on public.admins for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy campaigns_admin_all on public.campaigns for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy partners_admin_all on public.partners for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy prize_pools_admin_all on public.prize_pools for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy landing_pages_admin_all on public.landing_pages for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy entries_admin_all on public.entries for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy marketing_consents_admin_all on public.marketing_consents for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy events_admin_all on public.events for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy draws_admin_all on public.draws for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy draw_results_admin_all on public.draw_results for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy email_templates_admin_all on public.email_templates for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

-- Kein direkter Tabellenzugriff für anonyme Besucher — nur über die RPCs.
revoke all on public.admins, public.campaigns, public.partners, public.prize_pools, public.landing_pages,
              public.entries, public.marketing_consents, public.events, public.draws, public.draw_results,
              public.email_templates from anon;
revoke all on public.campaign_stats, public.campaign_source_stats, public.campaign_event_stats, public.entries_export from anon;
revoke all on sequence public.events_id_seq from anon;

grant usage on schema private to authenticated, service_role;
grant execute on function private.is_admin() to authenticated, service_role;
grant all on private.email_outbox to service_role;
grant execute on function private.mark_email_sent(bigint, text) to service_role;

revoke execute on function public.get_campaign(text), public.confirm_entry(text),
  public.submit_entry(text, text, text, text, text, text, boolean, boolean, text, jsonb, timestamptz, text, text),
  public.track_event(text, text, jsonb, jsonb, text),
  public.admin_draw(text, text, integer, text, text, text), public.admin_anonymize_campaign(text)
  from public, anon, authenticated;
revoke execute on function private.mark_email_sent(bigint, text) from public;
grant execute on function public.get_campaign(text) to anon, authenticated, service_role;
grant execute on function public.submit_entry(text, text, text, text, text, text, boolean, boolean, text, jsonb, timestamptz, text, text) to anon, authenticated, service_role;
grant execute on function public.confirm_entry(text) to anon, authenticated, service_role;
grant execute on function public.track_event(text, text, jsonb, jsonb, text) to anon, authenticated, service_role;
grant execute on function public.admin_draw(text, text, integer, text, text, text) to authenticated, service_role;
grant execute on function public.admin_anonymize_campaign(text) to authenticated, service_role;
