import { json } from '../_lib/http.js';
export async function onRequestGet({ env }) {
  if (!env.DB) return json({ organizations:[], projects:[], publications:[], map:[], available:false });
  try {
    const [organizations,projects,publications,proposals,map]=await Promise.all([
      env.DB.prepare(`SELECT id,name,organization_type,description,province,canton,activity,materials,offerings,official_url,public_contact,last_verified_at FROM organizations o WHERE o.is_published=1 AND o.verification_status='verified' AND o.last_verified_at IS NOT NULL AND o.official_url IS NOT NULL AND EXISTS (SELECT 1 FROM sources s WHERE s.entity_type='organization' AND s.entity_id=o.id AND s.url=o.official_url) ORDER BY o.name LIMIT 300`).all(),
      env.DB.prepare(`SELECT id,name,project_type,problem,solution,results,province,canton,official_url,last_verified_at FROM projects p WHERE p.status='published' AND p.verification_status='verified' AND p.is_public=1 AND p.last_verified_at IS NOT NULL AND p.official_url IS NOT NULL AND EXISTS (SELECT 1 FROM sources s WHERE s.entity_type='project' AND s.entity_id=p.id AND s.url=p.official_url) ORDER BY p.name LIMIT 300`).all(),
      env.DB.prepare(`SELECT id,title,summary,category,source_url,published_on FROM publications WHERE status='published' ORDER BY published_on DESC LIMIT 50`).all(),
      env.DB.prepare(`SELECT id,title,problem,solution,province,stage,source_url,created_at FROM proposals WHERE status='approved' ORDER BY created_at DESC LIMIT 100`).all(),
      env.DB.prepare(`SELECT id,category,title,province,canton,latitude,longitude,source_url,verified_at FROM public_map_points LIMIT 1000`).all()
    ]);
    return json({available:true,organizations:organizations.results,projects:projects.results,publications:publications.results,proposals:proposals.results,map:map.results});
  } catch (e) { console.error('public_data_unavailable',e?.message);return json({available:false,organizations:[],projects:[],publications:[],map:[]},503); }
}
