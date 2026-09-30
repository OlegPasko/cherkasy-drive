// Donation proofs: a screenshot or a receipt (PDF) of a donation to the jar. A model only reads it (amount, date and
// time, recipient, receipt id, a transcription); Jev judges whether the text is a genuine completed payment to our jar;
// code checks what is plain arithmetic: the amount against the minimum, and the time against the request's creation.
//   createProof({ readers: [{ name, url, key, model, timeout? }], jev, jar }) -> {
//     read(buf, mime) -> { fields, meta } (fields null when nothing could read it),
//     judge(fields, { min, createdAt, now? }) -> { verdict: 'ok' | 'low' | 'old' | 'unreadable' | 'wrong_jar' | 'unsure', amount, when, key, why } }
//   readers: OpenAI-compatible chat endpoints tried in order (Darkbloom's Gemma on Oleg's machines, then DeepSeek); a
//     timeout, an HTTP error or unparseable JSON moves on to the next. Images go in as images; a PDF's text layer is
//     pulled out here (unpdf) and sent as text, since these endpoints take no files.
//   meta: { reader, model, ms, tokens: { in, out, reasoning }, pdf, tried: ['darkbloom: timeout', …] } – logged on the issue
//   'ok' / 'low' need ~90% certainty (genuine and to our jar); anything between is 'unsure' – the bot then asks for a bank
//   receipt, and after that a person decides. Any Ukrainian bank counts: the jar is recognised by title, owner or IBAN.
//   Our IBAN, or the jar's exact title in «quotes» next to the word "банка" (monobank's own operation screen shows only
//   that), settles the jar in code: Jev alone gives a bare title ~0.55. With the jar settled, 80% is enough for "genuine"
//   (Jev puts monobank's operation screen – date, "-50.00 ₴", "Повторити платіж" – at ~0.87).
//   fields: { is_payment, amount, datetime ('YYYY-MM-DD HH:MM'), date_known, recipient, comment, receipt_id, text }
//   times are compared as Kyiv wall clock with 3 h of slack each way: phone screenshots show the device's own zone, and a
//   "jar topped up" screen has only the status-bar clock (today's date is assumed, sent right after paying)
const crypto = require('node:crypto');

const PROMPT = `You read a screenshot or a receipt of a payment from any Ukrainian bank (monobank, PrivatBank, Oschadbank, …), usually a top-up of a monobank jar. Reply with JSON only, no markdown:
{"is_payment": bool, "amount": number|null, "datetime": "YYYY-MM-DD HH:MM"|null, "date_known": bool,
 "recipient": string|null, "comment": string|null, "receipt_id": string|null, "text": string}
- is_payment: true when it shows a payment that went through (a success screen, an operation in the history, a receipt).
- amount: the transferred sum in UAH as a positive number ("-1.00 ₴" -> 1), not a balance, a goal or a jar total.
- datetime: the transaction's own date and time. Ukrainian month names count ("29 вересня 2026, 12:24" -> "2026-09-29 12:24").
  If only the phone's status-bar clock is visible, use it with today's date (TODAY) and set date_known to false.
- recipient: the jar or person paid, with the recipient's IBAN if shown. A jar screen names the jar in «quotes».
- comment: the payment purpose / comment line; receipt_id: a receipt number if any.
- text: a plain transcription of every visible line, top to bottom. Keep the recipient's IBAN; mask the payer's card and account numbers.`;

const kyivNow = (d = new Date()) => { // Kyiv wall clock as "YYYY-MM-DD HH:MM"
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
};
const minutes = (s) => Date.parse(s.replace(' ', 'T') + ':00Z') / 60000; // wall clock -> comparable minutes
const SLACK = 180, SURE = 0.9, SURE_KNOWN_JAR = 0.8;

function json(s) { const m = /\{[\s\S]*\}/.exec(s || ''); return m ? JSON.parse(m[0]) : null; }

async function pdfText(buf) {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const { text } = await extractText(await getDocumentProxy(new Uint8Array(buf)), { mergePages: true });
  return text.trim();
}

// OpenAI-compatible vision chat, readers tried in order until one returns JSON (also used by moderate.js)
//   askReaders(readers, content) -> { fields, meta: { reader, model, ms, tokens, tried } } | { fields: null, meta: { tried } }
async function askOne(rd, content) {
  const t = Date.now(), ctl = AbortSignal.timeout(rd.timeout || 15000);
  const r = await fetch(`${rd.url}/chat/completions`, {
    method: 'POST', signal: ctl,
    headers: { authorization: `Bearer ${rd.key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: rd.model, temperature: 0, messages: [{ role: 'user', content }] }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json(), u = j.usage || {};
  const fields = json(j.choices?.[0]?.message?.content);
  if (!fields || typeof fields !== 'object') throw new Error('no JSON');
  return { fields, meta: { reader: rd.name, model: j.model || rd.model, ms: Date.now() - t,
    tokens: { in: u.prompt_tokens, out: u.completion_tokens, reasoning: u.completion_tokens_details?.reasoning_tokens ?? null } } };
}
async function askReaders(readers, content) {
  const tried = [];
  for (const rd of readers.filter((x) => x.key)) {
    try { const out = await askOne(rd, content); out.meta.tried = tried; return out; }
    catch (e) { tried.push(`${rd.name}: ${e.name === 'TimeoutError' ? 'timeout' : e.message}`); console.warn('[vision]', rd.name, e.message); }
  }
  return { fields: null, meta: { tried } };
}

function createProof({ readers = [], jev, jar }) {
  async function read(buf, mime) {
    const pdf = mime === 'application/pdf';
    let content;
    try {
      const prompt = PROMPT.replace('TODAY', kyivNow().slice(0, 10));
      content = pdf
        ? [{ type: 'text', text: `${prompt}\n\nThe receipt's text:\n${(await pdfText(buf)).slice(0, 6000)}` }]
        : [{ type: 'image_url', image_url: { url: `data:${mime};base64,${buf.toString('base64')}` } }, { type: 'text', text: prompt }];
    } catch (e) { return { fields: null, meta: { pdf, tried: [`pdf: ${e.message}`] } }; }
    const out = await askReaders(readers, content);
    out.meta.pdf = pdf;
    return out;
  }

  async function judge(f, { min, createdAt, now = new Date() }) {
    if (!f) return { verdict: 'unsure', why: 'no reader' };
    const amount = Math.abs(Number(f.amount)), when = /^\d{4}-\d\d-\d\d \d\d:\d\d$/.test(f.datetime || '') ? f.datetime : null;
    if (!f.is_payment || !(amount > 0) || !when) return { verdict: 'unreadable', amount, when, why: 'no amount / time' };
    const key = crypto.createHash('sha256').update(f.receipt_id ? `id:${f.receipt_id}` : `${amount}|${when}|${f.comment || ''}`).digest('hex').slice(0, 24);
    const t = minutes(when), t0 = minutes(kyivNow(new Date(createdAt))), t1 = minutes(kyivNow(now));
    if (t < t0 - SLACK) return { verdict: 'old', amount, when, key, why: 'before the request' };
    const seen = `${f.text || ''} ${f.recipient || ''}`;
    const ibanHit = !!jar.iban && seen.replace(/\s/g, '').includes(jar.iban);
    const titleHit = !!jar.title && seen.includes(`«${jar.title}»`) && /банк[аиу]/i.test(seen);
    const r = await jev.ask({
      state: { document_text: f.text || '', extracted: { amount, datetime: when, recipient: f.recipient, comment: f.comment }, expected_jar: { title: jar.title, owner: jar.owner, iban: jar.iban } },
      questions: {
        genuine: {
          type: 'noul',
          instructions: 'Does `document_text` (read from a bank app screenshot or a bank receipt) confirm a payment that has already gone through?',
          criteria: { true: 'A success screen ("поповнено", "успішно", "готово"), an operation record from the history with a date, a debited sum ("-50.00 ₴") and actions like "Повторити платіж" or "Квитанція", or a receipt / квитанція', false: 'A payment form still waiting for a sum or a button press, a jar page with its goal and total, a shop order, or something unrelated' },
        },
        to_jar: { type: 'noul', instructions: 'Was the payment in `document_text` sent to the monobank jar in `expected_jar` – recognisable by its title, its owner\'s name or its IBAN, from monobank or from another bank?' },
      },
    }).catch((e) => { console.warn('[proof] jev failed:', e.message); return null; });
    const g = r?.genuine?.noul ?? 0.5, j = ibanHit ? 1 : titleHit ? Math.max(0.95, r?.to_jar?.noul ?? 0) : r?.to_jar?.noul ?? 0.5;
    const why = `genuine ${g.toFixed(2)}, jar ${j.toFixed(2)}${ibanHit ? ' (IBAN)' : titleHit ? ' (title)' : ''}${f.date_known === false ? ', date guessed' : ''}`;
    if (g < 0.2) return { verdict: 'unreadable', amount, when, key, why };
    if (g >= SURE && j < 0.25) return { verdict: 'wrong_jar', amount, when, key, why };
    if (g < (ibanHit || titleHit ? SURE_KNOWN_JAR : SURE) || j < SURE || t > t1 + SLACK) return { verdict: 'unsure', amount, when, key, why };
    return { verdict: amount >= min ? 'ok' : 'low', amount, when, key, why };
  }

  return { read, judge };
}

module.exports = { createProof, kyivNow, askReaders };
