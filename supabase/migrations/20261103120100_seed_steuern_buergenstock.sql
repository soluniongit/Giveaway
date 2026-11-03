-- =====================================================================
-- Zwei neue Kampagnen (gewinnspiel.allnova.ch) – Startdaten, status = 'draft'.
-- Freischalten erst nach Freigabe von Laufzeit, Bedingungen und Mailversand:
--   update public.campaigns set status = 'published' where slug in ('steuern-2027', 'buergenstock-2026');
--
-- 1) steuern-2027: Erste Steuererklärung bei allnova gratis (dank KI) + Verlosung CHF 1'000
--    unter allen, die über das Formular einen Beratungstermin anfragen, bestätigen und wahrnehmen.
--    Ohne Einladungs-Bonus (referral_bonus_max = 0). Ziehung nur mit appointment_attended_at.
--    Anmeldung bis 31.03.2027, Termin wahrnehmen bis 15.04.2027, Auslosung 20.04.2027.
-- 2) buergenstock-2026: Gutschein CHF 150 für das Bürgenstock Hotel. Mit Einladungs-Bonus (max. 1).
--    Teilnahme 16.11.–14.12.2026, Auslosung 15.12.2026.
-- Beide: Telefon + Geburtsdatum im Formular (collect_contact_details).
-- =====================================================================

insert into public.campaigns (
  slug, kind, status, title, tagline, summary, public_url, confirm_url,
  starts_at, ends_at, draw_on, redeem_until, allowed_cantons, requires_pool_choice, terms_version,
  referral_bonus_max, collect_contact_details, requires_appointment
) values (
  'steuern-2027', 'giveaway', 'draft',
  'allnova Steuer-Gewinnspiel',
  'Erste Steuererklärung gratis – und CHF 1''000 gewinnen.',
  'Dank KI ist die erste Steuererklärung bei allnova gratis. Unter allen, die einen Beratungstermin wahrnehmen, verlosen wir CHF 1''000.',
  'https://gewinnspiel.allnova.ch/steuern/',
  'https://gewinnspiel.allnova.ch/bestaetigen/',
  '2026-11-03 00:00:00 Europe/Zurich', '2027-03-31 23:59:59 Europe/Zurich',
  '2027-04-20', null, '{}', false, 'steuern-2027-v1',
  0, true, true
), (
  'buergenstock-2026', 'giveaway', 'draft',
  'Bürgenstock-Giveaway',
  'Gewinne einen Gutschein über CHF 150 für das Bürgenstock Hotel.',
  '1 Person gewinnt einen Gutschein im Wert von CHF 150 für das Bürgenstock Hotel.',
  'https://gewinnspiel.allnova.ch/buergenstock/',
  'https://gewinnspiel.allnova.ch/bestaetigen/',
  '2026-11-16 00:00:00 Europe/Zurich', '2026-12-14 23:59:59 Europe/Zurich',
  '2026-12-15', null, '{}', false, 'buergenstock-2026-v1',
  1, true, false
);

insert into public.prize_pools (campaign_id, key, partner_id, title, short_title, description, winners, details, sort_order)
select c.id, 'hauptpreis', null,
       'CHF 1''000 per Überweisung',
       'CHF 1''000',
       'Verlosung von CHF 1''000 unter allen bestätigten Teilnahmen mit wahrgenommenem Beratungstermin. Auszahlung per Banküberweisung auf ein Schweizer Konto der Gewinnperson.',
       1,
       '{"type": "geldpreis", "amount_chf": 1000, "requires_appointment": true}'::jsonb,
       1
  from public.campaigns c where c.slug = 'steuern-2027';

insert into public.prize_pools (campaign_id, key, partner_id, title, short_title, description, winners, details, sort_order)
select c.id, 'hauptpreis', null,
       'Gutschein CHF 150 für das Bürgenstock Hotel',
       'Bürgenstock CHF 150',
       'Ein Wertgutschein über CHF 150 für das Bürgenstock Hotel am Vierwaldstättersee, einlösbar gemäss den Bedingungen des Hotels. Versand kostenlos an eine Adresse in der Schweiz.',
       1,
       '{"type": "gutschein", "value_chf": 150, "shipping": "CH"}'::jsonb,
       1
  from public.campaigns c where c.slug = 'buergenstock-2026';

insert into public.landing_pages (campaign_id, path, seo_title, seo_description, video_url, content)
select c.id, '/steuern/',
       'Erste Steuererklärung gratis + CHF 1''000 gewinnen | allnova',
       'Dank KI ist deine erste Steuererklärung bei allnova gratis. Termin anfragen und CHF 1''000 gewinnen – ab 18, Wohnsitz in der Schweiz.',
       null,
       $json${
  "legal_status": "Entwurf – Bedingungen (Verlosung mit Termin) vor Veröffentlichung rechtlich prüfen lassen.",
  "form": {"submit": "Termin anfragen & mitmachen"},
  "confirmation": {
    "title": "Deine Anfrage ist bestätigt.",
    "text": "Wir melden uns innert 2 Arbeitstagen für deinen Beratungstermin. Mit dem wahrgenommenen Termin bist du bei der Verlosung von CHF 1'000 dabei."
  },
  "contact": {"email": "steuern@allnova.ch", "phone": "+41 44 687 55 44"}
}$json$::jsonb
  from public.campaigns c where c.slug = 'steuern-2027';

insert into public.landing_pages (campaign_id, path, seo_title, seo_description, video_url, content)
select c.id, '/buergenstock/',
       'Giveaway: Gewinne CHF 150 für das Bürgenstock Hotel | allnova',
       'allnova verlost einen Gutschein über CHF 150 für das Bürgenstock Hotel. Kostenlos mitmachen bis 14.12.2026 – ab 18, Wohnsitz in der Schweiz.',
       null,
       $json${
  "legal_status": "Entwurf – Bedingungen vor Veröffentlichung fachlich prüfen lassen.",
  "form": {"submit": "Kostenlos teilnehmen"},
  "platform_note": "Veranstalterin ist Allfinanz Consulting GmbH / allnova. Das Giveaway steht in keiner Verbindung zu Instagram, Facebook oder den Bürgenstock Hotels; der Gutschein wurde von der Veranstalterin erworben."
}$json$::jsonb
  from public.campaigns c where c.slug = 'buergenstock-2026';
