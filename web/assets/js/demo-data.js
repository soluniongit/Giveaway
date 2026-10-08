// Fallback-Daten (entsprechen supabase/migrations/…_seed.sql), genutzt im Demo-Modus ohne Supabase.
export const DEMO_CAMPAIGNS = {
  'steuern-2027': {
    slug: 'steuern-2027', kind: 'steuer', status: 'draft', title: 'Steuergewinnspiel',
    tagline: '3 Jahre. Steuererklärung. Gratis.',
    starts_at: '2027-02-01T08:00:00Z', ends_at: '2027-02-28T22:59:59Z',
    starts_at_label: '01.02.2027, 09:00 Uhr', ends_at_label: '28.02.2027, 23:59 Uhr',
    draw_on: '2027-03-02', redeem_until: null, min_age: 18, allowed_cantons: ['ZH', 'SZ', 'ZG', 'SG'],
    requires_pool_choice: false, public_url: 'https://www.allnova.ch/gewinnen/steuern',
    pools: [{ key: 'paket', title: 'Steuerpaket 2026–2028', short_title: '3 Steuererklärungen', winners: 1, details: { type: 'steuer', tax_years: [2026, 2027, 2028] }, partner: null }],
  },
  'fahrstart-2026': {
    slug: 'fahrstart-2026', kind: 'fahrstart', status: 'draft', title: 'Fahrstart-Gewinnspiel',
    tagline: 'Dein Start. Dein Führerausweis.',
    starts_at: '2026-11-02T08:00:00Z', ends_at: '2026-11-29T22:59:59Z',
    starts_at_label: '02.11.2026, 09:00 Uhr', ends_at_label: '29.11.2026, 23:59 Uhr',
    draw_on: '2026-12-01', redeem_until: '2027-05-31', min_age: 18, allowed_cantons: ['ZH', 'SZ', 'ZG', 'SG'],
    requires_pool_choice: true, public_url: 'https://www.allnova.ch/gewinnen/fahrstart',
    pools: [
      { key: 'a', title: '2 Fahrlektionen à 50 Minuten', short_title: '2 Fahrlektionen', winners: 1, details: { type: 'fahrlektionen', lessons: 2, minutes: 50, category: 'B' }, partner: { confirmed: false, label: 'Anbieter A' } },
      { key: 'b', title: '2 Fahrlektionen à 50 Minuten', short_title: '2 Fahrlektionen', winners: 1, details: { type: 'fahrlektionen', lessons: 2, minutes: 50, category: 'B' }, partner: { confirmed: false, label: 'Anbieter B' } },
      { key: 'c', title: '1 vollständiger VKU-Kursplatz', short_title: 'VKU-Kursplatz', winners: 1, details: { type: 'vku' }, partner: { confirmed: false, label: 'Anbieter C' } },
    ],
  },
};
