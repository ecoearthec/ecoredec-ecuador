import { json, fail, sameOrigin, readJson, cleanText, validEmail, isIsoDate, PROVINCES, rateLimit } from '../_lib/http.js';
const categories = new Set(['Acumulación de basura','Drenaje obstruido','Contaminación de río o quebrada','Vertido','Quema de residuos','Deterioro de espacio natural','Otro problema ambiental']);
export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return fail('Origen no permitido.', 403);
  if (!env.DB || !env.RATE_LIMIT_SECRET) return fail('La recepción de reportes aún no está habilitada.', 503);
  let d; try { d = await readJson(request, 9000); } catch (e) { return fail(e.message, 400); }
  if (cleanText(d.website,200)) return json({ accepted:true }); // honeypot; deliberately do not store
  const started = Number(d.form_started_at), now = Date.now();
  if (!Number.isFinite(started) || now-started < 2500 || now-started > 2*60*60*1000) return fail('No se pudo validar el envío. Recarga el formulario e inténtalo otra vez.', 400);
  const category=cleanText(d.category,80), description=cleanText(d.description,1200), province=cleanText(d.province,40), canton=cleanText(d.canton,80), occurred=cleanText(d.date,10), location=cleanText(d.location,200), contact=cleanText(d.contact,160);
  if (!categories.has(category) || description.length<20 || !PROVINCES.has(province) || !canton || !isIsoDate(occurred) || Date.parse(`${occurred}T00:00:00Z`)>Date.now() || !validEmail(contact)) return fail('Revisa categoría, descripción, provincia, cantón, fecha y correo opcional.', 422);
  const limit=await rateLimit(request,env,'report',5);
  if (!limit.ok) return fail(limit.status===429?'Has alcanzado el límite temporal. Espera unos minutos antes de volver a enviar.':'La recepción no está disponible ahora.',limit.status);
  const id=crypto.randomUUID();
  try {
    await env.DB.prepare(`INSERT INTO reports(id,category,description,province,canton,occurred_on,private_location,contact_email,status,public_consent)
      VALUES(?,?,?,?,?,?,?,?, 'received',?)`).bind(id,category,description,province,canton,occurred,location||null,contact||null,d.public_consent===true?1:0).run();
    return json({ accepted:true, reference:id, status:'received' },201);
  } catch (e) { console.error('report_insert_failed',e?.message); return fail('No se pudo guardar el reporte. Intenta más tarde.',500); }
}
