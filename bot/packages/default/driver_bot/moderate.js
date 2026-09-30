// Ad artwork moderation: the picture a customer wants on a billboard, a van or the balloon. A vision model only
// describes it (what is shown, every piece of text, symbols); Jev judges the description against the game's ad rules,
// the same split as proof.js. Anything short of a clear yes still goes to a person: a clear no is turned away at once.
//   createModeration({ readers, jev }) -> { check(buf, mime, { what }) -> { verdict: 'ok' | 'review' | 'reject', reason, desc, text, p, meta } }
//   reason: the most likely rule broken ('sexual' | 'violence' | 'hate' | 'drugs' | 'politics' | 'scam' | 'other' | null)
//   p: Jev's probability that the artwork is acceptable; meta: the reader's { reader, model, ms, tokens, tried }
const { askReaders } = require('./proof');

const PROMPT = `Describe this image objectively for a content moderator. It is meant as advertising artwork in a family-friendly city driving game (a billboard, a van livery or a hot-air balloon). Reply with JSON only, no markdown:
{"description": string, "text": string, "symbols": string, "people": string}
- description: what the image shows, 2-4 plain sentences (objects, scene, style, brand or product).
- text: every piece of visible text, verbatim, in its original language; "" if none.
- symbols: flags, emblems, logos, gestures or signs worth noting, with what they are; "" if none.
- people: who is shown and how (clothing, pose, injuries, weapons); "" if none.
Do not judge, only describe.`;

const REASONS = ['sexual', 'violence', 'hate', 'drugs', 'politics', 'scam', 'other'];
const OK = 0.75, NO = 0.25; // Jev's "acceptable" probability: above OK it passes, below NO it is turned away

function createModeration({ readers = [], jev }) {
  async function check(buf, mime, { what = '' } = {}) {
    const { fields: f, meta } = await askReaders(readers, [
      { type: 'image_url', image_url: { url: `data:${mime};base64,${buf.toString('base64')}` } }, { type: 'text', text: PROMPT }]);
    if (!f) return { verdict: 'review', reason: null, desc: '', text: '', p: null, meta, why: 'no reader' };
    const desc = String(f.description || ''), text = String(f.text || '');
    const r = await jev.ask({
      state: { artwork: { description: desc, text_on_image: text, symbols: String(f.symbols || ''), people: String(f.people || '') }, advertised_business: what.slice(0, 600) },
      questions: {
        ok: {
          type: 'noul',
          instructions: 'The `artwork` (described by a vision model) is to be shown as an advertisement inside a family-friendly driving game set in the Ukrainian city of Cherkasy. Is it acceptable to show?',
          criteria: {
            true: 'An ordinary ad: a logo, a product, food, a venue, a service, a slogan or contact details; people shown in a normal way; Ukrainian national symbols are fine',
            false: 'Nudity or sexual content; violence, gore or glorified weapons; hate, extremist or occupiers\' symbols (e.g. "Z", ribbons of St. George); insults or obscenity; drugs, casinos or betting; political campaigning or calls to riots, violence or any action beyond buying from the business; scams or fake giveaways',
          },
        },
        reason: {
          type: 'choice',
          instructions: 'If the `artwork` broke a rule for an ad in a family-friendly game, which rule would it most likely be?',
          criteria: {
            sexual: 'Nudity or sexual content', violence: 'Violence, gore, glorified weapons', hate: 'Hate, extremist or enemy symbols, insults, obscenity',
            drugs: 'Drugs, casinos, betting', politics: 'Political campaigning or calls to action beyond buying', scam: 'A scam, a fake giveaway, misleading claims', other: 'Nothing in particular or something else',
          },
        },
      },
    }).catch((e) => { console.warn('[moderate] jev failed:', e.message); return null; });
    const p = r?.ok?.noul ?? null, reason = r?.reason?.choice && REASONS.includes(r.reason.choice) && r.reason.choice !== 'other' ? r.reason.choice : null;
    const verdict = p == null ? 'review' : p >= OK ? 'ok' : p <= NO ? 'reject' : 'review';
    return { verdict, reason: verdict === 'ok' ? null : reason, desc, text, p, meta, why: p == null ? 'jev failed' : `acceptable ${p.toFixed(2)}` };
  }
  return { check };
}

module.exports = { createModeration };
