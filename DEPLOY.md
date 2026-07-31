# DESPLIEGUE — de tu computadora a internet en 20 minutos

Tres formas de subirlo. Elige una.

---

## Camino A — Claude Code (el más rápido si ya lo tienes)

Descomprime el ZIP, abre esa carpeta en la terminal y pega esto:

```
Crea un repositorio público en GitHub llamado "tramo", sube todos los archivos
de esta carpeta con un primer commit, y dime la URL cuando termines.
```

Claude Code se encarga del `git init`, el commit, crear el repo y el push.
Si te pide autenticarte con GitHub, sigue las instrucciones que te dé.

---

## Camino B — Terminal, a mano (5 comandos)

Necesitas Git instalado. Comprueba con `git --version`.

**1. Crea el repositorio vacío en GitHub**
Entra a https://github.com/new
- Repository name: `tramo`
- Público o privado, da igual
- **No marques** "Add a README", "Add .gitignore" ni "Choose a license".
  El ZIP ya los trae y si los marcas se pelean.
- Create repository

**2. Desde la carpeta descomprimida:**

```bash
cd tramo
git init
git add .
git commit -m "TRAMO v0.3 — calculadora trilingüe y gestor"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/tramo.git
git push -u origin main
```

Cambia `TU-USUARIO` por tu usuario real de GitHub.
Si te pide contraseña, no es tu contraseña: es un token. Créalo en
Settings → Developer settings → Personal access tokens → Tokens (classic)
→ Generate new token → marca `repo` → copia y pégalo como contraseña.

---

## Camino C — Sin terminal, arrastrando archivos

1. https://github.com/new → nombre `tramo` → Create repository
2. En la pantalla que aparece, clic en **uploading an existing file**
3. Descomprime el ZIP y arrastra **el contenido** de la carpeta (no la
   carpeta misma) a la ventana del navegador
4. Escribe un mensaje y **Commit changes**

Ojo con dos cosas: GitHub por web no sube carpetas vacías, y a veces oculta
los archivos que empiezan con punto (`.gitignore`, `.env.example`). Si no
aparecen, súbelos después uno por uno con **Add file → Create new file**.
No son imprescindibles para que el sitio funcione.

---

## Publicar el sitio

### Netlify — recomendado

Netlify permite cobrar dinero en su plan gratuito. Es la razón de la
recomendación, no la velocidad.

1. https://app.netlify.com → **Add new site** → **Import an existing project**
2. **Deploy with GitHub** → autoriza → elige `tramo`
3. No toques nada de la configuración: `netlify.toml` ya la define
4. **Deploy site**

En dos minutos tienes una URL tipo `nombre-random.netlify.app`.
Cámbiala en Site configuration → Change site name.

### Vercel — solo si aceptas pagar

El plan gratuito de Vercel prohíbe el uso comercial: define uso comercial como
cualquier despliegue que solicite o procese pagos de sus visitantes. Como
TRAMO cobra, ese plan queda descartado y toca el de $20 al mes desde el día
uno. El repositorio trae `vercel.json` y las funciones en `api/` por si aun
así lo prefieres.

1. https://vercel.com/new → importa `tramo`
2. Framework Preset: **Other**
3. Deploy

---

## Conectar el dominio

1. Compra `tramo.app` o similar (unos $11–15 al año)
2. Netlify: Domain management → Add a domain → sigue las instrucciones de DNS
3. El certificado HTTPS se activa solo en unos minutos

---

## Encender los precios de vuelo en vivo

Sin esto el sitio funciona igual, con la banda estimada local.

1. Crea cuenta en el proveedor de precios de vuelo y copia tu clave
2. Netlify: **Site configuration → Environment variables → Add a variable**
   - `SERPAPI_KEY` = tu clave
3. Vuelve a desplegar (Deploys → Trigger deploy)
4. Abre tu sitio → **Fuentes de datos** en la calculadora
5. Pega `/.netlify/functions` (o `/api` en Vercel) → **Probar conexión**
6. Si responde, la etiqueta del resultado cambia a *precio en vivo*

---

## Conectar la base de datos

1. https://supabase.com → New project (elige la región más cercana)
2. **SQL Editor → New query** → pega todo `supabase/schema.sql` → **Run**
3. Settings → API → copia `Project URL` y la clave `anon`
4. Ponlas como variables de entorno en tu hosting

La clave `anon` es pública por diseño. La seguridad la dan las políticas del
esquema, no esconder la clave. La `service_role` **nunca** va al navegador:
solo la usa el webhook de pagos.

---

## Orden recomendado para las primeras 48 horas

| Cuándo | Qué |
|---|---|
| Hora 1 | GitHub + Netlify. Sitio en vivo con URL de Netlify. |
| Hora 2 | Dominio comprado y apuntado. |
| Día 1 | Proveedor de pago y primer producto creado. Compra de prueba de $1. |
| Día 1 | Supabase con el esquema corriendo. |
| Día 2 | Clave de vuelos y webhook conectados. |
| Día 2 | Primeros mensajes a tu red. Empieza a entrar dinero. |

Lo único que no puede esperar es la compra de prueba de $1. Si el dinero no
llega a una cuenta tuya, todo lo demás es decoración.
