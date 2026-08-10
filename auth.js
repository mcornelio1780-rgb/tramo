/* =============================================================================
   TRAMO — conector de acceso real
   Le da "corriente" al modal nativo del núcleo (Google, Apple y enlace por
   correo) contra Supabase Auth, y hace que la sesión y el plan del usuario
   salgan de Supabase — tal como dice la nota del núcleo.

   No toca la zona CORE. Usa lo que el núcleo expone en window.TRAMO
   (session, openLogin, toast, store, LI). Si Supabase no está configurado,
   no hace nada y queda el prototipo local intacto.
   ========================================================================== */
(function () {
  var T = window.TRAMO;
  if (!T || !T.session) return;

  var AL = {
    checkMail: ["Te enviamos un enlace a tu correo. Ábrelo para entrar.", "We sent a link to your email. Open it to sign in.", "Enviamos um link para seu e-mail. Abra-o para entrar."],
    err: ["No se pudo iniciar sesión. Intenta de nuevo.", "Couldn't sign in. Try again.", "Não foi possível entrar. Tente de novo."],
    noProvider: ["Ese acceso todavía no está activado en Supabase. Usa tu correo por ahora.", "That sign-in isn't enabled in Supabase yet. Use your email for now.", "Esse acesso ainda não está ativo no Supabase. Use seu e-mail por enquanto."],
    loading: ["Preparando el acceso… espera un segundo y vuelve a intentar. Si sigue, recarga la página.", "Getting sign-in ready… wait a second and try again. If it persists, reload.", "Preparando o acesso… espere um segundo e tente de novo. Se persistir, recarregue."]
  };
  function at(k) { var i = (typeof T.LI === "number" ? T.LI : 0); var a = AL[k]; return a ? (a[i] || a[0]) : k; }
  function toast(m) { try { T.toast(m); } catch (e) {} }

  var sb = null, listo = false;
  var origSignOut = (T.session && typeof T.session.signOut === "function") ? T.session.signOut.bind(T.session) : function () {};

  /* Carga la librería de Supabase aunque la etiqueta <script> haya fallado. */
  function cargarLib() {
    if (window.supabase) return Promise.resolve(window.supabase);
    return new Promise(function (res) {
      var s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js";
      s.onload = function () { res(window.supabase || null); };
      s.onerror = function () { res(null); };
      document.head.appendChild(s);
    });
  }

  async function planDe(uid) {
    try {
      var r = await sb.from("suscripciones").select("plan,estado").eq("usuario_id", uid).maybeSingle();
      var d = r && r.data;
      if (d && d.estado === "activa" && ["pro", "anual", "fundador"].indexOf(d.plan) >= 0) return d.plan;
    } catch (e) {}
    return "free";
  }
  async function aplicar(u) {
    if (u) { T.store.set("tramo_user", u.email || u.id); var p = await planDe(u.id); T.session.setPlan(p); }
    else { T.store.set("tramo_user", ""); T.session.setPlan("free"); }
  }

  function accion(via) {
    if (!sb) { toast(at("loading")); return; }
    if (via === "mail") {
      var el = document.getElementById("tramoMail");
      var mail = el ? (el.value || "").trim() : "";
      if (!mail) return;
      sb.auth.signInWithOtp({ email: mail, options: { emailRedirectTo: location.origin + "/gestor.html" } })
        .then(function (r) { if (r && r.error) { toast(r.error.message); } else { toast(at("checkMail")); if (T.closeLogin) T.closeLogin(); } })
        .catch(function () { toast(at("err")); });
    } else {
      sb.auth.signInWithOAuth({ provider: via, options: { redirectTo: location.origin + "/gestor.html" } })
        .then(function (r) { if (r && r.error) { toast(/enabled|provider|not\s|unsupported/i.test(r.error.message) ? at("noProvider") : r.error.message); } })
        .catch(function () { toast(at("err")); });
    }
  }

  /* Reemplaza los manejadores de prototipo del modal por acceso real. */
  function rebind() {
    var m = document.getElementById("tramoLogin");
    if (!m) return false;
    var botones = m.querySelectorAll("[data-via]");
    if (!botones.length) return false;
    botones.forEach(function (b) { b.onclick = function () { accion(b.dataset.via); }; });
    return true;
  }

  // El modal se monta al abrirse por primera vez; lo vigilamos y re-enlazamos.
  if (!rebind()) {
    var obs = new MutationObserver(function () { if (rebind()) obs.disconnect(); });
    try { obs.observe(document.body, { childList: true, subtree: true }); } catch (e) {}
  }

  // Cerrar sesión también cierra la de Supabase.
  T.session.signOut = function () { if (sb) { try { sb.auth.signOut(); } catch (e) {} } origSignOut(); };

  (async function init() {
    var cfg = null;
    try { var r = await fetch("/api/config"); if (r.ok) cfg = await r.json(); } catch (e) {}
    if (!cfg || !cfg.url || !cfg.anonKey) return; // sin config del servidor: queda el prototipo local
    var lib = await cargarLib();
    if (!lib) return;
    try { sb = lib.createClient(cfg.url, cfg.anonKey); } catch (e) { return; }
    listo = true;
    // La sesión real manda: limpia cualquier usuario de prototipo y refleja Supabase.
    sb.auth.onAuthStateChange(function (ev, ses) {
      if (ses && ses.user) { aplicar(ses.user); } else { aplicar(null); }
    });
  })();
})();
