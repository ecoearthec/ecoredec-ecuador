import { json } from '../../_lib/http.js';
import { requireAdmin } from '../../_lib/admin.js';
export async function onRequestGet({request,env}){const admin=await requireAdmin(request,env,['admin','editor','reviewer']);if(!admin)return json({error:'No autorizado.'},401);const rows=await env.DB.prepare('SELECT id,title,problem,solution,province,stage,source_url,status,created_at,reviewed_at FROM proposals ORDER BY created_at DESC LIMIT 200').all();return json({items:rows.results});}
