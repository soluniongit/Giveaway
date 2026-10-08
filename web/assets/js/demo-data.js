// Fallback-Daten (entsprechen supabase/migrations/…_seed.sql), genutzt im Demo-Modus ohne Supabase.
export const DEMO_CAMPAIGNS = {
  'ps5-gta6-2026': {
    slug: 'ps5-gta6-2026', kind: 'giveaway', status: 'draft', title: 'PS5 Pro + GTA VI Giveaway',
    tagline: 'Gewinne eine PS5 Pro mit GTA VI.',
    starts_at: '2026-10-07T22:00:00Z', ends_at: '2026-11-18T22:59:59Z',
    starts_at_label: '08.10.2026, 00:00 Uhr', ends_at_label: '18.11.2026, 23:59 Uhr',
    draw_on: '2026-11-19', redeem_until: null, min_age: 18, allowed_cantons: [],
    requires_pool_choice: false, referral_bonus_max: 1, public_url: 'https://gewinnspiel.allnova.ch/ps5-gta6/',
    pools: [{ key: 'hauptpreis', title: 'PlayStation 5 Pro + Grand Theft Auto VI', short_title: 'PS5 Pro + GTA VI', winners: 1, details: { type: 'sachpreis', items: ['PlayStation 5 Pro', 'Grand Theft Auto VI (PS5)'] }, partner: null }],
  },
};
