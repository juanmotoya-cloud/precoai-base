import fs from "node:fs";
import path from "node:path";
const root=path.resolve(process.cwd(),"..");
const cats=JSON.parse(fs.readFileSync(path.join(root,"dados/categorias.json"),"utf8"));
const cat=JSON.parse(fs.readFileSync(path.join(root,"dados/catalogo-sefaz.json"),"utf8"));
const norm=s=>String(s).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim().replace(/\s+/g," ");
const names=cats.categorias.flatMap(c=>c.produtos.map(norm)); const ids=new Set(); const errors=[];
for(const p of cat.produtos){if(!p.id||ids.has(p.id))errors.push(`ID duplicado/ausente: ${p.id}`);ids.add(p.id);if(!cats.categorias.some(c=>c.id===p.categoriaId))errors.push(`${p.id}: categoria inexistente`);for(const k of ["termosPesquisa","criteriosInclusao","criteriosExclusao"])if(!Array.isArray(p[k])||!p[k].length)errors.push(`${p.id}: ${k} vazio`);}
for(const n of names)if(!cat.produtos.some(p=>norm(p.nomeExibicao)===n))errors.push(`Sem regra: ${n}`);
console.log(`Produtos na interface: ${names.length}`);console.log(`Produtos no catálogo SEFAZ: ${cat.produtos.length}`);if(errors.length){console.error(errors.join("\n"));process.exit(1)}console.log("Validação concluída: catálogo consistente.");
