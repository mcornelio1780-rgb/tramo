# CÓMO COBRAR — tu situación concreta

Tienes una LLC en Estados Unidos, no tienes cuenta bancaria de empresa, sí
tienes una cuenta personal en Estados Unidos, y no tienes Stripe.

Esto no es asesoría legal ni contable. Son datos verificados en julio de 2026
para que llegues informado a la conversación con un contador. Las políticas de
estas plataformas cambian seguido: confirma en sus páginas antes de decidir.

---

## Lo primero, porque es lo que más caro sale

**No metas el dinero de la LLC en tu cuenta personal.**

Dos razones concretas:

1. **Rompe la protección de la LLC.** La única función de una LLC es separar
   tu patrimonio del de la empresa. Mezclar cuentas es el argumento clásico
   para desmontar esa separación en un juicio: si la empresa y tú comparten
   bolsillo, legalmente son la misma cosa. Pagaste por formar la LLC
   precisamente para evitar eso.
2. **Las plataformas lo rechazan.** Cuando registras la LLC como vendedor, la
   cuenta de destino tiene que estar a nombre de la LLC. Si pones una cuenta
   personal, la verificación falla o te congelan los pagos justo cuando ya
   tienes clientes esperando.

Puedes cobrar tus primeros dólares antes de tener la cuenta de empresa (más
abajo está cómo), pero no como plan permanente.

---

## Si eres residente fiscal fuera de Estados Unidos, pregunta esto ya

Una LLC de un solo dueño, cuando ese dueño no es persona estadounidense,
normalmente tiene que presentar el **Formulario 5472** junto con un **1120
proforma** cada año, aunque no haya tenido ingresos. **La multa por no
presentarlo empieza en $25,000.**

Es el error más caro que comete la gente con LLCs desde fuera, y no aparece en
ningún tutorial de "cómo abrir tu LLC en 10 minutos". Si tu contador no te ha
mencionado el 5472, cambia de contador o pregúntale hoy mismo. Esta guía no
puede decirte si aplica a tu caso porque depende de tu residencia fiscal.

---

## Paso 1 — ¿Tienes EIN?

El EIN es el número fiscal de la empresa que da el IRS. **Sin EIN no hay
cuenta bancaria de empresa ni Stripe.** Es el cuello de botella real: la
formación de la LLC toma un día, el EIN puede tomar semanas.

- ¿Ya lo tienes? Sigue al paso 2.
- ¿No lo tienes? Pídelo ya, en paralelo con todo lo demás. Se puede obtener
  sin número de seguro social.

---

## Paso 2 — Cuenta bancaria de la empresa

Se abre de forma remota, sin viajar. Todas piden LLC activa + EIN + documentos
de formación + una dirección estadounidense, que puede ser la de tu agente
registrado.

| Opción | Qué es | Nota real |
|---|---|---|
| **Wise Business** | La más fácil de aprobar. Cuentas en varias monedas. | Cuesta una vez unos $31 activar los datos bancarios de Estados Unidos. No es un banco: es una entidad de dinero electrónico, así que tus fondos no tienen seguro FDIC. |
| **Mercury** | La preferida de la mayoría. Integra directo con Stripe. | Tiene lista de países bloqueados y en 2025–2026 se puso bastante más estricta. |
| **Airwallex / Lili** | Alternativas cuando las dos de arriba rechazan. | Van cambiando de política seguido. |
| **Relay** | Sólida, pero pide número fiscal personal estadounidense. | Poco realista si no eres residente. |

**Consejo que vale dinero:** no apliques a cinco bancos a la vez. Cada rechazo
deja rastro y sube el riesgo percibido para el siguiente. Aplica a Wise
primero, cobra ahí unos meses, y con historial real aplica a Mercury.

---

## Paso 3 — Elegir cómo cobras

Aquí hay una decisión de fondo, y para TRAMO tiene respuesta clara.

### Procesador contra vendedor registrado

Un **procesador** (Stripe) solo mueve el dinero. Tú sigues siendo el vendedor
legal, así que tú eres responsable del impuesto de cada país: IVA europeo,
GST australiano, impuesto de venta de cada estado. TRAMO se lanza en tres
idiomas apuntando a Europa y a Latinoamérica: eso es exactamente el escenario
donde esto se vuelve inmanejable para una persona sola.

Un **vendedor registrado** (merchant of record) compra tu producto y lo revende
al cliente. Legalmente el vendedor es la plataforma, así que ellos cobran,
declaran y pagan el impuesto en cada país. Tú recibes un depósito limpio.

Cuesta entre 1.5 y 2 puntos porcentuales más que Stripe. Lo que compras con
esos dos puntos no es procesamiento: es no tener que registrarte fiscalmente
en veinte países.

**Para TRAMO: vendedor registrado.** Sin duda, y sobre todo el primer año.

### Las opciones concretas

| Plataforma | Comisión | Para quién |
|---|---|---|
| **Polar** | 4% + $0.40 | La más barata de las serias. Orientada a productos de desarrollo, pero funciona igual. |
| **Lemon Squeezy** | 5% + $0.50 | La más simple de montar para productos digitales. Suma 1.5% en tarjetas internacionales. Cobra 1% por pagar a cuentas fuera de Estados Unidos. |
| **Paddle** | ~5% | La más madura y la que cubre más países. Revisa cada cuenta y rechaza algunas categorías: tarda más en aprobarte. |
| **Creem / Dodo** | 3.9–4% + $0.40 | Más nuevas, pensadas para fundadores fuera de Estados Unidos. |
| **Gumroad** | ~10% | La más cara, pero la que menos pregunta. Sirve para cobrar hoy mismo. |

### Qué haría yo en tu lugar

**Hoy, para no perder el sprint de 15 días:** abre **Gumroad**. Vendes el plan
Fundador de $79 como producto digital, te da un enlace de pago en veinte
minutos y no exige cuenta de empresa. El 10% duele — sobre $4,000 son $400 —
pero perder una semana esperando aprobaciones cuesta más que $400.

**En paralelo, esta misma semana:** Wise Business con la LLC y el EIN. Cuando
esté aprobada, abre **Polar** o **Lemon Squeezy** con la LLC como vendedor y
Wise como cuenta de destino. Migras los productos y bajas del 10% al 4–5%.

**Stripe directo:** para más adelante. Necesita LLC + EIN + cuenta bancaria de
empresa, y aunque es más barato en comisión, te devuelve encima toda la
responsabilidad fiscal internacional. A tu volumen actual no compensa.

---

## Paso 4 — Conectar el cobro con el producto

El repositorio ya trae `api/webhook.js`. Es la pieza que escucha al proveedor
de pago y activa el plan Pro del usuario automáticamente.

1. En tu proveedor, crea cuatro productos con estos identificadores:
   `tramo-pro-mensual`, `tramo-pro-anual`, `tramo-fundador`, `tramo-pase-ciudad`
2. Configura el webhook apuntando a `https://tu-dominio/api/webhook`
3. Copia el secreto de firma del webhook a la variable `PAYMENT_WEBHOOK_SECRET`
4. Haz una compra de prueba y mira el evento en el panel del proveedor
5. Ajusta las tres líneas marcadas en el archivo al formato real de tu
   proveedor, porque cada uno nombra los campos distinto

**No saltes la verificación de firma.** Sin ella, cualquiera que descubra la
dirección del webhook puede regalarse el plan Pro mandando un mensaje falso.

---

## Resumen en cinco líneas

1. Gumroad hoy para cobrar esta semana, aunque cueste 10%.
2. EIN y Wise Business en paralelo.
3. Polar o Lemon Squeezy cuando tengas la cuenta, para bajar al 4–5%.
4. Nunca la cuenta personal como destino de la LLC.
5. Pregúntale a un contador por el Formulario 5472 antes de que se acabe el
   año fiscal.
