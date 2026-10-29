export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), { status, headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
    'cross-origin-opener-policy': 'same-origin',
    'content-security-policy': "default-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    ...extraHeaders
  } });
}
export function fail(message, status = 400) { return json({ error: message }, status); }
export function sameOrigin(request) {
  const origin = request.headers.get('Origin');
  return Boolean(origin) && origin === new URL(request.url).origin;
}
export async function readJson(request, maxBytes = 12000) {
  const declared = Number(request.headers.get('Content-Length') || 0);
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error('El formulario supera el tamaño permitido.');
  if (!request.body) throw new Error('No se pudo leer el formulario.');
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error('El formulario supera el tamaño permitido.');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let parsed;
  try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal:true }).decode(bytes)); }
  catch { throw new Error('No se pudo leer el formulario.'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('El formulario debe ser un objeto JSON.');
  return parsed;
}
export function cleanText(value, max) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
}
export function validEmail(value) { return !value || (value.length <= 160 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)); }
export function validHttpsUrl(value) { if (!value) return true; try { const u = new URL(value); return u.protocol === 'https:' || u.protocol === 'http:'; } catch { return false; } }
export function isIsoDate(value) { if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false; const d=new Date(`${value}T00:00:00.000Z`); return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0,10)===value; }
export const PROVINCES = new Set(['Azuay','Bolívar','Cañar','Carchi','Chimborazo','Cotopaxi','El Oro','Esmeraldas','Galápagos','Guayas','Imbabura','Loja','Los Ríos','Manabí','Morona Santiago','Napo','Orellana','Pastaza','Pichincha','Santa Elena','Santo Domingo de los Tsáchilas','Sucumbíos','Tungurahua','Zamora Chinchipe']);
export async function hashHex(value) {
  const out = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(out)].map(x => x.toString(16).padStart(2,'0')).join('');
}
export async function rateLimit(request, env, formType, limit) {
  if (!env.DB || !env.RATE_LIMIT_SECRET) return { ok: false, status: 503 };
  const ip = request.headers.get('CF-Connecting-IP');
  if (!ip) return { ok: false, status: 400 };
  const day = new Date().toISOString().slice(0,10);
  const ipHash = await hashHex(`${env.RATE_LIMIT_SECRET}:${day}:${ip}`);
  const now = Date.now();
  const windowStart = Math.floor(now / 600000) * 600000;
  await env.DB.prepare(`INSERT INTO submission_limits(ip_hash,form_type,window_start,count)
    VALUES(?,?,?,1) ON CONFLICT(ip_hash,form_type) DO UPDATE SET
    count=CASE WHEN submission_limits.window_start < excluded.window_start THEN 1 ELSE submission_limits.count+1 END,
    window_start=excluded.window_start`).bind(ipHash, formType, windowStart).run();
  const row = await env.DB.prepare('SELECT count FROM submission_limits WHERE ip_hash=? AND form_type=?').bind(ipHash, formType).first();
  if (Math.random() < 0.01) await env.DB.prepare('DELETE FROM submission_limits WHERE window_start < ?').bind(now - 48*60*60*1000).run();
  if (row?.count > limit) return { ok: false, status: 429 };
  return { ok: true, ipHash };
}
