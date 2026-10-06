-- =====================================================================
-- allnova Gewinnspiele — Startdaten (gem. Marketingkonzept 06.10.2026)
--
-- Beide Kampagnen starten als status = 'draft'. Freischalten erst nach
-- den sechs Freigaben aus dem Konzept (Gewinne, App-Gegenleistung,
-- Teilnahme, Kommunikation, Messung, Betrieb):
--   update public.campaigns set status = 'published' where slug = '…';
-- Termine, Regionen und Gewinne sind Planungsvorschläge, keine Zusagen.
-- =====================================================================

insert into public.campaigns (
  slug, kind, status, title, tagline, summary, public_url, confirm_url,
  starts_at, ends_at, draw_on, redeem_until, allowed_cantons, requires_pool_choice, terms_version
) values
(
  'steuern-2027', 'steuer', 'draft',
  'Steuergewinnspiel',
  '3 Jahre. Steuererklärung. Gratis.',
  '1 Person gewinnt 3 kostenlose Steuererklärungen für die Steuerjahre 2026, 2027 und 2028.',
  'https://www.allnova.ch/gewinnen/steuern',
  'https://www.allnova.ch/gewinnen/bestaetigen',
  '2027-02-01 09:00:00 Europe/Zurich', '2027-02-28 23:59:59 Europe/Zurich',
  '2027-03-02', null, '{ZH,SZ,ZG,SG}', false, 'steuern-2027-v1'
),
(
  'fahrstart-2026', 'fahrstart', 'draft',
  'Fahrstart-Gewinnspiel',
  'Dein Start. Dein Führerausweis.',
  '2 × 2 Fahrlektionen + 1 × VKU-Kursplatz gewinnen. Drei Gewinne für drei Personen.',
  'https://www.allnova.ch/gewinnen/fahrstart',
  'https://www.allnova.ch/gewinnen/bestaetigen',
  '2026-11-02 09:00:00 Europe/Zurich', '2026-11-29 23:59:59 Europe/Zurich',
  '2026-12-01', '2027-05-31', '{ZH,SZ,ZG,SG}', true, 'fahrstart-2026-v1'
);

-- Preispartner Fahrstart: neutral bis zur schriftlichen Zusage
insert into public.partners (campaign_id, label, status, notes)
select c.id, x.label, 'angefragt', x.notes
  from public.campaigns c,
       (values ('Anbieter A', 'Fahrschule: 2 × 50 Min. Fahrunterricht Kat. B inkl. Pflichtzuschläge'),
               ('Anbieter B', 'Fahrschule: 2 × 50 Min. Fahrunterricht Kat. B inkl. Pflichtzuschläge'),
               ('Anbieter C', 'VKU-Anbieter: 1 Platz in einem vollständigen anerkannten VKU inkl. Unterlagen')) as x(label, notes)
 where c.slug = 'fahrstart-2026';

insert into public.prize_pools (campaign_id, key, partner_id, title, short_title, description, winners, details, sort_order)
select c.id, 'paket', null,
       'Steuerpaket 2026–2028',
       '3 Steuererklärungen',
       'Erstellung und Einreichung je einer privaten Standard-Steuererklärung für die Steuerjahre 2026, 2027 und 2028.',
       1,
       '{"type": "steuer", "tax_years": [2026, 2027, 2028], "processing_years": [2027, 2028, 2029],
         "included": ["Unterlagenprüfung", "Erstellung", "Eine normale Rückfragerunde", "Einreichung"],
         "excluded": ["Steuerzahlungen (deine Steuerrechnung)", "Einsprachen", "Treuhand-Sondermandate", "Behördliche Gebühren"]}'::jsonb,
       1
  from public.campaigns c where c.slug = 'steuern-2027';

insert into public.prize_pools (campaign_id, key, partner_id, title, short_title, description, winners, details, sort_order)
select c.id, x.key, pa.id, x.title, x.short_title, x.description, 1, x.details::jsonb, x.sort_order
  from public.campaigns c
  join (values
    ('a', 'Anbieter A', '2 Fahrlektionen à 50 Minuten', '2 Fahrlektionen',
     'Paket mit 2 × 50 Minuten Fahrunterricht Kategorie B. Pflichtkosten für das Paket sind eingeschlossen.',
     '{"type": "fahrlektionen", "lessons": 2, "minutes": 50, "category": "B", "redeem_until": "2027-05-31"}', 1),
    ('b', 'Anbieter B', '2 Fahrlektionen à 50 Minuten', '2 Fahrlektionen',
     'Paket mit 2 × 50 Minuten Fahrunterricht Kategorie B. Pflichtkosten für das Paket sind eingeschlossen.',
     '{"type": "fahrlektionen", "lessons": 2, "minutes": 50, "category": "B", "redeem_until": "2027-05-31"}', 2),
    ('c', 'Anbieter C', '1 vollständiger VKU-Kursplatz', 'VKU-Kursplatz',
     'Ein Platz in einem vollständigen, anerkannten Verkehrskundeunterricht (VKU) inkl. Kursunterlagen.',
     '{"type": "vku", "redeem_until": "2027-05-31"}', 3)
  ) as x(key, label, title, short_title, description, details, sort_order) on true
  join public.partners pa on pa.campaign_id = c.id and pa.label = x.label
 where c.slug = 'fahrstart-2026';

-- ---------------------------------------------------------------------
-- Seiteninhalte
-- ---------------------------------------------------------------------
insert into public.landing_pages (campaign_id, path, seo_title, seo_description, video_url, content)
select c.id, '/gewinnen/steuern',
       'Gewinnspiel: 3 Jahre Steuererklärung gratis | allnova',
       'Gewinne die kostenlose Erstellung und Einreichung deiner privaten Standard-Steuererklärung für 2026, 2027 und 2028. Teilnahme kostenlos, ab 18, Wohnsitz ZH, SZ, ZG oder SG.',
       '/gewinnen/assets/video/allnova-steuergewinnspiel-30s.mp4',
       $json${
  "legal_status": "Entwurf – Bedingungen vor Veröffentlichung fachlich prüfen lassen.",
  "hero": {
    "eyebrow": "Gewinnspiel",
    "headline": "3 Jahre. Steuererklärung. Gratis.",
    "subline": "1 Person gewinnt 3 kostenlose Steuererklärungen für die Steuerjahre 2026, 2027 und 2028.",
    "cta": "Kostenlos teilnehmen"
  },
  "intro": "Weniger Papierkram für drei Steuerjahre. Gewinne die kostenlose Erstellung und Einreichung deiner privaten Standard-Steuererklärung für 2026, 2027 und 2028. Eine Person gewinnt das gesamte Paket. Prüfe den Leistungsumfang und nimm kostenlos teil.",
  "benefit": "Für drei Steuerjahre ist die Erstellung deiner Steuererklärung organisiert.",
  "scope": {
    "included": ["Unterlagenprüfung", "Erstellung", "Eine normale Rückfragerunde", "Einreichung"],
    "excluded": ["Steuerzahlungen (deine Steuerrechnung)", "Einsprachen", "Treuhand-Sondermandate", "Behördliche Gebühren"],
    "standard_dossier": "Unselbstständig Erwerbende oder Personen ohne Erwerbseinkommen; gemeinsam veranlagte Paare zählen als ein Dossier. Komplexe Fälle wie Selbstständigkeit oder ausländische Liegenschaften sind nicht Teil des Gewinns."
  },
  "steps": [
    {"title": "Öffnen", "text": "Gewinnspielseite öffnen und Leistungsumfang lesen."},
    {"title": "Ausfüllen", "text": "Vorname, Nachname, E-Mail, PLZ und Kanton eingeben und 18+ bestätigen."},
    {"title": "Bestätigen", "text": "E-Mail über den einmaligen Link bestätigen – erst dann ist die Teilnahme gültig."}
  ],
  "form": {
    "submit": "Kostenlos teilnehmen",
    "consent_label": "Ich bin mindestens 18 Jahre alt, wohne in einem zugelassenen Kanton und akzeptiere die Teilnahmebedingungen.",
    "marketing_label": "Ich möchte per E-Mail Tipps und Angebote von allnova erhalten. Ich kann mich jederzeit abmelden. Meine Teilnahme und Gewinnchance sind davon unabhängig.",
    "privacy_notice": "Allfinanz Consulting GmbH verwendet deine Angaben zur Prüfung und Durchführung des Gewinnspiels und zur Gewinnerbenachrichtigung. Weitere Informationen zu Speicherung, Empfängern und deinen Rechten findest du in den Datenschutzhinweisen.",
    "success_title": "Fast geschafft – bitte bestätige deine E-Mail.",
    "success_text": "Wir haben dir einen Bestätigungslink geschickt. Bitte bestätige deine E-Mail-Adresse, damit deine Teilnahme gültig wird. Die Bestätigung ist keine Newsletter-Anmeldung."
  },
  "confirmation": {
    "title": "Deine Teilnahme ist bestätigt.",
    "text": "Entdecke jetzt regionale Vorteile in der allnova App.",
    "app_cta": "allnova App entdecken",
    "app_url": null,
    "later": "Später",
    "note": "Für Installation, Newsletter oder Beratung gibt es keine zusätzlichen Lose."
  },
  "faq": [
    {"q": "Was genau gewinne ich?", "a": "Die Erstellung und Einreichung je einer privaten Standard-Steuererklärung für die Steuerjahre 2026, 2027 und 2028 – bearbeitet üblicherweise 2027, 2028 und 2029. Dazu gehören Unterlagenprüfung, Erstellung, eine normale Rückfragerunde und die Einreichung."},
    {"q": "Bezahlt allnova meine Steuern?", "a": "Nein. Deine Steuerrechnung bezahlst du weiterhin selbst. Ebenfalls nicht enthalten sind Einsprachen, Treuhand-Sondermandate und behördliche Gebühren. Das Gewinnspiel verspricht keine Steuerersparnis."},
    {"q": "Was ist ein Standard-Dossier?", "a": "Unselbstständig Erwerbende oder Personen ohne Erwerbseinkommen. Gemeinsam veranlagte Paare zählen als ein Dossier. Komplexe Fälle wie Selbstständigkeit oder ausländische Liegenschaften sind nicht Teil des Gewinns."},
    {"q": "Wer darf mitmachen?", "a": "Alle ab 18 Jahren mit Wohnsitz in den Kantonen Zürich, Schwyz, Zug oder St. Gallen – auch bestehende Kundinnen und Kunden. Ausgeschlossen sind Mitarbeitende der Veranstalterin und ihre Haushaltsangehörigen."},
    {"q": "Muss ich etwas kaufen oder eine Versicherung abschliessen?", "a": "Nein. Die Teilnahme ist kostenlos und setzt weder einen Kauf noch einen Versicherungsabschluss, ein App-Konto oder eine Werbeeinwilligung voraus."},
    {"q": "Wann ist meine Teilnahme gültig?", "a": "Sobald du deine E-Mail-Adresse über den Bestätigungslink bestätigt hast – innerhalb der Laufzeit bis 28.02.2027, 23:59 Uhr. Pro Person ist eine Teilnahme möglich."},
    {"q": "Wann wird ausgelost und wie erfahre ich es?", "a": "Die Auslosung findet am 02.03.2027 statt. Die Gewinnperson wird über eine offizielle @allnova.ch-Adresse benachrichtigt. Wir verlangen nie Zahlungsdaten, Gebühren oder Passwörter."},
    {"q": "Ich habe die Gratis-Erstellung von allnova schon genutzt. Lohnt sich das trotzdem?", "a": "Ja – der Gewinn umfasst ein ganzes Paket über drei Steuerjahre. Das bestehende Angebot «erste Steuererklärung gratis» bleibt davon unberührt."}
  ],
  "terms": [
    {"title": "1. Veranstalterin", "text": "Allfinanz Consulting GmbH unter der Marke allnova, Chaltenbodenstrasse 26, 8834 Schindellegi; Kontakt: info@allnova.ch. Die Aktion richtet sich an natürliche Personen ab 18 Jahren mit Wohnsitz in den Kantonen Zürich, Schwyz, Zug oder St. Gallen. Mitarbeitende der Veranstalterin sowie ihre Haushaltsangehörigen sind ausgeschlossen."},
    {"title": "2. Teilnahme", "text": "Die Teilnahme ist kostenlos und setzt weder einen Kauf noch einen Versicherungsabschluss, ein App-Konto oder eine Werbeeinwilligung voraus. Pro Person ist eine Teilnahme erlaubt. Sie wird erst nach Bestätigung der E-Mail-Adresse gültig. Vollständige Anmeldung und Bestätigung müssen innerhalb der Laufzeit erfolgen. Automatisierte, nachweislich manipulierte oder mehrfach angelegte Teilnahmen können ausgeschlossen werden."},
    {"title": "3. Aktion und Preis", "text": "Laufzeit: 01.02.2027, 09:00 Uhr bis 28.02.2027, 23:59 Uhr (Europe/Zurich). 1 Gewinnperson erhält die Erstellung und Einreichung je einer privaten Standard-Steuererklärung für die Steuerjahre 2026, 2027 und 2028 (Unterlagenprüfung, Erstellung, eine normale Rückfragerunde, Einreichung). Standard-Dossier: unselbstständig Erwerbende oder Personen ohne Erwerbseinkommen; gemeinsam veranlagte Paare zählen als ein Dossier. Steuerzahlungen, Einsprachen, Treuhand-Sondermandate und behördliche Gebühren sind nicht umfasst."},
    {"title": "4. Ziehung", "text": "Die Gewinnperson wird am 02.03.2027 zufällig unter allen gültigen Teilnahmen gezogen. Die Ziehung wird intern dokumentiert."},
    {"title": "5. Benachrichtigung", "text": "Die Gewinnperson wird über eine offizielle @allnova.ch-Adresse angeschrieben. Es werden keine Zahlungsdaten, Gebühren oder Passwörter verlangt. Bleibt eine Antwort sieben Kalendertage aus, wird neu gezogen. Name, Foto oder Video werden nur mit gesonderter Zustimmung veröffentlicht; diese ist keine Voraussetzung für den Preis."},
    {"title": "6. Einlösung", "text": "Steuertermine und Unterlagenfristen werden jährlich mit dem Steuer-Team vereinbart. Keine Barauszahlung; keine Übertragung ohne Zustimmung der Veranstalterin."},
    {"title": "7. Daten", "text": "Die Teilnehmerdaten werden zur Abwicklung verwendet. Daten nicht gewinnender Personen werden spätestens 90 Tage nach Abschluss der Gewinnabwicklung gelöscht oder anonymisiert, soweit keine begründete Aufbewahrung nötig ist. Gewinnerdaten bleiben für die Leistungserfüllung und anwendbare Nachweispflichten erhalten. Werbeeinwilligungen werden separat dokumentiert. Die Teilnehmerliste wird nicht weitergegeben."},
    {"title": "8. Plattformen und Änderungen", "text": "Instagram und Facebook sind keine Veranstalter oder Sponsoren. Soweit rechtlich zulässig, werden sie von Ansprüchen aus dieser Aktion freigestellt. Sachlich notwendige Änderungen werden transparent bekanntgegeben und dürfen zugesagte Gewinne nicht willkürlich mindern. Unabdingbare gesetzliche Ansprüche bleiben bestehen."}
  ],
  "platform_note": "Veranstalterin ist Allfinanz Consulting GmbH / allnova. Dieses Gewinnspiel wird weder von Instagram noch Facebook gesponsert, unterstützt oder organisiert und steht in keiner Verbindung zu diesen Plattformen.",
  "contact": {"email": "info@allnova.ch", "phone": "+41 44 687 55 44", "address": "Allfinanz Consulting GmbH, Chaltenbodenstrasse 26, 8834 Schindellegi"}
}$json$::jsonb
  from public.campaigns c where c.slug = 'steuern-2027';

insert into public.landing_pages (campaign_id, path, seo_title, seo_description, video_url, content)
select c.id, '/gewinnen/fahrstart',
       'Gewinnspiel: Fahrlektionen & VKU gewinnen | allnova',
       'Gewinne eines von zwei Paketen mit je zwei Fahrlektionen à 50 Minuten oder einen vollständigen VKU-Kursplatz. Wähle deinen Anbieter. Teilnahme kostenlos, ab 18, Wohnsitz ZH, SZ, ZG oder SG.',
       '/gewinnen/assets/video/allnova-fahrstart-gewinnspiel-30s.mp4',
       $json${
  "legal_status": "Entwurf – erst nach schriftlicher Partnerzusage veröffentlichen; Bedingungen fachlich prüfen lassen.",
  "hero": {
    "eyebrow": "Gewinnspiel",
    "headline": "Dein Start. Dein Führerausweis.",
    "subline": "2 × 2 Fahrlektionen + 1 × VKU-Kursplatz gewinnen.",
    "cta": "Gewinn auswählen & teilnehmen"
  },
  "intro": "Bereit für deinen nächsten Schritt zum Führerausweis? Gewinne eines von zwei Paketen mit je zwei Fahrlektionen oder einen vollständigen VKU-Kursplatz. Wähle den Anbieter, dessen Ort und Angebot zu dir passen. Teilnahme kostenlos.",
  "vku_explainer": "VKU steht für Verkehrskundeunterricht – den obligatorischen Kurs auf dem Weg zum Führerausweis Kategorie B. Ein ganzer Kursplatz statt einzelner Gratisstunden: verständlich und vollständig.",
  "scope": {
    "included": ["Pflichtkosten des Gewinnpakets, z. B. Administration, Versicherungspauschale und VKU-Unterlagen", "Kein Abo, kein Folgekauf"],
    "excluded": ["Führerprüfung und Ausweisgebühren", "Weitere Lektionen", "Anreise", "Erfolgsgarantie für die Prüfung"]
  },
  "steps": [
    {"title": "Anbieter wählen", "text": "Genau einen Anbieter bzw. Preispool wählen – Ort, Getriebe, Sprache und Voraussetzungen siehst du vorher."},
    {"title": "Ausfüllen", "text": "Vorname, Nachname, E-Mail, PLZ und Kanton eingeben und 18+ bestätigen."},
    {"title": "E-Mail bestätigen", "text": "Über den einmaligen Link bestätigen – erst dann ist die Teilnahme gültig."}
  ],
  "form": {
    "submit": "Gewinn auswählen & teilnehmen",
    "consent_label": "Ich bin mindestens 18 Jahre alt, wohne in einem zugelassenen Kanton und akzeptiere die Teilnahmebedingungen.",
    "marketing_label": "Ich möchte per E-Mail Tipps und Angebote von allnova erhalten. Ich kann mich jederzeit abmelden. Meine Teilnahme und Gewinnchance sind davon unabhängig.",
    "privacy_notice": "Allfinanz Consulting GmbH verwendet deine Angaben zur Prüfung und Durchführung des Gewinnspiels und zur Gewinnerbenachrichtigung. Weitere Informationen zu Speicherung, Empfängern und deinen Rechten findest du in den Datenschutzhinweisen.",
    "success_title": "Fast geschafft – bitte bestätige deine E-Mail.",
    "success_text": "Wir haben dir einen Bestätigungslink geschickt. Bitte bestätige deine E-Mail-Adresse, damit deine Teilnahme gültig wird. Die Bestätigung ist keine Newsletter-Anmeldung."
  },
  "confirmation": {
    "title": "Deine Teilnahme ist bestätigt.",
    "text": "Entdecke jetzt regionale Vorteile in der allnova App.",
    "app_cta": "allnova App entdecken",
    "app_url": null,
    "later": "Später",
    "note": "Für Installation, Newsletter oder Beratung gibt es keine zusätzlichen Lose."
  },
  "faq": [
    {"q": "Was kann ich gewinnen?", "a": "Zwei Pakete mit je zwei Fahrlektionen à 50 Minuten (Kategorie B) und einen vollständigen VKU-Kursplatz. Drei Gewinne für drei verschiedene Personen."},
    {"q": "Was ist der VKU?", "a": "Der Verkehrskundeunterricht (VKU) ist ein obligatorischer Kurs auf dem Weg zum Führerausweis Kategorie B. Du gewinnst einen ganzen Kursplatz – keine einzelnen Stunden."},
    {"q": "Warum muss ich einen Anbieter wählen?", "a": "Jeder Gewinn wird von einem regionalen Partner gestellt. Du wählst im Formular genau einen Anbieter bzw. Preispool, der für dich gut erreichbar ist. Pro Pool wird eine Person gezogen; die Gewinnchance hängt von der Zahl gültiger Teilnahmen im jeweiligen Pool ab."},
    {"q": "Was ist im Gewinn enthalten – und was nicht?", "a": "Enthalten sind die Pflichtkosten des Gewinnpakets, z. B. Administration, Versicherungspauschale und VKU-Unterlagen. Nicht enthalten sind Führerprüfung, Ausweisgebühren, weitere Lektionen und Anreise. Es gibt keine Erfolgsgarantie für die Prüfung."},
    {"q": "Bis wann kann ich den Gewinn einlösen?", "a": "Bis 31.05.2027 beim gewählten Anbieter. Lernfahrausweis und weitere Zulassungsvoraussetzungen prüft der Anbieter bei der Einlösung."},
    {"q": "Wer darf mitmachen?", "a": "Alle ab 18 Jahren mit Wohnsitz in den Kantonen Zürich, Schwyz, Zug oder St. Gallen. Ausgeschlossen sind Mitarbeitende der Veranstalterin und der Preispartner sowie ihre Haushaltsangehörigen."},
    {"q": "Kostet die Teilnahme etwas?", "a": "Nein. Kein Kauf, kein Abo, kein Folgekauf, kein Versicherungsabschluss und kein App-Konto nötig."},
    {"q": "Wann wird ausgelost?", "a": "Am 01.12.2026. Gewinnerinnen und Gewinner werden über eine offizielle @allnova.ch-Adresse benachrichtigt. Wir verlangen nie Zahlungsdaten, Gebühren oder Passwörter."}
  ],
  "terms": [
    {"title": "1. Veranstalterin", "text": "Allfinanz Consulting GmbH unter der Marke allnova, Chaltenbodenstrasse 26, 8834 Schindellegi; Kontakt: info@allnova.ch. Die Aktion richtet sich an natürliche Personen ab 18 Jahren mit Wohnsitz in den Kantonen Zürich, Schwyz, Zug oder St. Gallen. Mitarbeitende der Veranstalterin und der beteiligten Preispartner sowie ihre Haushaltsangehörigen sind ausgeschlossen."},
    {"title": "2. Teilnahme", "text": "Die Teilnahme ist kostenlos und setzt weder einen Kauf noch einen Versicherungsabschluss, ein App-Konto oder eine Werbeeinwilligung voraus. Pro Person ist eine Teilnahme erlaubt. Sie wird erst nach Bestätigung der E-Mail-Adresse gültig. Vollständige Anmeldung und Bestätigung müssen innerhalb der Laufzeit erfolgen. Automatisierte, nachweislich manipulierte oder mehrfach angelegte Teilnahmen können ausgeschlossen werden."},
    {"title": "3. Aktion und Preise", "text": "Laufzeit: 02.11.2026, 09:00 Uhr bis 29.11.2026, 23:59 Uhr (Europe/Zurich). 2 Gewinne mit je 2 × 50 Minuten Fahrunterricht Kategorie B und 1 vollständiger VKU-Platz. Anbieter, Ort, Getriebe, Kursumfang und Voraussetzungen werden auf der Gewinnspielseite je Preispool genannt."},
    {"title": "4. Ziehung", "text": "Am 01.12.2026 wird je eine Person pro gewähltem Anbieter/Preispool zufällig gezogen; die Gewinnchance hängt von der Zahl gültiger Teilnahmen im jeweiligen Pool ab. Pro Person höchstens ein Preis. Die Ziehung wird intern dokumentiert."},
    {"title": "5. Benachrichtigung", "text": "Die Gewinnerinnen und Gewinner werden über eine offizielle @allnova.ch-Adresse angeschrieben. Es werden keine Zahlungsdaten, Gebühren oder Passwörter verlangt. Bleibt eine Antwort sieben Kalendertage aus, wird aus dem gleichen Pool neu gezogen. Name, Foto oder Video werden nur mit gesonderter Zustimmung veröffentlicht; diese ist keine Voraussetzung für den Preis."},
    {"title": "6. Einlösung", "text": "Die Gewinne sind bis 31.05.2027 beim gewählten Anbieter einzulösen. Die notwendigen Pflichtkosten des beschriebenen Pakets sind eingeschlossen. Weitere Leistungen und Anreise trägt die Gewinnperson freiwillig selbst. Aktuell geltende Zulassungsvoraussetzungen und vorab veröffentlichte Termin- und Absageregeln gelten. Keine Barauszahlung; keine Übertragung ohne Zustimmung der Veranstalterin."},
    {"title": "7. Daten", "text": "Die Teilnehmerdaten werden zur Abwicklung verwendet. Daten nicht gewinnender Personen werden spätestens 90 Tage nach Abschluss der Gewinnabwicklung gelöscht oder anonymisiert, soweit keine begründete Aufbewahrung nötig ist. Gewinnerdaten bleiben für die Leistungserfüllung und anwendbare Nachweispflichten erhalten. Werbeeinwilligungen werden separat dokumentiert. Keine Weitergabe der gesamten Teilnehmerliste an Preispartner; der Gewinner erhält einen persönlichen Gutschein, notwendige Datenweitergabe erfolgt nur transparent zur Einlösung."},
    {"title": "8. Plattformen und Änderungen", "text": "Instagram und Facebook sind keine Veranstalter oder Sponsoren. Soweit rechtlich zulässig, werden sie von Ansprüchen aus dieser Aktion freigestellt. Sachlich notwendige Änderungen werden transparent bekanntgegeben und dürfen zugesagte Gewinne nicht willkürlich mindern. Unabdingbare gesetzliche Ansprüche bleiben bestehen."}
  ],
  "platform_note": "Veranstalterin ist Allfinanz Consulting GmbH / allnova. Dieses Gewinnspiel wird weder von Instagram noch Facebook gesponsert, unterstützt oder organisiert und steht in keiner Verbindung zu diesen Plattformen.",
  "contact": {"email": "info@allnova.ch", "phone": "+41 44 687 55 44", "address": "Allfinanz Consulting GmbH, Chaltenbodenstrasse 26, 8834 Schindellegi"}
}$json$::jsonb
  from public.campaigns c where c.slug = 'fahrstart-2026';

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

Bitte antworte innerhalb von 7 Kalendertagen auf diese E-Mail, damit wir die Einlösung mit dir organisieren können. Wir verlangen keine Zahlungsdaten, Gebühren oder Passwörter.

Dein allnova Team

Allfinanz Consulting GmbH, Chaltenbodenstrasse 26, 8834 Schindellegi, info@allnova.ch$t$);
