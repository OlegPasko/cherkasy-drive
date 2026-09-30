// DigitalOcean Spaces (S3 API) with a hand-rolled SigV4 signer, so the function needs no npm dependencies.
// Holds the per-chat conversation state (private) and the photos users send (public-read, linked from the issues).
//   createSpaces({ key, secret, bucket, region, prefix = 'driver-bot/' }) -> {
//     get(path) -> string | null, getJSON(path) -> object | null, put(path, body, { type?, pub? }),
//     list(path) -> [key...], del(path), url(path) -> public URL }
//   paths are relative to `prefix`; list() returns them relative too
const crypto = require('node:crypto');

const sha = (d) => crypto.createHash('sha256').update(d).digest('hex');
const mac = (k, d) => crypto.createHmac('sha256', k).update(d).digest();
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());

function createSpaces({ key, secret, bucket, region, prefix = 'driver-bot/' }) {
  const host = `${bucket}.${region}.digitaloceanspaces.com`;

  async function req(method, objKey, { body = '', query = {}, headers = {} } = {}) {
    const now = new Date().toISOString().replace(/[-:]|\.\d{3}/g, ''), day = now.slice(0, 8);
    const hash = sha(body);
    const h = { host, 'x-amz-date': now, 'x-amz-content-sha256': hash };
    for (const [k, v] of Object.entries(headers)) h[k.toLowerCase()] = v;
    const names = Object.keys(h).sort();
    const path = '/' + objKey.split('/').map(enc).join('/');
    const qs = Object.keys(query).sort().map((k) => `${enc(k)}=${enc(query[k])}`).join('&');
    const canon = [method, path, qs, names.map((n) => `${n}:${String(h[n]).trim()}\n`).join(''), names.join(';'), hash].join('\n');
    const scope = `${day}/${region}/s3/aws4_request`;
    const signKey = ['s3', 'aws4_request'].reduce(mac, mac(mac('AWS4' + secret, day), region));
    const sig = mac(signKey, ['AWS4-HMAC-SHA256', now, scope, sha(canon)].join('\n')).toString('hex');
    h.authorization = `AWS4-HMAC-SHA256 Credential=${key}/${scope}, SignedHeaders=${names.join(';')}, Signature=${sig}`;
    delete h.host;
    const res = await fetch(`https://${host}${path}${qs ? '?' + qs : ''}`, { method, headers: h, body: method === 'GET' || method === 'DELETE' ? undefined : body });
    return res;
  }

  const full = (p) => prefix + p;
  return {
    async get(p) {
      const r = await req('GET', full(p));
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`spaces get ${p}: ${r.status}`);
      return r.text();
    },
    async getJSON(p) { const t = await this.get(p); return t ? JSON.parse(t) : null; },
    async put(p, body, { type = 'application/octet-stream', pub = false } = {}) {
      const headers = { 'content-type': type };
      if (pub) headers['x-amz-acl'] = 'public-read';
      const r = await req('PUT', full(p), { body, headers });
      if (!r.ok) throw new Error(`spaces put ${p}: ${r.status} ${await r.text()}`);
    },
    async list(p) { // pages of 1000 keys: the news subscribers ('subs/') can outgrow one
      const keys = [];
      for (let token = null; ;) {
        const r = await req('GET', '', { query: { 'list-type': '2', prefix: full(p), ...(token && { 'continuation-token': token }) } });
        if (!r.ok) throw new Error(`spaces list ${p}: ${r.status}`);
        const xml = await r.text();
        keys.push(...[...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => m[1].slice(prefix.length)));
        token = /<IsTruncated>true<\/IsTruncated>/.test(xml) && /<NextContinuationToken>([^<]+)</.exec(xml)?.[1];
        if (!token) return keys.sort();
      }
    },
    async del(p) { await req('DELETE', full(p)); },
    url: (p) => `https://${host}/${full(p).split('/').map(enc).join('/')}`,
  };
}

module.exports = { createSpaces };
