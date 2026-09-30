// Google Analytics 4 (gtag.js). It loads only on the production host, so dev servers, demos, tests and previews never
// report; ?noga turns it off there too. Everything else calls track(), which stays a no-op until init has run.
//   initAnalytics({ mode: 'game' | 'map' }) -> bool (loaded)   once, from index.html; mode goes out as the page's `mode`
//   track(name, params?)                                          a GA4 event, e.g. track('mission_end', { mission_type, ok })
// Events sent today: game_ready (load_ms, quality), mission_start / mission_end (mission_type, ok), partner_open
// (partner, via: key | card | map), sight_visited (sight), adaptive_res (dpr, step, reason, quality: the adaptive
// resolution changed the render pixel ratio on a slow machine), teleport (place: the big map moved the car there). Outbound link clicks (the Telegram bot) come from GA's own
// enhanced measurement.
export const GA_ID = 'G-6DK19V1WXV';
const PROD = /(^|\.)driver\.ck\.ua$/;

let on = false;

export function initAnalytics({ mode = 'game' } = {}) {
  if (on || typeof document === 'undefined') return on;
  if (!PROD.test(location.hostname) || new URLSearchParams(location.search).has('noga')) return false;
  window.dataLayer = window.dataLayer || [];
  // gtag reads the Arguments object itself, not an array: keep this a plain function
  window.gtag = function gtag() { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', GA_ID, { mode });
  const s = document.createElement('script');
  s.async = true; s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(s);
  return (on = true);
}

export function track(name, params) {
  if (on) try { window.gtag('event', name, params); } catch { /* a blocked gtag must never break the game */ }
}
