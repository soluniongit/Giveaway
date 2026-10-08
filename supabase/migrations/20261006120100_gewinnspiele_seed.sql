-- =====================================================================
-- allnova Giveaway «PS5 Pro + GTA VI» — Startdaten (gewinnspiel.allnova.ch)
--
-- Startet als status = 'draft'. Freischalten erst nach Freigabe von Preis,
-- Teilnahmebedingungen, Mailversand und Instagram-Beitrag:
--   update public.campaigns set status = 'published' where slug = 'ps5-gta6-2026';
-- Teilnahmeschluss 18.11.2026, 23:59 (Europe/Zurich); Auslosung 19.11.2026.
-- Die Seite selbst (web/ps5-gta6/index.html; Übersicht aller Giveaways: web/index.html) enthält FAQ und Bedingungen als HTML;
-- landing_pages.content trägt hier nur die Texte für Formular und Bestätigung.
-- =====================================================================

insert into public.campaigns (
  slug, kind, status, title, tagline, summary, public_url, confirm_url,
  starts_at, ends_at, draw_on, redeem_until, allowed_cantons, requires_pool_choice, terms_version
) values (
  'ps5-gta6-2026', 'giveaway', 'draft',
  'PS5 Pro + GTA VI Giveaway',
  'Gewinne eine PS5 Pro mit GTA VI.',
  '1 Person gewinnt eine PlayStation 5 Pro mit Grand Theft Auto VI für PS5.',
  'https://gewinnspiel.allnova.ch/ps5-gta6/',
  'https://gewinnspiel.allnova.ch/bestaetigen/',
  '2026-10-08 00:00:00 Europe/Zurich', '2026-11-18 23:59:59 Europe/Zurich',
  '2026-11-19', null, '{}', false, 'ps5-gta6-2026-v1'
);

insert into public.prize_pools (campaign_id, key, partner_id, title, short_title, description, winners, details, sort_order)
select c.id, 'hauptpreis', null,
       'PlayStation 5 Pro + Grand Theft Auto VI',
       'PS5 Pro + GTA VI',
       'Eine PlayStation 5 Pro mit DualSense Wireless-Controller und das Spiel Grand Theft Auto VI für PS5. Versand kostenlos an eine Adresse in der Schweiz; das Spiel wird nachgeliefert, falls es bei der Gewinnabwicklung noch nicht erhältlich ist.',
       1,
       '{"type": "sachpreis", "items": ["PlayStation 5 Pro", "Grand Theft Auto VI (PS5)"], "shipping": "CH"}'::jsonb,
       1
  from public.campaigns c where c.slug = 'ps5-gta6-2026';

insert into public.landing_pages (campaign_id, path, seo_title, seo_description, video_url, content)
select c.id, '/ps5-gta6/',
       'Giveaway: Gewinne eine PS5 Pro + GTA VI | allnova',
       'allnova verlost eine PlayStation 5 Pro mit Grand Theft Auto VI. Kostenlos mitmachen bis 18.11.2026 – ab 18, Wohnsitz in der Schweiz.',
       null,
       $json${
  "legal_status": "Entwurf – Bedingungen vor Veröffentlichung fachlich prüfen lassen.",
  "hero": {
    "headline": "Gewinne eine PS5 Pro + GTA VI.",
    "subline": "allnova verlost eine PlayStation 5 Pro mit Grand Theft Auto VI. Kostenlos mitmachen – bis am 18. November.",
    "cta": "Jetzt teilnehmen"
  },
  "form": {
    "submit": "Kostenlos teilnehmen",
    "consent_label": "Ich bin mindestens 18 Jahre alt, wohne in der Schweiz und akzeptiere die Teilnahmebedingungen.",
    "marketing_label": "Freiwillig: Ich möchte per E-Mail Tipps und Angebote von allnova erhalten. Ich kann mich jederzeit abmelden. Meine Teilnahme und Gewinnchance sind davon unabhängig.",
    "success_title": "Fast geschafft – bitte bestätige deine E-Mail.",
    "success_text": "Wir haben dir einen Bestätigungslink geschickt. Erst mit der Bestätigung ist deine Teilnahme gültig."
  },
  "confirmation": {
    "title": "Deine Teilnahme ist bestätigt.",
    "text": "Entdecke jetzt regionale Vorteile in der allnova App.",
    "app_cta": "allnova App entdecken",
    "later": "Später",
    "note": "Zusätzliche Lose gibt es nur über deinen Einladungslink – nicht für App, Newsletter, Beratung oder Instagram."
  },
  "instagram": {"profile": "https://www.instagram.com/allnova.ch/", "post": null},
  "platform_note": "Veranstalterin ist Allfinanz Consulting GmbH / allnova. Dieses Giveaway wird weder von Instagram noch Facebook gesponsert, unterstützt oder organisiert und steht in keiner Verbindung zu diesen Plattformen, zu Sony Interactive Entertainment, Rockstar Games oder Take-Two Interactive.",
  "contact": {"email": "info@allnova.ch", "phone": "+41 44 687 55 44", "address": "Allfinanz Consulting GmbH, Chaltenbodenstrasse 26, 8834 Schindellegi"}
}$json$::jsonb
  from public.campaigns c where c.slug = 'ps5-gta6-2026';

-- ---------------------------------------------------------------------
-- Mail-Vorlagen (global)
-- ---------------------------------------------------------------------
insert into public.email_templates (campaign_id, key, subject, body_text) values
(null, 'confirm_entry', 'Bitte bestätige deine Teilnahme: {{campaign_title}}',
$t$Hallo {{first_name}}

Danke für deine Teilnahme am {{campaign_title}} von allnova.

Bitte bestätige deine E-Mail-Adresse, damit deine Teilnahme gültig wird:
{{confirm_url}}

Die Bestätigung ist keine Newsletter-Anmeldung. Bitte bestätige bis {{ends_at}}.

Dein allnova Team

Allfinanz Consulting GmbH, Chaltenbodenstrasse 26, 8834 Schindellegi, info@allnova.ch$t$),
(null, 'already_registered', 'Du nimmst bereits teil: {{campaign_title}}',
$t$Hallo {{first_name}}

Deine Teilnahme am {{campaign_title}} ist bereits bestätigt – du musst nichts weiter tun. Pro Person ist eine Teilnahme möglich.

Dein allnova Team

Allfinanz Consulting GmbH, Chaltenbodenstrasse 26, 8834 Schindellegi, info@allnova.ch$t$),
(null, 'winner_notification', 'Du hast gewonnen: {{campaign_title}}',
$t$Hallo {{first_name}}

Herzlichen Glückwunsch! Du wurdest beim {{campaign_title}} gezogen: {{prize}}.

Bitte antworte innerhalb von 7 Kalendertagen auf diese E-Mail und nenne uns eine Lieferadresse in der Schweiz – den Versand übernehmen wir. Wir verlangen keine Zahlungsdaten, Gebühren oder Passwörter.

Dein allnova Team

Allfinanz Consulting GmbH, Chaltenbodenstrasse 26, 8834 Schindellegi, info@allnova.ch$t$);
