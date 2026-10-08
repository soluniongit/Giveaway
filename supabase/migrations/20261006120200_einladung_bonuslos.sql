-- Teilen für doppelte Chance: persönlicher Einladungslink je bestätigter Teilnahme.
-- Ein Bonuslos (max. campaigns.referral_bonus_max, Standard 1) entsteht erst, wenn eine andere Person
-- über den Link teilnimmt UND ihre Teilnahme per E-Mail bestätigt. Belohnt wird also nicht das Teilen
-- selbst (nicht überprüfbar, Plattformregeln), sondern eine zusätzliche gültige Teilnahme.
-- Rechtlicher Rahmen (CH): Teilnahme bleibt gratis und ohne Kauf → kein Geldspiel im Sinne des BGS;
-- Bedingungen transparent in den Teilnahmebedingungen (UWG); keine Einladungs-Mails durch allnova (kein Spam).

alter table public.campaigns
  add column referral_bonus_max smallint not null default 1 check (referral_bonus_max between 0 and 3);
comment on column public.campaigns.referral_bonus_max is 'Max. Bonuslose pro Person durch Einladungen (0 = Funktion aus, 1 = doppelte Chance).';

alter table public.entries
  add column share_code text unique check (share_code ~ '^[a-z2-9]{8}$'),
  add column referred_by uuid references public.entries (id) on delete set null;
create index entries_referred_by_idx on public.entries (referred_by) where referred_by is not null;
comment on column public.entries.share_code is 'Persönlicher Code für den Einladungslink (?ref=…). Wird bei der Anonymisierung gelöscht.';
comment on column public.entries.referred_by is 'Teilnahme, über deren Einladungslink diese Teilnahme kam.';

alter table public.events drop constraint events_event_type_check;
alter table public.events add constraint events_event_type_check check (event_type in (
  'page_view', 'video_play', 'calculator_used', 'quiz_completed', 'roadmap_used', 'pool_selected',
  'form_started', 'form_submitted', 'app_cta_click', 'app_later_click', 'partner_link_click', 'share_click',
  'referral_visit', 'invite_share', 'invite_copy', 'invite_whatsapp', 'instagram_click', 'instagram_embed_load'));

alter table public.draws add column ticket_count integer;
comment on column public.draws.ticket_count is 'Anzahl Lose im Pool (gültige Teilnahmen + Bonuslose) zum Zeitpunkt der Ziehung.';

-- 8 Zeichen ohne verwechselbare Zeichen (0/o, 1/l/i): 31^8 ≈ 8.5·10^11 Kombinationen
create or replace function private.new_share_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_alpha constant text := 'abcdefghjkmnpqrstuvwxyz23456789';
  v_bytes bytea;
  v_code text;
begin
  loop
    v_bytes := extensions.gen_random_bytes(8);
    v_code := '';
    for i in 0..7 loop
      v_code := v_code || substr(v_alpha, 1 + get_byte(v_bytes, i) % 31, 1);
    end loop;
    exit when not exists (select 1 from public.entries where share_code = v_code);
  end loop;
  return v_code;
end;
$$;

-- Gleichverteilte Zufallszahl in (0, 1] aus dem CSPRNG (56 Bit)
create or replace function private.random_unit()
returns double precision
language sql
volatile
set search_path = ''
as $$
  select ((('x' || encode(extensions.gen_random_bytes(7), 'hex'))::bit(56)::bigint)::double precision + 1)
         / 72057594037927936::double precision;
$$;

-- Bonuslose einer Teilnahme: bestätigte Einladungen derselben Kampagne, gedeckelt.
-- Nicht gezählt: gleiche E-Mail, gleicher Internetanschluss (kampagnenbezogener IP-Hash), Test vs. echt gemischt.
create or replace function private.bonus_entries(p_entry uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select coalesce(least(max(c.referral_bonus_max), count(f.id)), 0)::integer
    from public.entries e
    join public.campaigns c on c.id = e.campaign_id
    left join public.entries f
      on f.referred_by = e.id
     and f.status = 'confirmed'
     and f.is_test = e.is_test
     and f.email_normalized is distinct from e.email_normalized
     and (e.ip_hash is null or f.ip_hash is null or f.ip_hash <> e.ip_hash)
   where e.id = p_entry;
$$;

-- Einladungsinfo für die Bestätigungsseite (Code wird bei Bedarf nachträglich vergeben)
create or replace function private.share_info(p_entry uuid)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_code text;
  v_max smallint;
begin
  select e.share_code, c.referral_bonus_max into v_code, v_max
    from public.entries e join public.campaigns c on c.id = e.campaign_id
   where e.id = p_entry;
  if coalesce(v_max, 0) = 0 then
    return '{}'::jsonb;
  end if;
  if v_code is null then
    v_code := private.new_share_code();
    update public.entries set share_code = v_code where id = p_entry;
  end if;
  return jsonb_build_object('share_code', v_code, 'bonus_entries', private.bonus_entries(p_entry), 'bonus_max', v_max);
end;
$$;

revoke execute on function private.new_share_code(), private.random_unit(), private.bonus_entries(uuid), private.share_info(uuid) from public;
grant execute on function private.bonus_entries(uuid) to authenticated, service_role;
grant execute on function private.random_unit() to service_role;

-- ---------------------------------------------------------------------
-- RPCs mit Einladungslogik (Signaturen unverändert → Rechte bleiben bestehen)
-- ---------------------------------------------------------------------
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
      'referral_bonus_max', c.referral_bonus_max
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
  v_ref_id uuid;
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
               postal_code = v_plz, canton = v_canton, instagram_handle = v_insta,
               consent_terms = true, consent_terms_at = now(), terms_version = c.terms_version,
               marketing_opt_in = coalesce(p_marketing_opt_in, false),
               marketing_opt_in_at = case when coalesce(p_marketing_opt_in, false) then now() end,
               referred_by = coalesce(referred_by, v_ref_id)
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
      campaign_id, pool_id, is_test, first_name, last_name, email, email_normalized, postal_code, canton, instagram_handle,
      consent_terms, consent_terms_at, terms_version, marketing_opt_in, marketing_opt_in_at,
      confirm_token_hash, confirm_token_expires_at, confirmation_sent_count, last_confirmation_sent_at,
      utm_source, utm_medium, utm_campaign, utm_content, utm_term, referrer, landing_path,
      ip_hash, user_agent, share_code, referred_by)
    values (
      c.id, v_pool_id, v_is_test, v_first, v_last, v_email, v_email, v_plz, v_canton, v_insta,
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
    return v_result || private.share_info(e.id) || jsonb_build_object('ok', true, 'status', 'already_confirmed');
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

  return v_result || private.share_info(e.id) || jsonb_build_object('ok', true, 'status', 'confirmed');
end;
$$;

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
  v_tickets integer;
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

    select count(*), coalesce(sum(1 + private.bonus_entries(e.id)), 0) into v_count, v_tickets from public.entries e
     where e.pool_id = p.id and e.status = 'confirmed' and (e.is_test = c.test_mode or not e.is_test);

    insert into public.draws (campaign_id, pool_id, drawn_by, verified_by, method, valid_entry_count, ticket_count, notes)
    values (c.id, p.id, coalesce(p_drawn_by, auth.uid()::text, session_user::text), p_verified_by,
            'Gewichtete Zufallsreihenfolge aller bestätigten Teilnahmen des Pools (Efraimidis-Spirakis: Schlüssel -ln(u)/Lose, u aus pgcrypto gen_random_bytes/CSPRNG; Lose = 1 + Bonuslos durch Einladung); Rang 1..n = Gewinner, danach Reserve.',
            v_count, v_tickets, p_notes)
    returning id into v_draw_id;

    insert into public.draw_results (draw_id, entry_id, role, rank)
    select v_draw_id, x.id,
           case when x.rn <= p.winners then 'winner'::public.draw_role else 'reserve'::public.draw_role end,
           x.rn
      from (
        select w.id, row_number() over (order by -ln(private.random_unit()) / w.tickets) as rn
          from (
            select e.id, 1 + private.bonus_entries(e.id) as tickets
              from public.entries e
             where e.pool_id = p.id and e.status = 'confirmed' and (e.is_test = c.test_mode or not e.is_test)
          ) w
      ) x
     where x.rn <= p.winners + greatest(p_reserves, 0);

    select coalesce(jsonb_agg(jsonb_build_object('rank', r.rank, 'role', r.role, 'entry_id', r.entry_id,
                                              'tickets', 1 + private.bonus_entries(r.entry_id)) order by r.rank), '[]'::jsonb)
      into v_selected
      from public.draw_results r where r.draw_id = v_draw_id;

    v_protocol := v_protocol || jsonb_build_object(
      'draw_id', v_draw_id, 'pool', p.key, 'prize', p.title,
      'valid_entries', v_count, 'tickets', v_tickets, 'winners', p.winners, 'selected', v_selected);
  end loop;

  return jsonb_build_object('campaign', c.slug, 'drawn_at', now(), 'pools', v_protocol);
end;
$$;

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
         confirm_token_hash = null, share_code = null, status = 'anonymized', anonymized_at = now()
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
-- Auswertungen
-- ---------------------------------------------------------------------
create or replace view public.entries_export with (security_invoker = true) as
select c.slug as campaign, p.key as pool, p.title as prize,
       e.id as entry_id, e.first_name, e.last_name, e.email, e.postal_code, e.canton, e.instagram_handle,
       e.confirmed_at, e.marketing_opt_in, e.utm_source, e.utm_medium, e.utm_campaign, e.utm_content,
       private.bonus_entries(e.id) as bonus_entries, e.referred_by as referred_by_entry_id
  from public.entries e
  join public.campaigns c on c.id = e.campaign_id
  join public.prize_pools p on p.id = e.pool_id
 where e.status = 'confirmed' and not e.is_test;

create view public.campaign_referral_stats with (security_invoker = true) as
select c.slug as campaign,
       count(f.id) filter (where f.referred_by is not null) as invited_entries,
       count(f.id) filter (where f.referred_by is not null and f.status = 'confirmed') as invited_confirmed,
       count(distinct f.referred_by) filter (where f.status = 'confirmed') as inviters
  from public.campaigns c
  left join public.entries f on f.campaign_id = c.id and not f.is_test
 group by c.slug;
revoke all on public.entries_export, public.campaign_referral_stats from anon;
