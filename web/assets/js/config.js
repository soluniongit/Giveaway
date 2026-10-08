/*
 * Konfiguration der Giveaway-Seite (gewinnspiel.allnova.ch).
 * Supabase leer gelassen → Demo-Modus (keine Daten werden gesendet, Formular simuliert die Teilnahme).
 * Der Supabase-"publishable"/anon-Key ist öffentlich; Schutz erfolgt über RLS + RPCs.
 */
window.ALLNOVA_CONFIG = {
  supabaseUrl: '',            // z. B. 'https://<projekt>.supabase.co'
  supabaseKey: '',            // publishable bzw. anon key
  appUrl: '',                 // Link zur allnova App (Store/Deep-Link) für die Bestätigungsseite
  privacyUrl: '',             // Datenschutzhinweise; leer → Abschnitt auf der Seite
  // Instagram-Beitrag zum Giveaway, z. B. 'https://www.instagram.com/p/ABC123xyz/'.
  // Leer → Platzhalter «Beitrag folgt» mit Link zum Profil.
  instagramPostUrl: '',
  instagramProfileUrl: 'https://www.instagram.com/allnova.ch/',
};
