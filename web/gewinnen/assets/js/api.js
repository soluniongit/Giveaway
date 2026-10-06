// Schlanker Client für die Supabase-RPCs (PostgREST). Ohne Konfiguration: Demo-Modus.
import { DEMO_CAMPAIGNS } from './demo-data.js';

const cfg = window.ALLNOVA_CONFIG || {};
export const DEMO = !cfg.supabaseUrl || !cfg.supabaseKey;
const params = new URLSearchParams(location.search);

async function rpc(fn, body) {
  const headers = { 'Content-Type': 'application/json', apikey: cfg.supabaseKey };
  if (cfg.supabaseKey.startsWith('eyJ')) headers.Authorization = `Bearer ${cfg.supabaseKey}`;
  const res = await fetch(`${cfg.supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers, body: JSON.stringify(body), keepalive: fn === 'track_event',
  });
  if (!res.ok) throw new Error(`rpc ${fn}: ${res.status}`);
  return res.json();
}

const phaseOf = (c, now = Date.now()) =>
  now < Date.parse(c.starts_at) ? 'upcoming' : now <= Date.parse(c.ends_at) ? 'open' : 'closed';

export async function getCampaign(slug) {
  if (DEMO) {
    const c = DEMO_CAMPAIGNS[slug];
    const forced = params.get('phase');
    return {
      ok: true, demo: true, server_time: new Date().toISOString(),
      phase: ['upcoming', 'open', 'closed'].includes(forced) ? forced : phaseOf(c),
      campaign: c, pools: c.pools, page: null,
    };
  }
  const r = await rpc('get_campaign', { p_campaign: slug });
  return r;
}

export async function submitEntry(slug, data) {
  if (DEMO) {
    await new Promise((r) => setTimeout(r, 900));
    try { sessionStorage.setItem('allnova_demo_entry', JSON.stringify({ slug, first_name: data.first_name, pool: data.pool })); } catch (e) { /* storage blocked */ }
    return { ok: true, status: 'check_email', demo: true };
  }
  return rpc('submit_entry', {
    p_campaign: slug,
    p_first_name: data.first_name, p_last_name: data.last_name, p_email: data.email,
    p_postal_code: data.postal_code, p_canton: data.canton,
    p_consent_terms: data.consent_terms, p_marketing_opt_in: data.marketing_opt_in,
    p_pool: data.pool || null, p_source: data.source || {},
    p_form_started_at: data.form_started_at || null, p_website: data.website || null,
  });
}

export async function confirmEntry(token) {
  if (DEMO) {
    await new Promise((r) => setTimeout(r, 700));
    let demo = null;
    try { demo = JSON.parse(sessionStorage.getItem('allnova_demo_entry') || 'null'); } catch (e) { /* ignore */ }
    const slug = params.get('kampagne') || demo?.slug || 'steuern-2027';
    const c = DEMO_CAMPAIGNS[slug] || DEMO_CAMPAIGNS['steuern-2027'];
    if (token === 'abgelaufen') return { ok: false, error: 'expired', kind: c.kind, campaign: c.slug, campaign_title: c.title, public_url: c.public_url };
    if (!token) return { ok: false, error: 'invalid_token' };
    return { ok: true, status: 'confirmed', demo: true, kind: c.kind, campaign: c.slug, campaign_title: c.title, public_url: c.public_url, first_name: demo?.first_name || null, prize: c.pools[0].title, draw_on: c.draw_on };
  }
  return rpc('confirm_entry', { p_token: token });
}

let sessionId;
function session() {
  if (sessionId) return sessionId;
  try {
    sessionId = sessionStorage.getItem('allnova_sid');
    if (!sessionId) {
      sessionId = Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
      sessionStorage.setItem('allnova_sid', sessionId);
    }
  } catch (e) { sessionId = 'nostorage'; }
  return sessionId;
}

/** Herkunft (UTM, Referrer, Einstiegsseite) — einmal pro Sitzung festgehalten. */
export function source() {
  const keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  let src = null;
  try { src = JSON.parse(sessionStorage.getItem('allnova_src') || 'null'); } catch (e) { /* ignore */ }
  const fromUrl = Object.fromEntries(keys.filter((k) => params.get(k)).map((k) => [k, params.get(k).slice(0, 100)]));
  if (!src || Object.keys(fromUrl).length) {
    src = { ...fromUrl, referrer: document.referrer.slice(0, 500), landing_path: location.pathname };
    try { sessionStorage.setItem('allnova_src', JSON.stringify(src)); } catch (e) { /* ignore */ }
  }
  return src;
}

export function track(slug, event, meta = {}) {
  if (DEMO) { console.debug('[track]', slug, event, meta); return; }
  rpc('track_event', { p_campaign: slug, p_event: event, p_meta: meta, p_source: source(), p_session: session() }).catch(() => {});
}
