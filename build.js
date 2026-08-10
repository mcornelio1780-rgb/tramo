#!/usr/bin/env node
/* =============================================================================
   TRAMO — sincronizador del núcleo
   ---------------------------------------------------------------------------
   El núcleo (tramo-core.js) es UNA sola fuente de verdad. Este script lo copia
   dentro de cada HTML, entre las marcas CORE, para que cada archivo funcione
   solo, sin servidor, con doble clic.

   Úsalo así, cada vez que edites tramo-core.js:
       node build.js

   Nunca edites el código que está entre las marcas: se sobrescribe.
   ========================================================================== */
const fs = require("fs");
const path = require("path");

const DIR = __dirname;
const CORE = path.join(DIR, "tramo-core.js");
const FILES = ["index.html", "rutas.html", "gestor.html"];
const OPEN = "<!--CORE:inicio · generado por build.js, no editar a mano-->";
const CLOSE = "<!--CORE:fin-->";

if (!fs.existsSync(CORE)) {
  console.error("No encuentro tramo-core.js");
  process.exit(1);
}
const core = fs.readFileSync(CORE, "utf8");
const bloque = OPEN + "\n<script>\n" + core + "\n</script>\n" + CLOSE;

let ok = 0;
for (const f of FILES) {
  const p = path.join(DIR, f);
  if (!fs.existsSync(p)) { console.error("  falta " + f); continue; }
  let html = fs.readFileSync(p, "utf8");

  const i = html.indexOf(OPEN);
  if (i >= 0) {
    // ya tiene el núcleo incrustado: lo reemplazamos
    const j = html.indexOf(CLOSE, i);
    if (j < 0) { console.error("  " + f + ": marca de cierre perdida"); continue; }
    html = html.slice(0, i) + bloque + html.slice(j + CLOSE.length);
  } else if (html.includes('<script src="tramo-core.js"></script>')) {
    html = html.replace('<script src="tramo-core.js"></script>', bloque);
  } else {
    console.error("  " + f + ": no encuentro dónde poner el núcleo");
    continue;
  }
  fs.writeFileSync(p, html);
  console.log("  " + f + " actualizado (" + Math.round(core.length / 1024) + " KB de núcleo)");
  ok++;
}
console.log(ok + " de " + FILES.length + " archivos sincronizados.");
