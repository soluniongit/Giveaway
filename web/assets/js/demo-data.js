// Fallback-Daten (entsprechen supabase/migrations/…_seed.sql), genutzt im Demo-Modus ohne Supabase.
export const DEMO_CAMPAIGNS = {
  'ps5-gta6-2026': {
    slug: 'ps5-gta6-2026', kind: 'giveaway', status: 'draft', title: 'PS5 Pro + GTA VI Giveaway',
    tagline: 'Gewinne eine PS5 Pro mit GTA VI.',
    starts_at: '2026-10-07T22:00:00Z', ends_at: '2026-11-15T22:59:59Z',
    starts_at_label: '08.10.2026, 00:00 Uhr', ends_at_label: '15.11.2026, 23:59 Uhr',
    draw_on: '2026-11-16', redeem_until: null, min_age: 18, allowed_cantons: [],
    requires_pool_choice: false, referral_bonus_max: 1, public_url: 'https://gewinnspiel.allnova.ch/ps5-gta6/',
    pools: [{ key: 'hauptpreis', title: 'PlayStation 5 Pro + Grand Theft Auto VI', short_title: 'PS5 Pro + GTA VI', winners: 1, details: { type: 'sachpreis', items: ['PlayStation 5 Pro', 'Grand Theft Auto VI (PS5)'] }, partner: null }],
  },
  'steuern-2027': {
    slug: 'steuern-2027', kind: 'giveaway', status: 'draft', title: 'allnova Steuer-Gewinnspiel',
    tagline: "Erste Steuererklärung gratis – und CHF 1'000 gewinnen.",
    starts_at: '2026-11-04T23:00:00Z', ends_at: '2027-03-31T21:59:59Z',
    starts_at_label: '05.11.2026, 00:00 Uhr', ends_at_label: '31.03.2027, 23:59 Uhr',
    draw_on: '2027-04-20', redeem_until: null, min_age: 18, allowed_cantons: [],
    requires_pool_choice: false, referral_bonus_max: 0, collect_contact_details: true, requires_appointment: true,
    public_url: 'https://gewinnspiel.allnova.ch/steuern/',
    pools: [{ key: 'hauptpreis', title: "CHF 1'000 per Überweisung", short_title: "CHF 1'000", winners: 1, details: { type: 'geldpreis', amount_chf: 1000 }, partner: null }],
  },
  'buergenstock-2026': {
    slug: 'buergenstock-2026', kind: 'giveaway', status: 'draft', title: 'Bürgenstock-Giveaway',
    tagline: 'Gewinne eine Nacht für zwei im Bürgenstock Hotel.',
    starts_at: '2026-11-04T23:00:00Z', ends_at: '2026-12-14T22:59:59Z',
    starts_at_label: '05.11.2026, 00:00 Uhr', ends_at_label: '14.12.2026, 23:59 Uhr',
    draw_on: '2026-12-15', redeem_until: null, min_age: 18, allowed_cantons: [],
    requires_pool_choice: false, referral_bonus_max: 1, collect_contact_details: true, requires_appointment: false,
    public_url: 'https://gewinnspiel.allnova.ch/buergenstock/',
    pools: [{ key: 'hauptpreis', title: '1 Übernachtung für 2 Personen im Bürgenstock Hotel (Wert CHF 500)', short_title: '1 Nacht für 2 im Bürgenstock', winners: 1, details: { type: 'gutschein', value_chf: 500, nights: 1, persons: 2 }, partner: null }],
  },
};
