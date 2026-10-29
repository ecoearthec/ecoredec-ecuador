import { json } from '../_lib/http.js';
const required = ['admin_users','reports','proposals','organizations','projects','publications','sources','submission_limits','admin_audit','public_map_points'];
export async function onRequestGet({ env }) {
  if (!env.DB) return json({ api:false, reports:false, reason:'database_not_configured' },503);
  try {
    for (const name of required) await env.DB.prepare(`SELECT * FROM ${name} LIMIT 0`).all();
    return json({ api:true, reports:Boolean(env.RATE_LIMIT_SECRET), environment:env.CF_PAGES_BRANCH==='local'?'local':'remote' });
  } catch (error) {
    console.error('d1_schema_check_failed',String(error?.message||'unknown').slice(0,160));
    return json({ api:false, reports:false, reason:'database_schema_not_ready' },503);
  }
}
