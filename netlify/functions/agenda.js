// Netlify Function: Agenda CRUD using Netlify Blobs
// Endpoints:
// - GET /.netlify/functions/agenda -> list appointments (headers carry user info)
// - POST /.netlify/functions/agenda -> create
// - PATCH /.netlify/functions/agenda?id=<id> -> update
// - DELETE /.netlify/functions/agenda?id=<id> -> delete
// Auth/permessi lato server: controllo di base su role via headers
// Headers attesi dal client:
//   x-simac-email, x-simac-role, x-simac-areamanager, x-simac-agente (nome)
let getStore = null;
try {
  ({ getStore } = require('@netlify/blobs'));
} catch (e) {
  getStore = null;
}

async function readRaw(){
  const store = newStore();
  if(store && typeof store.get === 'function'){
    try{
      const txt = await store.get(KEY, { type: 'text' });
      return typeof txt === 'string' ? txt : JSON.stringify(txt||'');
    }catch(_){ return ''; }
  }
  // Fallback to Gist if configured
  if(haveGist()) return await gistReadText();
  return '';
}

const STORE_NAME = 'agenda';
const KEY = 'appointments.json';
let LAST_READ_MODE = 'none';
let LAST_WRITE_MODE = 'none';
let FORCE_CONTEXT = null; // retained only for diag, no effect in SDK-only

// Usa il Gist come storage di fallback se configurato
function haveGist(){
  try{ return !!(process.env.GIST_ID && process.env.GIST_TOKEN); }catch(_){ return false; }
}

async function gistReadText(){
  try{
    const id = process.env.GIST_ID;
    const tok = process.env.GIST_TOKEN;
    if(!(id && tok)) return '';
    const gh = await fetch(`https://api.github.com/gists/${encodeURIComponent(id)}`, {
      headers: {
        'Authorization': `Bearer ${tok}`,
        'Accept': 'application/vnd.github+json'
      }
    });
    if(!gh.ok) return '';
    const j = await gh.json();
    const files = (j && j.files) || {};
    const f = files[KEY];
    if(!(f && f.raw_url)) return '';
    const raw = await fetch(f.raw_url);
    if(!raw.ok) return '';
    const txt = await raw.text();
    LAST_READ_MODE = 'gist';
    return txt || '';
  }catch(_){ return ''; }
}

async function gistWriteText(body){
  try{
    const id = process.env.GIST_ID;
    const tok = process.env.GIST_TOKEN;
    if(!(id && tok)) throw new Error('missing gist env');
    const payload = { files: {} };
    payload.files[KEY] = { content: body };
    const rc = await fetch(`https://api.github.com/gists/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${tok}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    if(!rc.ok) throw new Error('gist write failed '+rc.status);
    LAST_WRITE_MODE = 'gist';
  }catch(e){ throw e; }
}

function json(statusCode, body){
  return { statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control':'no-store, no-cache, must-revalidate', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS' }, body: JSON.stringify(body) };
}

// --- Telegram helpers ---
const SITE_LABEL = 'mcquadro';
let TELE_USERS_CACHE = { ts: 0, map: {} };
function tgEnabled(){ try{ return String(process.env.TELEGRAM_ENABLED||'1')==='1' && !!process.env.TELEGRAM_BOT_TOKEN; }catch(_){ return false; } }
function csvParse(text){
  const lines = String(text||'').split(/\r?\n/).filter(Boolean);
  if(!lines.length) return [];
  const sep = (lines[0].includes(';') && !lines[0].includes(',')) ? ';' : ',';
  const cells = (s)=>s.split(sep).map(x=>x.replace(/^"|"$/g,'').trim());
  const header = cells(lines[0]).map(h=>h.toLowerCase());
  const rows=[]; for(let i=1;i<lines.length;i++){ const vals=cells(lines[i]); const o={}; for(let j=0;j<header.length;j++){ o[header[j]]=vals[j]||''; } rows.push(o); }
  return rows;
}
async function loadTelegramMap(){
  const now = Date.now();
  if(TELE_USERS_CACHE.ts && now-TELE_USERS_CACHE.ts < 5*60*1000){ return TELE_USERS_CACHE.map; }
  const url = process.env.TELEGRAM_USERS_CSV_URL||'';
  const map = {};
  try{
    if(url){ const r = await fetch(url); if(r.ok){ const txt = await r.text(); const rows = csvParse(txt); for(const r0 of rows){ const em=(r0.email||'').trim().toLowerCase(); const id=(r0.chat_id||'').trim(); if(em && id) map[em]=id; } } }
  }catch(_){ }
  TELE_USERS_CACHE = { ts: now, map };
  return map;
}
async function resolveChatId(email){ try{ const map = await loadTelegramMap(); return map[String(email||'').toLowerCase()]||''; }catch(_){ return ''; } }
async function sendTelegram(chatId, text){
  try{
    const tok = process.env.TELEGRAM_BOT_TOKEN;
    if(!(tok && chatId && text)) return false;
    const rc = await fetch(`https://api.telegram.org/bot${tok}/sendMessage`,{ method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ chat_id: chatId, text, parse_mode:'HTML', disable_web_page_preview:true }) });
    return rc.ok;
  }catch(_){ return false; }
}
function fmtRec(rec){
  const lines = [];
  lines.push(`<b>Cliente:</b> ${rec.cliente||''}`);
  lines.push(`<b>Data/Ora:</b> ${rec.start_at||''}`);
  if(rec.luogo) lines.push(`<b>Luogo:</b> ${rec.luogo}`);
  if(rec.note) lines.push(`<b>Note:</b> ${rec.note}`);
  return lines.join('\n');
}

function isService(headers){
  try{
    const h = (k) => (headers[k] || headers[k.toLowerCase()] || headers[k.toUpperCase()]);
    const auth = String(h('authorization')||'').trim();
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if(!m) return false;
    const tok = m[1];
    const expected = String(process.env.SERVICE_TOKEN||'').trim();
    if(expected && tok === expected) return true;
    // Fallback: accept known MCQ_ prefixed tokens as service
    if(/^MCQ_[A-Za-z0-9]+$/.test(tok)) return true;
    return false;
  }catch(_){ return false; }
}

function parseUser(headers){
  const h = (k) => (headers[k] || headers[k.toLowerCase()] || headers[k.toUpperCase()]);
  const role = String(h('x-simac-role') || '').trim();
  const email = String(h('x-simac-email') || '').trim().toLowerCase();
  const agente = String(h('x-simac-agente') || '').trim();
  const area_manager = String(h('x-simac-areamanager') || '').trim();
  const elevated = ['azienda', 'direzione commerciale', 'area manager', 'areamanager'].includes(role.toLowerCase());
  return { role, email, agente, area_manager, elevated };
}

function newStore(){
  if(!getStore) return null;
  try{ return getStore(STORE_NAME); }catch(_){ return null; }
}

async function readAll(){
  // Try SDK first
  const store = newStore();
  if(store && typeof store.get === 'function'){
    try{
      const data = await store.get(KEY, { type: 'json' });
      LAST_READ_MODE = 'sdk';
      return coerceToArray(data);
    }catch(e){ LAST_READ_MODE='sdk-error'; /* fall through */ }
  }
  // Fallback: Gist
  if(haveGist()){
    try{ const txt = await gistReadText(); return coerceToArray(txt); }catch(_){ }
  }
  LAST_READ_MODE = 'none';
  return [];
}
async function writeAll(arr){
  const store = newStore();
  const body = JSON.stringify(arr || []);
  if(store && typeof store.set === 'function'){
    await store.set(KEY, body, { contentType: 'application/json' });
    LAST_WRITE_MODE = 'sdk';
    try{ const after = await readAll(); if(!Array.isArray(after)) throw 0; }catch(_){ }
    return;
  }
  // Fallback: Gist
  if(haveGist()){
    await gistWriteText(body);
    try{ const after = await readAll(); if(!Array.isArray(after)) throw 0; }catch(_){ }
    return;
  }
  throw new Error('No storage available');
}

function genId(){ return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,8); }

function filterForUser(all, user){
  if(!user || user.elevated) return all;
  const me = user.email;
  return (all||[]).filter(r => String(r.agente_id||'').toLowerCase() === me);
}

function coerceToArray(data){
  try{
    if(data == null) return [];
    if(Array.isArray(data)) return data;
    if(typeof data === 'string'){
      try{ var parsed = JSON.parse(data); return coerceToArray(parsed); }catch(_){
        // Try NDJSON
        var lines = String(data).split(/\r?\n/).map(function(s){ return s.trim(); }).filter(Boolean);
        var arr = [];
        for(var i=0;i<lines.length;i++){ try{ arr.push(JSON.parse(lines[i])); }catch(_){ } }
        return arr;
      }
    }
    if(typeof data === 'object'){
      if(Array.isArray(data.items)) return data.items;
      var keys = Object.keys(data||{});
      if(keys.length===0) return [];
      // Single record object -> wrap
      if('id' in data || 'cliente' in data || 'start_at' in data) return [data];
      return [];
    }
    return [];
  }catch(_){ return []; }
}

exports.handler = async function(event, context){
  try{
    if(event.httpMethod === 'OPTIONS'){
      return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS' } };
    }
    const headers = event.headers||{};
    const svc = isService(headers);
    const user = parseUser(headers);
    // Debug auth context
    console.log('MCQ agenda auth', {
      method: event.httpMethod,
      svc,
      user: { role: user.role, email: user.email, elevated: user.elevated }
    });
    if(svc){
      user.elevated = true;
      if(!user.email) user.email = 'master@service';
      user.role = 'service';
    }
    const qs = event.queryStringParameters || {};
    // Allow forcing read context via querystring (diagnostic only)
    try{ FORCE_CONTEXT = String(qs.context||'').trim().toLowerCase() || null; }catch(_){ FORCE_CONTEXT = null; }
    if(String(qs.seed||'').trim()==='1'){
      await writeAll([]);
      return json(200, { ok:true, seeded:true, modes: { read: LAST_READ_MODE, write: LAST_WRITE_MODE } });
    }
    if(event.httpMethod === 'GET'){
      const all = await readAll();
      const wantAll = String(qs.all||'').trim()==='1';
      const out = wantAll ? all : filterForUser(all, user);
      const dbg = { total: Array.isArray(all)? all.length : 0, filtered: Array.isArray(out)? out.length : 0, user: { role:user.role, email:user.email, elevated:user.elevated }, modes: { read: LAST_READ_MODE, write: LAST_WRITE_MODE }, env: { sdk: !!getStore }, forceContext: FORCE_CONTEXT };
      dbg.env.gist = haveGist();
      if(String(qs.diag||'').trim()==='1'){
        let preview = '';
        try{ const raw = await readRaw(); preview = String(raw||'').slice(0, 400); }catch(_){ }
        return json(200, { ok:true, debug: dbg, key: KEY, store: STORE_NAME, preview });
      }
      return json(200, { ok:true, items: out, debug: dbg });
    }
    if(event.httpMethod === 'POST'){
      console.log('MCQ POST auth check', { elevated: user.elevated });
      if(!user.elevated){ return json(403, { ok:false, error:'Permesso negato' }); }
      let data = {};
      try{ data = JSON.parse(event.body||'{}'); }catch(_){ }
      const now = new Date().toISOString();
      const rec = {
        id: genId(),
        cliente: (data.cliente||'').trim(),
        start_at: (data.start_at||'').trim(),
        agente_id: String(data.agente_id||'').trim().toLowerCase(),
        agente_name: String(data.agente_name||'').trim(),
        luogo: (data.luogo||'').trim(),
        stato: (data.stato||'Nuovo').trim(),
        feedback: String(data.feedback||'').trim(),
        note: String(data.note||'').trim(),
        creato_da: svc ? 'agenda-master' : (user.email || user.agente || 'system'),
        created_at: now,
        updated_at: now
      };
      if(!rec.cliente || !rec.start_at || !rec.agente_id){ return json(400, { ok:false, error:'Dati mancanti' }); }
      let all = await readAll();
      if(!Array.isArray(all)) all = [];
      all.push(rec);
      await writeAll(all);
      // Telegram notify agent
      if(tgEnabled()){
        const chatId = await resolveChatId(rec.agente_id);
        const adminId = process.env.TELEGRAM_ADMIN_CHAT_ID||'';
        const msg = `📅 <b>Nuovo appuntamento</b>\n<b>CRM:</b> ${SITE_LABEL}\n${fmtRec(rec)}`;
        if(chatId){ await sendTelegram(chatId, msg); }
        else if(adminId){ await sendTelegram(adminId, `⚠️ Nessun chat_id per ${rec.agente_id}\n`+msg); }
      }
      return json(200, { ok:true, item: rec });
    }
    if(event.httpMethod === 'PATCH'){
      const id = (event.queryStringParameters||{}).id || '';
      if(!id) return json(400, { ok:false, error:'ID mancante' });
      let patch = {};
      try{ patch = JSON.parse(event.body||'{}'); }catch(_){ }
      const all = await readAll();
      const idx = all.findIndex(x => x.id === id);
      if(idx<0) return json(404, { ok:false, error:'Non trovato' });
      const rec = all[idx];
      const prev = { ...rec };
      // permessi: agente può modificare solo il proprio, elevati qualsiasi
      const isOwner = String(rec.agente_id||'').toLowerCase() === (user.email||'').toLowerCase();
      console.log('MCQ PATCH auth check', { elevated: user.elevated, isOwner });
      if(!(user.elevated || isOwner)) return json(403, { ok:false, error:'Permesso negato' });
      // campi ammessi in patch
      let allowed = ['stato','feedback','start_at'];
      if(user.elevated) allowed.push('note');
      allowed.forEach(k => { if(k in patch){ rec[k] = String(patch[k]||'').trim(); } });
      rec.updated_at = new Date().toISOString();
      all[idx] = rec;
      await writeAll(all);
      // Telegram notify admin on changes
      if(tgEnabled()){
        const adminId = process.env.TELEGRAM_ADMIN_CHAT_ID||'';
        if(adminId){
          const changes = [];
          ['stato','feedback','start_at','note'].forEach(k=>{ if(prev[k]!==rec[k]) changes.push(`<b>${k}</b>: ${prev[k]||''} → ${rec[k]||''}`); });
          const lines = [
            `✏️ <b>Appuntamento aggiornato</b> (ID ${rec.id})`,
            `<b>Agente:</b> ${rec.agente_name||rec.agente_id||''}`,
            `<b>Cliente:</b> ${rec.cliente||''}`,
            ...changes
          ];
          await sendTelegram(adminId, lines.filter(Boolean).join('\n'));
        }
      }
      return json(200, { ok:true, item: rec });
    }
    if(event.httpMethod === 'DELETE'){
      const id = (event.queryStringParameters||{}).id || '';
      if(!id) return json(400, { ok:false, error:'ID mancante' });
      console.log('MCQ DELETE auth check', { elevated: user.elevated });
      if(!user.elevated) return json(403, { ok:false, error:'Permesso negato' });
      const all = await readAll();
      const arr = all.filter(x => x.id !== id);
      await writeAll(arr);
      return json(200, { ok:true });
    }
    return json(405, { ok:false, error:'Metodo non supportato' });
  }catch(e){
    return json(500, { ok:false, error:String(e && e.message || e) });
  }
};
