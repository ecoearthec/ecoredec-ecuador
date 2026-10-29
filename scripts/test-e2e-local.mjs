import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const wrangler = resolve(root, 'node_modules/wrangler/bin/wrangler.js');
const temp = await mkdtemp(join(tmpdir(), 'ecoredec-pages-e2e-'));
const persist = join(temp, '.wrangler-test-state');
const logs = { output: '' };
let server;

function execute(args, cwd = temp) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [wrangler, ...args], { cwd, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', chunk => { out += chunk; });
    child.stderr.on('data', chunk => { out += chunk; });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolvePromise(out) : reject(new Error(`Wrangler exited ${code}: ${out}`)));
  });
}
function check(condition, message) { if (!condition) throw new Error(message); }
async function freePort() {
  const listener = createServer();
  await new Promise((resolvePromise, reject) => listener.once('error', reject).listen(0, '127.0.0.1', resolvePromise));
  const { port } = listener.address();
  await new Promise(resolvePromise => listener.close(resolvePromise));
  return port;
}
async function request(base, path, { method = 'GET', body, cookie, ip = '198.51.100.82', origin = base } = {}) {
  const headers = { Origin: origin, 'CF-Connecting-IP': ip };
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  return { status: response.status, headers: response.headers, data, text };
}
async function addAdmin(email, role) {
  const token = randomBytes(32).toString('base64url');
  const hash = createHash('sha256').update(token).digest('hex');
  const id = randomUUID();
  const sql = `INSERT INTO admin_users(id,email,token_sha256,role,is_active) VALUES('${id}','${email}','${hash}','${role}',1);`;
  await execute(['d1', 'execute', 'ecoredec-db', '--local', '--persist-to', persist, '--command', sql]);
  return token;
}
function assertStatus(result, status, label) {
  check(result.status === status, `${label}: expected ${status}, got ${result.status}: ${result.text}`);
}

try {
  await cp(join(root, 'public'), join(temp, 'public'), { recursive: true });
  await cp(join(root, 'functions'), join(temp, 'functions'), { recursive: true });
  await cp(join(root, 'migrations'), join(temp, 'migrations'), { recursive: true });
  const publicApp = await readFile(join(temp, 'public/app.js'), 'utf8');
  const publicHeaders = await readFile(join(temp, 'public/_headers'), 'utf8');
  check(publicApp.includes('MAP_TILES_APPROVED=false'), 'public map is not explicitly disabled');
  check(!publicHeaders.includes('tile.openstreetmap.org'), 'CSP currently permits unapproved map tiles');
  console.log('PASS map provider gate and restrictive CSP');
  let config = await readFile(join(root, 'wrangler.toml'), 'utf8');
  config = config.replace('REPLACE_WITH_D1_DATABASE_ID', '00000000-0000-4000-8000-000000000001');
  await writeFile(join(temp, 'wrangler.toml'), config);
  await writeFile(join(temp, '.dev.vars'), `RATE_LIMIT_SECRET=${randomBytes(32).toString('hex')}\n`);

  await execute(['d1', 'migrations', 'apply', 'ecoredec-db', '--local', '--persist-to', persist]);
  const adminToken = await addAdmin('test-admin@example.invalid', 'admin');
  const reviewerToken = await addAdmin('test-reviewer@example.invalid', 'reviewer');
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, [wrangler, 'pages', 'dev', 'public', '--ip', '127.0.0.1', '--port', String(port), '--persist-to', persist], { cwd: temp, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', chunk => { logs.output += chunk.toString(); });
  server.stderr.on('data', chunk => { logs.output += chunk.toString(); });

  let health;
  for (let i = 0; i < 80; i++) {
    if (server.exitCode !== null) throw new Error(`Pages dev exited early: ${logs.output}`);
    try { health = await request(base, '/api/health'); if (health.status === 200) break; } catch {}
    await new Promise(resolvePromise => setTimeout(resolvePromise, 400));
  }
  assertStatus(health, 200, 'health');
  check(health.data.api === true && health.data.reports === true && health.data.environment === 'local', 'health did not report ready local D1');
  check(health.headers.get('cache-control') === 'no-store' && health.headers.get('x-content-type-options') === 'nosniff' && health.headers.get('content-security-policy')?.includes("default-src 'none'"), 'API security headers missing');
  console.log('PASS local health, schema readiness and API security headers');
  for (const path of ['/', '/admin.html', '/styles.css', '/admin.js']) {
    const response = await fetch(base + path);
    check(response.status === 200, `static route ${path} returned ${response.status}`);
  }
  const staticHeaders = await fetch(base + '/admin.html');
  check(staticHeaders.headers.get('content-security-policy')?.includes("frame-ancestors 'none'"), 'static CSP missing');
  check(!staticHeaders.headers.get('content-security-policy')?.includes('tile.openstreetmap.org'), 'unapproved map tile host is CSP-allowed');
  console.log('PASS Pages static assets, admin route and CSP');

  assertStatus(await request(base, '/api/admin/reports'), 401, 'anonymous report queue');
  assertStatus(await request(base, '/api/reports', { method: 'POST', origin: 'https://untrusted.invalid', body: {} }), 403, 'cross-origin report submission');

  const started = () => Date.now() - 4000;
  const reportBody = () => ({ category: 'Vertido', description: 'Reporte de prueba local con información suficiente.', province: 'Pichincha', canton: 'Quito', date: '2026-10-29', location: 'Sector local de prueba', contact: 'private-test@example.invalid', public_consent: true, website: '', form_started_at: started() });
  const report = await request(base, '/api/reports', { method: 'POST', body: reportBody() });
  assertStatus(report, 201, 'report persistence');
  check(report.data.accepted === true && report.data.reference, 'report has no persisted reference');
  const proposal = await request(base, '/api/proposals', { method: 'POST', body: { title: 'Propuesta de prueba', problem: 'Problema ambiental descrito para la prueba local.', solution: 'Solución de prueba descrita con información suficiente.', province: 'Pichincha', stage: 'Idea inicial', source: 'https://example.org/test', website: '', form_started_at: started() } });
  assertStatus(proposal, 201, 'proposal persistence');
  check(proposal.data.status === 'pending_review', 'proposal did not start private/pending');
  console.log('PASS D1 report/proposal writes and pending states');

  const login = await request(base, '/api/admin/session', { method: 'POST', body: { token: adminToken } });
  assertStatus(login, 200, 'admin login');
  const adminCookie = login.headers.get('set-cookie')?.split(';', 1)[0];
  check(adminCookie?.startsWith('ecoredec_session='), 'admin session cookie missing');
  const cookieHeader = login.headers.get('set-cookie') || '';
  check(/HttpOnly/i.test(cookieHeader) && /SameSite=Strict/i.test(cookieHeader) && /Max-Age=28800/i.test(cookieHeader), 'session cookie flags missing');
  let queue = await request(base, '/api/admin/reports', { cookie: adminCookie });
  assertStatus(queue, 200, 'private admin report queue');
  check(JSON.stringify(queue.data).includes('private-test@example.invalid'), 'admin queue did not contain private submitter contact');

  const review = await request(base, `/api/admin/reports/${report.data.reference}`, { method: 'PATCH', cookie: adminCookie, body: { status: 'verified', public_summary: 'Resumen anónimo local', latitude: -0.2, longitude: -78.5, location_verified: true, location_public: true } });
  assertStatus(review, 200, 'consented report review');
  let publicData = await request(base, '/api/public-data');
  assertStatus(publicData, 200, 'public data');
  check(publicData.data.map.some(point => point.title === 'Resumen anónimo local'), 'approved anonymous report did not reach restricted map view');
  check(!publicData.text.includes('private-test@example.invalid') && !publicData.text.includes('Sector local de prueba'), 'private report data leaked to public API');
  const noConsent = await request(base, '/api/reports', { method: 'POST', body: { ...reportBody(), contact: '', public_consent: false } });
  assertStatus(noConsent, 201, 'non-consented report persistence');
  const deniedMap = await request(base, `/api/admin/reports/${noConsent.data.reference}`, { method: 'PATCH', cookie: adminCookie, body: { status: 'verified', public_summary: 'No debe publicarse', latitude: -0.2, longitude: -78.5, location_verified: true, location_public: true } });
  assertStatus(deniedMap, 409, 'location publication without consent');
  const crossOriginAdmin = await request(base, '/api/admin/records', { method: 'PATCH', cookie: adminCookie, origin: 'https://untrusted.invalid', body: { entity_type: 'source', id: randomUUID(), title: 'No', url: 'https://example.org', limitations: 'No' } });
  assertStatus(crossOriginAdmin, 403, 'cross-origin administrative mutation');
  console.log('PASS report moderation, consent enforcement and private-field exclusion');

  const org = await request(base, '/api/admin/records', { method: 'POST', cookie: adminCookie, body: { entity_type: 'organization', name: 'Organización E2E local', organization_type: 'Comunitaria', description: 'Registro temporal para la prueba de integración.', activity: 'Conservación', province: 'Pichincha', canton: 'Quito', official_url: 'https://example.org/org' } });
  assertStatus(org, 201, 'organization creation');
  const source = await request(base, '/api/admin/records', { method: 'POST', cookie: adminCookie, body: { entity_type: 'source', target_type: 'organization', target_id: org.data.id, title: 'Fuente E2E', url: 'https://example.org/org', limitations: 'Fuente sintética de prueba; no es evidencia real.', consulted_at: '2026-10-29T00:00:00Z' } });
  assertStatus(source, 201, 'source creation');
  const sourcePatch = await request(base, '/api/admin/records', { method: 'PATCH', cookie: adminCookie, body: { entity_type: 'source', id: source.data.id, title: 'Fuente E2E corregida', url: 'https://example.org/org', limitations: 'Fuente sintética de prueba; no es evidencia real.' } });
  assertStatus(sourcePatch, 200, 'source editing');
  const orgPatch = await request(base, '/api/admin/records', { method: 'PATCH', cookie: adminCookie, body: { entity_type: 'organization', id: org.data.id, verification_status: 'verified', last_verified_at: '2026-10-29', is_published: true, latitude: -0.2, longitude: -78.5, location_public: true } });
  assertStatus(orgPatch, 200, 'verified organization publishing');

  const project = await request(base, '/api/admin/records', { method: 'POST', cookie: adminCookie, body: { entity_type: 'project', name: 'Proyecto E2E local', project_type: 'Restauración', problem: 'Problema descrito exclusivamente para esta prueba local.', solution: 'Solución descrita exclusivamente para esta prueba local.', province: 'Pichincha', canton: 'Quito', official_url: 'https://example.org/project' } });
  assertStatus(project, 201, 'project creation');
  const projectSource = await request(base, '/api/admin/records', { method: 'POST', cookie: adminCookie, body: { entity_type: 'source', target_type: 'project', target_id: project.data.id, title: 'Fuente del proyecto E2E', url: 'https://example.org/project', limitations: 'Fuente sintética local.' } });
  assertStatus(projectSource, 201, 'project source creation');
  const projectPatch = await request(base, '/api/admin/records', { method: 'PATCH', cookie: adminCookie, body: { entity_type: 'project', id: project.data.id, verification_status: 'verified', last_verified_at: '2026-10-29', status: 'published', is_public: true, latitude: -0.21, longitude: -78.51, location_public: true } });
  assertStatus(projectPatch, 200, 'verified project publishing');

  const publication = await request(base, '/api/admin/records', { method: 'POST', cookie: adminCookie, body: { entity_type: 'publication', title: 'Publicación E2E local', summary: 'Registro temporal sin valor informativo externo.', category: 'Prueba', source_url: 'https://example.org/publication', published_on: '2026-10-29' } });
  assertStatus(publication, 201, 'publication creation');
  assertStatus(await request(base, '/api/admin/records', { method: 'PATCH', cookie: adminCookie, body: { entity_type: 'publication', id: publication.data.id, status: 'published' } }), 200, 'publication publishing');

  const reviewerLogin = await request(base, '/api/admin/session', { method: 'POST', body: { token: reviewerToken } });
  assertStatus(reviewerLogin, 200, 'reviewer login');
  const reviewerCookie = reviewerLogin.headers.get('set-cookie')?.split(';', 1)[0];
  assertStatus(await request(base, '/api/admin/reports', { cookie: reviewerCookie }), 200, 'reviewer report read permission');
  assertStatus(await request(base, '/api/admin/records', { method: 'PATCH', cookie: reviewerCookie, body: { entity_type: 'source', id: source.data.id, title: 'No autorizado', url: 'https://example.org/org', limitations: 'No autorizado' } }), 403, 'reviewer source-write denial');
  await request(base, '/api/admin/session', { method: 'DELETE', cookie: reviewerCookie });

  const proposalQueue = await request(base, '/api/admin/proposals', { cookie: adminCookie });
  assertStatus(proposalQueue, 200, 'proposal review queue');
  check(JSON.stringify(proposalQueue.data).includes(proposal.data.reference), 'proposal absent from private queue');
  assertStatus(await request(base, `/api/admin/proposals/${proposal.data.reference}`, { method: 'PATCH', cookie: adminCookie, body: { status: 'approved' } }), 200, 'proposal approval');
  publicData = await request(base, '/api/public-data');
  check(publicData.data.organizations.some(item => item.id === org.data.id), 'verified organization not public');
  check(publicData.data.projects.some(item => item.id === project.data.id), 'verified project not public');
  check(publicData.data.publications.some(item => item.id === publication.data.id), 'publication not public');
  check(publicData.data.proposals.some(item => item.id === proposal.data.reference), 'approved proposal not public');
  check(publicData.data.map.length >= 3, 'approved map records missing from API');
  check(!publicData.text.includes('private-test@example.invalid'), 'private contact leaked after editorial publishing');
  console.log('PASS organization/project/source/publication workflow, role restrictions and approved public data');

  for (let i = 0; i < 3; i++) assertStatus(await request(base, '/api/reports', { method: 'POST', body: reportBody() }), 201, `report rate-limit allowance ${i + 3}`);
  assertStatus(await request(base, '/api/reports', { method: 'POST', body: reportBody() }), 429, 'report rate limit');
  const proposalBody = { title: 'Otra propuesta de prueba', problem: 'Problema de prueba con extensión suficiente.', solution: 'Solución de prueba con extensión suficiente.', province: 'Pichincha', stage: 'Idea inicial', source: '', website: '', form_started_at: started() };
  for (let i = 0; i < 2; i++) assertStatus(await request(base, '/api/proposals', { method: 'POST', body: proposalBody }), 201, `proposal rate-limit allowance ${i + 2}`);
  assertStatus(await request(base, '/api/proposals', { method: 'POST', body: proposalBody }), 429, 'proposal rate limit');
  for (let i = 0; i < 6; i++) assertStatus(await request(base, '/api/admin/session', { method: 'POST', body: { token: 'invalid-test-token-'.padEnd(60, 'x') } }), 401, `login failure ${i + 1}`);
  assertStatus(await request(base, '/api/admin/session', { method: 'POST', body: { token: 'invalid-test-token-'.padEnd(60, 'x') } }), 429, 'login rate limit');
  await request(base, '/api/admin/session', { method: 'DELETE', cookie: adminCookie });
  assertStatus(await request(base, '/api/admin/reports'), 401, 'access after logout');
  console.log('PASS report/proposal/login rate limits, logout and post-logout access denial');
  console.log('E2E PASS: local-only D1 data was isolated in a temporary directory; no remote Cloudflare account/database was used.');
} catch (error) {
  console.error(error?.stack || error);
  if (logs.output) console.error('Wrangler log tail:\n' + logs.output.slice(-6000));
  process.exitCode = 1;
} finally {
  if (server && server.exitCode === null) {
    server.kill('SIGTERM');
    await new Promise(resolvePromise => {
      const timer = setTimeout(() => { if (server.exitCode === null) server.kill('SIGKILL'); resolvePromise(); }, 5000);
      server.once('exit', () => { clearTimeout(timer); resolvePromise(); });
    });
  }
  await rm(temp, { recursive: true, force: true });
}
