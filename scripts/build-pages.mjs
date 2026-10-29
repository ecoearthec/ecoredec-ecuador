import { mkdir, copyFile, cp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
const root=process.cwd(), out=resolve(root,'public');
await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
for(const file of ['index.html','styles.css','app.js','calculations.js','ecoredec-hero.jpg','admin.html','admin.js','_headers']) await copyFile(resolve(root,file),resolve(out,file));
await cp(resolve(root,'vendor/leaflet'),resolve(out,'vendor/leaflet'),{recursive:true});
console.log(`Static deployment output prepared in ${out}`);
