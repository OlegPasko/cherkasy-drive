// Guardrail for free text through TypeSafe Jev (https://docs.typesafe.ai/api): does the reply answer the question the
// bot just asked, or is it off-topic / junk? Buttons never come here, only typed input. Fails open: when the key is
// missing or the API errs, the text is accepted, so an outage never locks users out.
//   createJev(apiKey) -> { ask({ state, questions }) -> answers (throws on failure), check({ question, message, commercial?, kind? }) -> {
//     verdict: 'accept' | 'off_topic' | 'junk', commercial?: 0..1, kind?: 'feature' | 'bug' | 'feedback' } }
//   commercial: also ask whether the described object is a business (the free improvement is for non-commercial ones)
//   kind: also sort a feedback message into feature idea / bug report / general feedback
//   landmark({ request, osm }) -> 0..1 | null   is the object of an improvement request a recognisable city landmark
const REJECT = { junk: 0.6, off_topic: 0.7 }; // the verdict's probability needed to turn a reply away

function createJev(apiKey) {
  async function ask({ state, questions }) { // a raw evaluation for other modules (proof.js)
    if (!apiKey) throw new Error('no TYPESAFE_API_KEY');
    const r = await fetch('https://api.typesafe.ai/v1/systemone', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'jev-latest', state, questions }),
    });
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    return (await r.json()).answers;
  }
  async function check({ question, message, commercial = false, kind = false }) {
    if (!apiKey || !message) return { verdict: 'accept' };
    const questions = {
      verdict: {
        type: 'choice',
        instructions: 'A player of Cherkasy Drive (a driving game set in the real city of Cherkasy, Ukraine) is filing a request in the game\'s Telegram bot. The bot asked `bot_question` and the player replied `reply`. How should the bot treat the reply?',
        criteria: {
          accept: 'A genuine attempt to answer the question, even if short, informal, misspelled, or written in Ukrainian, Russian or English. A street address, a place name or a map link counts as an answer to a question about a place.',
          off_topic: 'A real message that does not answer this question: it asks something else or talks about an unrelated subject.',
          junk: 'Gibberish, random characters, spam, insults, obscenity, or harmful content.',
        },
      },
    };
    if (commercial) questions.commercial = {
      type: 'noul',
      instructions: 'Is the object in `reply` a commercial business (a shop, café, restaurant, office, brand or other venue that sells something)?',
      criteria: { true: 'A business or a branded venue', false: 'A home, a street, a school, a park, a monument or another non-commercial place, or unclear' },
    };
    if (kind) questions.kind = {
      type: 'choice',
      instructions: 'What kind of message is `reply` about the game?',
      criteria: { feature: 'An idea or a request for something new in the game', bug: 'A report that something in the game is broken or wrong', feedback: 'General impressions, praise or criticism' },
    };
    try {
      const a = await ask({ state: { bot_question: question, reply: message.slice(0, 2000) }, questions });
      const p = a.verdict.probabilities || {};
      const verdict = Object.keys(REJECT).find((k) => (p[k] ?? 0) >= REJECT[k]) || 'accept';
      return { verdict, commercial: a.commercial?.noul, kind: a.kind?.choice };
    } catch (e) {
      console.warn('[jev] check failed, accepting:', e.message);
      return { verdict: 'accept' };
    }
  }
  // is the object behind an improvement request a city landmark (one that earns a badge on the game's maps)?
  async function landmark({ request, osm }) {
    if (!apiKey) return null;
    try {
      const a = await ask({ state: { request, osm_object: osm || 'not found' }, questions: { landmark: {
        type: 'noul',
        instructions: 'A player asks to make an object in Cherkasy (Ukraine) look more like the real one in a driving game. From the `request` and the OpenStreetMap object found there (`osm_object`), is this object a city landmark – a place locals and visitors would recognise by name?',
        criteria: {
          true: 'A monument, memorial, museum, theatre, palace of culture, church or cathedral, stadium, famous or historic building, a notable square or park; OSM tags like wikidata, wikipedia, heritage, historic or tourism are strong signs',
          false: 'An ordinary apartment block, private house, garage, shop, office, school building or yard with no particular fame',
        },
      } } });
      return a.landmark?.noul ?? null;
    } catch (e) { console.warn('[jev] landmark failed:', e.message); return null; }
  }
  return { ask, check, landmark };
}

module.exports = { createJev };
