import { json, fail, sameOrigin, readJson, cleanText, validHttpsUrl, PROVINCES, rateLimit } from '../_lib/http.js';
const stages = new Set(['Idea inicial','En evaluación','En implementación','Implementada con resultados por documentar']);
export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return fail('Origen no permitido.',403);
  if (!env.DB || !env.RATE_LIMIT_SECRET) return fail('La recepción de propuestas aún no está habilitada.',503);
  let d; try { d=await readJson(request,10000); } catch(e) { return fail(e.message,400); }
  if(cleanText(d.website,200)) return json({accepted:true});
  const started=Number(d.form_started_at), now=Date.now();
  if(!Number.isFinite(started)||now-started<2500||now-started>2*60*60*1000)return fail('No se pudo validar el envío. Recarga el formulario e inténtalo otra vez.',400);
  const title=cleanText(d.title,120), problem=cleanText(d.problem,700), solution=cleanText(d.solution,1200), province=cleanText(d.province,40), stage=cleanText(d.stage,80), source=cleanText(d.source,600);
  if(title.length<5||problem.length<20||solution.length<20||!PROVINCES.has(province)||!stages.has(stage)||!validHttpsUrl(source))return fail('Revisa título, problema, solución, provincia y referencia.',422);
  const limit=await rateLimit(request,env,'proposal',3);
  if(!limit.ok)return fail(limit.status===429?'Has alcanzado el límite temporal. Espera unos minutos antes de volver a enviar.':'La recepción no está disponible ahora.',limit.status);
  const id=crypto.randomUUID();
  try { await env.DB.prepare(`INSERT INTO proposals(id,title,problem,solution,province,stage,source_url,status) VALUES(?,?,?,?,?,?,?,'pending_review')`).bind(id,title,problem,solution,province,stage,source||null).run(); return json({accepted:true,reference:id,status:'pending_review'},201); }
  catch(e){console.error('proposal_insert_failed',e?.message);return fail('No se pudo guardar la propuesta. Intenta más tarde.',500);}
}
