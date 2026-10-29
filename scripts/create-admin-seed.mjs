#!/usr/bin/env node
import { createHash, randomBytes, randomUUID } from 'node:crypto';
const email=(process.argv[2]||'').trim().toLowerCase();
const role=(process.argv[3]||'admin').trim().toLowerCase();
if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){console.error('Uso: node scripts/create-admin-seed.mjs correo@dominio.ec [admin|editor|reviewer]');process.exit(1)}
if(!['admin','editor','reviewer'].includes(role)){console.error('Rol no válido: usa admin, editor o reviewer.');process.exit(1)}
const token=randomBytes(32).toString('base64url');
const hash=createHash('sha256').update(token).digest('hex');
const id=randomUUID();
const sql=`INSERT INTO admin_users(id,email,token_sha256,role,is_active) VALUES('${id}','${email.replaceAll("'","''")}','${hash}','${role}',1);`;
console.log('\nADMIN TOKEN (muévelo a un gestor de contraseñas; se muestra una sola vez):\n'+token+'\n');
console.log('SQL para la inicialización en D1 (contiene solo el hash, no el token):\n'+sql+'\n');
console.log('Guarda el token fuera del repositorio. Para revocarlo: UPDATE admin_users SET is_active=0 WHERE email=...;');
