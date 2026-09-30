// Telegram Bot API over fetch. Messages use HTML parse mode; esc() user text before it goes in.
//   createTelegram(token) -> { call(method, params), send(chat, text, kb?), edit(chat, msgId, text, kb?),
//     photo(chat, url, caption, kb?), answer(cbId, text?), file(fileId) -> Buffer }
//   kb: [[{ text, data } | { text, url }]] rows -> inline keyboard
const esc = (t) => String(t ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const markup = (kb) => kb && { inline_keyboard: kb.map((row) => row.map((b) => (b.url ? { text: b.text, url: b.url } : { text: b.text, callback_data: b.data }))) };

function createTelegram(token) {
  const base = `https://api.telegram.org/bot${token}`;
  async function call(method, params = {}) {
    const r = await fetch(`${base}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(params) });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) { const e = new Error(`tg ${method}: ${j.description || r.status}`); e.tg = j; throw e; }
    return j.result;
  }
  const common = { parse_mode: 'HTML', link_preview_options: { is_disabled: true } };
  return {
    call,
    send: (chat, text, kb) => call('sendMessage', { chat_id: chat, text, reply_markup: markup(kb), ...common }),
    edit: (chat, id, text, kb) => call('editMessageText', { chat_id: chat, message_id: id, text, reply_markup: markup(kb), ...common }),
    photo: (chat, url, caption, kb) => call('sendPhoto', { chat_id: chat, photo: url, caption, reply_markup: markup(kb), parse_mode: 'HTML' }),
    answer: (id, text) => call('answerCallbackQuery', { callback_query_id: id, text }),
    async file(fileId) {
      const f = await call('getFile', { file_id: fileId });
      const r = await fetch(`https://api.telegram.org/file/bot${token}/${f.file_path}`);
      if (!r.ok) throw new Error(`tg file: ${r.status}`);
      return Buffer.from(await r.arrayBuffer());
    },
  };
}

module.exports = { createTelegram, esc };
