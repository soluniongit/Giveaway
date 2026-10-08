/*
 * Konfiguration der Gewinnspielseiten.
 * Leer gelassen → Demo-Modus (keine Daten werden gesendet, Formular simuliert die Teilnahme).
 * Der Supabase-"publishable"/anon-Key ist öffentlich; Schutz erfolgt über RLS + RPCs.
 */
window.ALLNOVA_CONFIG = {
  supabaseUrl: '',            // z. B. 'https://<projekt>.supabase.co'
  supabaseKey: '',            // publishable bzw. anon key
  appUrl: '',                 // Link zur allnova App (Store/Deep-Link) für die Bestätigungsseite
  privacyUrl: '',             // Datenschutzhinweise; leer → Abschnitt auf der Seite
};
