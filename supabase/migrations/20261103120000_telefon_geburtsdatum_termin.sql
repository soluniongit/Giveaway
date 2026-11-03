-- =====================================================================
-- Telefon + Geburtsdatum im Formular (wie allnova.ch/gewinnspiele) und
-- «Termin wahrgenommen» als Voraussetzung für die Ziehung (Steuer-Kampagne).
--
--  * campaigns.collect_contact_details: Formular verlangt Telefon und Geburtsdatum
--    (Alter >= min_age wird serverseitig geprüft). Bestehende Kampagnen: aus.
--  * campaigns.requires_appointment: admin_draw berücksichtigt nur Teilnahmen mit
--    entries.appointment_attended_at (gesetzt über admin_mark_appointment).
--  * submit_entry erhält p_phone / p_birth_date am Ende (mit Default → bisherige Aufrufe bleiben gültig).
-- =====================================================================

alter table public.campaigns
  add column collect_contact_details boolean not null default false,
  add column requires_appointment boolean not null default false;
comment on column public.campaigns.collect_contact_details is 'Formular fragt Telefon und Geburtsdatum ab (Pflicht); Mindestalter = min_age.';
comment on column public.campaigns.requires_appointment is 'Ziehung nur unter bestätigten Teilnahmen mit wahrgenommenem Beratungstermin (entries.appointment_attended_at).';

alter table public.entries
  add column phone text check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  add column birth_date date,
  add column appointment_attended_at timestamptz,
  add column appointment_note text;
comment on column public.entries.phone is 'Telefon im Format +41…; nur bei campaigns.collect_contact_details. Wird bei der Anonymisierung gelöscht.';
comment on column public.entries.birth_date is 'Geburtsdatum (Alterskontrolle); nur bei campaigns.collect_contact_details. Wird bei der Anonymisierung gelöscht.';
comment on column public.entries.appointment_attended_at is 'Beratungstermin wahrgenommen (Kampagnen mit requires_appointment), gesetzt durch das allnova-Team.';

-- alte Signatur entfernen, damit PostgREST die Funktion eindeutig findet
drop function public.submit_entry(text, text, text, text, text, text, boolean, boolean, text, jsonb, timestamptz, text, text);

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
  p_birth_date date default null
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
  if c.collect_contact_details then
    if v_phone like '00%' then v_phone := '+' || substr(v_phone, 3); end if;
    if v_phone ~ '^0[1-9]' then v_phone := '+41' || substr(v_phone, 2); end if;
    v_phone := regexp_replace(v_phone, '^\+410', '+41');   -- «+41 (0)44 …»
    if v_phone is null or v_phone !~ '^\+[1-9][0-9]{7,14}$'
       or (v_phone like '+41%' and v_phone !~ '^\+41[1-9][0-9]{8}$') then
      return jsonb_build_object('ok', false, 'error', 'invalid_phone');
    end if;
    if p_birth_date is null or p_birth_date < date '1900-01-01' or p_birth_date > (now() at time zone c.timezone)::date then
      return jsonb_build_object('ok', false, 'error', 'invalid_birth_date');
    end if;
    if p_birth_date > ((now() at time zone c.timezone)::date - make_interval(years => c.min_age))::date then
      return jsonb_build_object('ok', false, 'error', 'too_young');
    end if;
    v_birth := p_birth_date;
  else
    v_phone := null;
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
               postal_code = v_plz, canton = v_canton, instagram_handle = v_insta, phone = v_phone, birth_date = v_birth,
               consent_terms = true, consent_terms_at = now(), terms_version = c.terms_version,
               marketing_opt_in = coalesce(p_marketing_opt_in, false),
               marketing_opt_in_at = case when coalesce(p_marketing_opt_in, false) then now() end,
               referred_by = coalesce(referred_by, v_ref_id)
         where id = v_existing.id;
        return jsonb_build_object('ok', true, 'status', 'check_email');
      end if;
      update public.entries
         set pool_id = v_pool_id, first_name = v_first, last_name = v_last, email = v_email,
             postal_code = v_plz, canton = v_canton, instagram_handle = v_insta, phone = v_phone, birth_date = v_birth,
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
      campaign_id, pool_id, is_test, first_name, last_name, email, email_normalized, postal_code, canton, instagram_handle, phone, birth_date,
      consent_terms, consent_terms_at, terms_version, marketing_opt_in, marketing_opt_in_at,
      confirm_token_hash, confirm_token_expires_at, confirmation_sent_count, last_confirmation_sent_at,
      utm_source, utm_medium, utm_campaign, utm_content, utm_term, referrer, landing_path,
      ip_hash, user_agent, share_code, referred_by)
    values (
      c.id, v_pool_id, v_is_test, v_first, v_last, v_email, v_email, v_plz, v_canton, v_insta, v_phone, v_birth,
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

revoke execute on function public.submit_entry(text, text, text, text, text, text, boolean, boolean, text, jsonb, timestamptz, text, text, text, date) from public, anon, authenticated;
grant execute on function public.submit_entry(text, text, text, text, text, text, boolean, boolean, text, jsonb, timestamptz, text, text, text, date) to anon, authenticated, service_role;

-- Termin wahrgenommen markieren (Admin, z. B. nach dem Beratungsgespräch)
create or replace function public.admin_mark_appointment(p_campaign text, p_email text, p_attended boolean default true, p_note text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.entries e
     set appointment_attended_at = case when p_attended then coalesce(e.appointment_attended_at, now()) end,
         appointment_note = coalesce(private.clean_text(p_note, 300), e.appointment_note)
    from public.campaigns c
   where c.id = e.campaign_id and c.slug = p_campaign
     and e.email_normalized = lower(trim(p_email))
  returning e.id into v_id;
  if v_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true, 'entry_id', v_id, 'attended', p_attended);
end;
$$;
revoke execute on function public.admin_mark_appointment(text, text, boolean, text) from public, anon, authenticated;
grant execute on function public.admin_mark_appointment(text, text, boolean, text) to authenticated, service_role;

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
     where e.pool_id = p.id and e.status = 'confirmed' and (e.is_test = c.test_mode or not e.is_test) and (not c.requires_appointment or e.appointment_attended_at is not null);

    insert into public.draws (campaign_id, pool_id, drawn_by, verified_by, method, valid_entry_count, ticket_count, notes)
    values (c.id, p.id, coalesce(p_drawn_by, auth.uid()::text, session_user::text), p_verified_by,
            case when c.requires_appointment then 'Nur Teilnahmen mit wahrgenommenem Termin. ' else '' end || 'Gewichtete Zufallsreihenfolge aller bestätigten Teilnahmen des Pools (Efraimidis-Spirakis: Schlüssel -ln(u)/Lose, u aus pgcrypto gen_random_bytes/CSPRNG; Lose = 1 + Bonuslos durch Einladung); Rang 1..n = Gewinner, danach Reserve.',
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
             where e.pool_id = p.id and e.status = 'confirmed' and (e.is_test = c.test_mode or not e.is_test) and (not c.requires_appointment or e.appointment_attended_at is not null)
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
         postal_code = null, instagram_handle = null, phone = null, birth_date = null, ip_hash = null, user_agent = null, referrer = null,
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

create or replace view public.entries_export with (security_invoker = true) as
select c.slug as campaign, p.key as pool, p.title as prize,
       e.id as entry_id, e.first_name, e.last_name, e.email, e.postal_code, e.canton, e.instagram_handle,
       e.confirmed_at, e.marketing_opt_in, e.utm_source, e.utm_medium, e.utm_campaign, e.utm_content,
       private.bonus_entries(e.id) as bonus_entries, e.referred_by as referred_by_entry_id,
       e.phone, e.birth_date, e.appointment_attended_at
  from public.entries e
  join public.campaigns c on c.id = e.campaign_id
  join public.prize_pools p on p.id = e.pool_id
 where e.status = 'confirmed' and not e.is_test;
revoke all on public.entries_export from anon;
