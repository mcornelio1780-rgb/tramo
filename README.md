# TRAMO — cuántos días te alcanza

Calculadora de presupuesto y gestor de gastos para nómadas digitales.
Buscar es gratis e ilimitado; el gestor es lo que se cobra.

**Producto en tres idiomas: español, inglés y portugués.** El selector está en
la barra superior y recuerda la elección. Detecta el idioma del navegador la
primera vez.

## Archivos

| Archivo | Qué es | Idioma |
|---|---|---|
| `index.html` | Landing + calculadora. Motor completo en JS plano. | ES / EN / PT |
| `rutas.html` | **Nuevo.** Rutas día a día con el precio de cada parada, comparadas contra tu presupuesto. Acceso con Google/Apple/correo. | ES / EN / PT |
| `gestor.html` | Gestor: sobres, subtipos de transporte, perfil, facturación. | ES / EN / PT |
| `research-itinio.html` | Interno: análisis de Itinio, precios nuevos, estrategia de app. | ES |
| `manifest.webmanifest`, `sw.js`, `icon.svg` | Web instalable (PWA): icono propio y funciona sin conexión. | — |
| `plan-negocio.html` | Interno: modelo, precios, sprint de 15 días, APIs, Supabase. | ES |
| `punto-equilibrio.html` | Interno: costos, punto de equilibrio, CAC, sprint de 15 días. | ES |
| `api/` | Funciones para Vercel. | — |
| `netlify/functions/` | Las mismas funciones para Netlify. | — |
| `supabase/schema.sql` | Tablas, políticas RLS y triggers. | — |
| `DEPLOY.md` | Cómo subirlo a GitHub y publicarlo. | ES |
| `PAGOS.md` | Cómo cobrar con LLC estadounidense sin cuenta de empresa. | ES |

Los cuatro HTML son autocontenidos: se abren con doble clic y funcionan sin
servidor, usando la banda de precios local.

---

## Publicar

Pasos completos en **`DEPLOY.md`**. Resumen:

## GitHub y luego hosting

```bash
git init
git add .
git commit -m "TRAMO v0.3"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/tramo.git
git push -u origin main
```

### Dónde publicarlo — léelo antes de elegir

| Opción | Costo mes 1 | ¿Permite cobrar gratis? |
|---|---|---|
| **Netlify** | $0 | Sí — **recomendado** |
| Cloudflare Pages | $0 | Sí |
| Vercel | $20/mes | **No** en el plan gratuito |

El plan gratuito de Vercel restringe el uso a proyectos personales sin fin de
lucro y define uso comercial como cualquier despliegue que procese pagos de
sus visitantes. Como TRAMO cobra desde el día uno, ese plan queda descartado y
habría que pagar el de $20 al mes. Netlify permite cobrar en su capa gratuita.

El repositorio trae configuración para los dos (`netlify.toml` y `vercel.json`)
y las funciones duplicadas, así que cambiar después toma minutos.

**Netlify:** Add new site → Import an existing project → elige el repo.
No hace falta comando de build. Las funciones quedan en `/.netlify/functions`.

**Vercel:** Import Project → elige el repo. Las funciones quedan en `/api`.

### Activar precios de vuelo en vivo

1. Copia las variables de `.env.example` al panel de tu hosting.
2. Abre el sitio, despliega **Fuentes de datos** en la calculadora.
3. Pega `/.netlify/functions` (Netlify) o `/api` (Vercel) y pulsa **Probar conexión**.
4. Si responde, la etiqueta del resultado cambia a *precio en vivo*.

Sin claves el sitio funciona igual, con la banda estimada local.

---

## Claves

| Variable | Para qué | Costo |
|---|---|---|
| `SERPAPI_KEY` | Precio de vuelo vía motor `google_flights`. Devuelve el rango típico de la ruta. | 250 gratis/mes, luego $25/mes |
| `TRAVELPAYOUTS_TOKEN` | Respaldo automático y programa de afiliados. | Gratis, además paga comisión |
| `GOOGLE_MAPS_KEY` | Autocompletado de ciudades y distancias terrestres. | Crédito mensual gratuito |
| `SUPABASE_*` | Cuentas, base de datos y permisos. | Capa gratuita |

Google no tiene API pública de vuelos desde 2018. SerpApi es el intermediario
que lee Google Flights y devuelve `price_insights.typical_price_range`, que es
justo la banda que este producto necesita.

Restringe la clave de Google por dominio y por API en Google Cloud antes de
publicarla.

---

## Base de datos

1. Crea un proyecto en Supabase.
2. SQL Editor → New query → pega `supabase/schema.sql` completo → Run.
3. Copia la URL y la clave `anon` a las variables de entorno.

El esquema deja el RLS activado en todas las tablas de usuario. La clave `anon`
es pública por diseño; la seguridad la dan las políticas. La `service_role`
nunca va al navegador: solo la usa el webhook de pagos.

---

## Archivos

| Archivo | Qué es |
|---|---|
| `tramo-core.js` | **Núcleo compartido**: sesión, navegación entre las tres herramientas, idioma, instalación, buscador de ciudades. Es la única fuente de verdad. |
| `build.js` | Copia el núcleo dentro de los tres HTML. Ejecútalo tras cada cambio del núcleo. |
| `index.html` | Calculadora y portada |
| `rutas.html` | Rutas con precio, horarios, distancias y transporte multimodal. 7 ciudades curadas: Lima, Medellín, Lisboa, CDMX, Bangkok, Barcelona, Buenos Aires |
| `gestor.html` | Gestor con historial de viajes |
| `movil.html` | Vista previa de las pantallas en teléfono (interno) |
| `plan-negocio.html`, `punto-equilibrio.html`, `research-itinio.html` | Documentos internos |

## Si editas el núcleo

El núcleo vive en `tramo-core.js`, pero va **incrustado** dentro de cada HTML para
que cada archivo funcione con doble clic, sin servidor. Después de tocar el núcleo:

```bash
node build.js
```

Eso reescribe el bloque entre las marcas `<!--CORE:inicio-->` y `<!--CORE:fin-->`
de `index.html`, `rutas.html` y `gestor.html`. No edites nada dentro de esas marcas:
se sobrescribe en la siguiente ejecución.

## El flujo del producto

| Pantalla | Qué hace | Precio |
|---|---|---|
| `index.html` | Calcula cuántos días te alcanza el presupuesto, desde cualquier ciudad del mundo | Gratis e ilimitado, sin cuenta |
| `rutas.html` | Qué hacer en la ciudad, con el precio de cada parada y el día cuadrado contra tu presupuesto | Día 1 gratis · resto con pase $4.99 o Pro |
| `gestor.html` | Administra el dinero durante el viaje: sobres, límite diario, alertas | Pro $9/mes |

**Todos se registran**, gratis o de pago. El plan solo cambia a qué tienen acceso.
La sesión se comparte entre las tres pantallas y se cierra desde la barra superior,
que está en todas.

## El gestor guarda viajes, no un solo viaje

Cada viaje es un registro con destino, fecha de ida, fecha de vuelta, presupuesto y
sus propios gastos. Junio en Brasil y septiembre en Portugal quedan separados y se
exportan por separado. Cada gasto guarda su fecha real, su moneda original y el
equivalente en dólares del día, que son las columnas que un contador necesita.

Un usuario nuevo **no recibe datos de ejemplo**: recibe un onboarding de tres pasos
y un gestor vacío. Los datos de ejemplo existen, pero solo si los pide.

## De dónde salen los datos, sin pagar nada

| Qué | Fuente | Clave | Costo |
|---|---|---|---|
| Encontrar cualquier ciudad | **2.765 ciudades dentro del archivo** (244 países) | no | $0 |
| Ciudades fuera de esa lista | Open-Meteo Geocoding | no | $0 |
| Sitios de la ruta | OpenStreetMap vía Overpass | no | $0 |
| Costo de vida | 46 ciudades medidas + índice de 148 países | — | $0 |
| Precio de las paradas | Estimado por país y categoría | — | $0 |
| Vuelos | Motor propio calibrado | no | $0 |

**La búsqueda de ciudades funciona sin conexión.** La base va dentro del propio
archivo: todas las capitales, las cuatro mayores de cada país y todas las que
pasan de 250.000 habitantes, con los exónimos que la gente escribe de verdad
(*pekin* encuentra Beijing, *burdeos* encuentra Bordeaux, *londres* encuentra
London). La consulta externa solo añade lo que falte, y si no hay red no se nota.

Los sitios de la ruta sí necesitan internet en las ciudades que no están curadas,
porque vienen del mapa abierto. Cuando no hay red, la pantalla lo dice con esas
palabras y ofrece las ciudades curadas, que funcionan en un avión.

Lo estimado se marca como estimado en la propia pantalla; nunca se presenta como
dato medido.

Si conectas `GOOGLE_MAPS_KEY` y `SERPAPI_KEY`, las funciones de `api/` sustituyen
las estimaciones por datos en vivo sin tocar el resto del código.

## Buscador de origen

Cubre **208 ciudades en 117 países** sin conexión, y cualquier otra del planeta
mediante geocodificación. Escribe ciudad, país o código IATA. Detecta tu ciudad
automáticamente por zona horaria, sin pedir permiso de ubicación.

Cuando eliges una ciudad fuera de la lista, TRAMO busca el aeropuerto conocido
más cercano de ese país (148 países mapeados) y lo usa como referencia para el
precio del vuelo, avisándolo en pantalla.

## Verificación del motor de vuelos

Caso de control: **Lima → Lisboa, ida y vuelta, compra a 3–8 semanas,
temporada media** devuelve `$925 – $1,313` con precio típico `$1,100`.
El precio real observado en julio de 2026 era `$1,100`.

Para decidir si el presupuesto alcanza, el motor usa el **techo** de la banda
con el presupuesto mínimo y el **precio típico** con el máximo. Nunca promete
días que no existen.

El buscador de origen cubre **208 ciudades en 117 países**, de Lima a Kigali.
Busca por ciudad, país o código IATA de tres letras.

---

## Estado del prototipo

- Los datos viven en el navegador hasta que conectes Supabase.
- La facturación es una simulación: el botón explica que en producción abre el
  checkout alojado del proveedor. TRAMO nunca recibe números de tarjeta.
- El tipo de cambio del gestor sí es real y no necesita clave.

El siguiente paso está escrito como instrucción lista para pegar en Cursor, en
`plan-negocio.html`, sección **De HTML a app**.
