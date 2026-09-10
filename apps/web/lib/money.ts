// Conversión entre el formato que se escribe (es-CO) y el que viaja al API.
//
// EL INCIDENTE QUE ORIGINA ESTE MÓDULO: escribir "29.842.662,44" —el formato
// en que están redactados los expedientes— guardaba 2.984.266.244, cien veces
// el valor real, porque el campo trataba lo tecleado como texto plano y nadie
// distinguía el separador de miles del decimal.
//
// La regla es una sola y no se negocia: al API SIEMPRE viaja la forma plana
// ("29842662.44", punto decimal, sin separadores), que es lo que aceptan
// `money` / `signedMoney` en apps/api/src/lib/validation.ts y lo que la base
// guarda como Decimal(15,2). Todo lo demás es presentación.
//
// Ante cualquier entrada que no se pueda interpretar con CERTEZA en es-CO, el
// parseo falla. Adivinar es exactamente lo que produjo el incidente: es
// preferible que el usuario corrija el campo a que el sistema elija por él.

/** Límite de la columna: Decimal(15,2), 13 enteros y 2 decimales. Es el mismo
 *  que aplican `money` y `signedMoney` en el API. */
const MAX_INTEGER_DIGITS = 13;
const MAX_DECIMALS = 2;

export type MoneyParseResult =
  | { ok: true; plain: string }
  | { ok: false; error: string };

/** Lo que el usuario puede teclear sin que se considere todavía un error:
 *  dígitos, puntos, una coma y el signo. Cualquier otro carácter es un error
 *  inmediato y no se filtra en silencio — borrar lo que alguien escribió sin
 *  decírselo es otra forma de adivinar. */
const ALLOWED = /^[-\d.,\s ]*$/;

/**
 * "29.842.662,44" → "29842662.44".
 *
 * Cadena vacía devuelve plano vacío: el campo opcional sin llenar no es un
 * error, y quien decide si puede faltar es el formulario, no esta función.
 */
export function parseMoneyEsCo(
  input: string,
  options: { allowNegative?: boolean } = {},
): MoneyParseResult {
  const raw = input.trim();
  if (raw === "") return { ok: true, plain: "" };

  if (!ALLOWED.test(raw)) {
    return { ok: false, error: "Solo se admiten cifras, puntos de miles y una coma decimal." };
  }

  // Los espacios (incluido el duro que insertan algunos formateadores) no
  // significan nada aquí.
  let body = raw.replace(/[\s ]/g, "");

  let negative = false;
  if (body.startsWith("-")) {
    if (!options.allowNegative) {
      return { ok: false, error: "Este valor no puede ser negativo." };
    }
    negative = true;
    body = body.slice(1);
  }
  if (body.includes("-")) {
    return { ok: false, error: "El signo solo puede ir al principio." };
  }
  if (body === "") return { ok: false, error: "Escribe una cifra." };

  const commas = body.split(",").length - 1;
  if (commas > 1) {
    return { ok: false, error: "Solo puede haber una coma decimal." };
  }

  const [integerPart, decimalPart = null] = body.split(",");

  if (decimalPart !== null) {
    if (decimalPart === "") {
      return { ok: false, error: "Faltan los decimales después de la coma." };
    }
    if (!/^\d+$/.test(decimalPart)) {
      return { ok: false, error: "Los decimales solo pueden ser cifras." };
    }
    if (decimalPart.length > MAX_DECIMALS) {
      return { ok: false, error: "Como máximo dos decimales." };
    }
  }

  const digits = parseIntegerPart(integerPart);
  if (!digits.ok) return digits;

  if (digits.value.length > MAX_INTEGER_DIGITS) {
    return { ok: false, error: `Como máximo ${MAX_INTEGER_DIGITS} cifras enteras.` };
  }

  // Se normaliza el cero a la izquierda ("007" → "7") pero se conserva al menos
  // un dígito, porque "0" es un valor legítimo.
  const integer = digits.value.replace(/^0+(?=\d)/, "");
  const plain = decimalPart === null ? integer : `${integer}.${decimalPart}`;

  return { ok: true, plain: negative ? `-${plain}` : plain };
}

/**
 * Valida la agrupación de miles y devuelve los dígitos sin puntos.
 *
 * Aquí está la defensa contra el incidente. Un punto en es-CO SOLO puede ser
 * separador de miles, así que los grupos tienen que cuadrar: "29.842.662" vale,
 * "29.84.2662" no, y "1234.5" tampoco — ese último es justo el caso peligroso,
 * porque en formato inglés significaría 1234,5 y en es-CO no significa nada.
 * Rechazarlo obliga a escribirlo bien en vez de guardar una cifra inventada.
 */
function parseIntegerPart(part: string): { ok: true; value: string } | { ok: false; error: string } {
  if (part === "") return { ok: true, value: "0" };

  if (!part.includes(".")) {
    if (!/^\d+$/.test(part)) {
      return { ok: false, error: "La parte entera solo puede ser cifras." };
    }
    return { ok: true, value: part };
  }

  const groups = part.split(".");
  if (groups.some((group) => !/^\d+$/.test(group))) {
    return { ok: false, error: "La parte entera solo puede ser cifras." };
  }
  if (groups[0].length < 1 || groups[0].length > 3) {
    return { ok: false, error: "Los miles se separan cada tres cifras: 29.842.662." };
  }
  if (groups.slice(1).some((group) => group.length !== 3)) {
    return {
      ok: false,
      error: "Los miles se separan cada tres cifras. Para decimales usa la coma: 1.234,56.",
    };
  }
  return { ok: true, value: groups.join("") };
}

const groupFormatter = new Intl.NumberFormat("es-CO", {
  useGrouping: true,
  maximumFractionDigits: 0,
});

/**
 * "29842662.44" → "29.842.662,44". La inversa de `parseMoneyEsCo`, usada para
 * mostrar lo que el API ya tiene guardado cuando se abre un formulario de
 * edición.
 *
 * Los decimales se pegan tal cual en vez de dejárselos a Intl: el valor llega
 * como string precisamente para no pasar por un double, y convertirlo a number
 * solo para formatearlo reintroduciría el redondeo que se quiso evitar.
 */
export function formatPlainToEsCo(plain: string): string {
  const trimmed = plain.trim();
  if (trimmed === "") return "";

  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;

  const [integer, decimals = null] = unsigned.split(".");
  if (!/^\d*$/.test(integer) || (decimals !== null && !/^\d*$/.test(decimals))) {
    // No es una forma plana: se devuelve intacto en vez de romper el campo.
    return plain;
  }

  const grouped = groupFormatter.format(BigInt(integer === "" ? "0" : integer));
  const body = decimals === null ? grouped : `${grouped},${decimals}`;
  return negative ? `-${body}` : body;
}

/**
 * Reagrupa lo que se está tecleando, sin exigir que ya esté completo.
 *
 * Se aplica en cada pulsación, así que tiene que tolerar estados intermedios
 * ("29.842.6", "1234,") y no puede rechazar nada: la validación de verdad la
 * hace `parseMoneyEsCo`. Si la parte entera todavía no es agrupable, se deja
 * como está en vez de reordenarla mientras el usuario escribe.
 */
export function formatWhileTyping(text: string, options: { allowNegative?: boolean } = {}): string {
  const negative = options.allowNegative && text.trimStart().startsWith("-");
  const body = text.replace(/[-\s ]/g, "");

  const commaIndex = body.indexOf(",");
  const integerDigits = (commaIndex === -1 ? body : body.slice(0, commaIndex)).replace(/\./g, "");
  const rest = commaIndex === -1 ? null : body.slice(commaIndex + 1).replace(/[.,]/g, "");

  if (!/^\d*$/.test(integerDigits)) return text;

  const grouped =
    integerDigits === "" ? "" : groupFormatter.format(BigInt(integerDigits.replace(/^0+(?=\d)/, "")));

  const decimals = rest === null ? "" : `,${rest.slice(0, MAX_DECIMALS)}`;
  return `${negative ? "-" : ""}${grouped}${decimals}`;
}

/**
 * ¿La entrada está a medio escribir, o ya es un error?
 *
 * Hace falta porque el camino hasta una cifra válida pasa por estados que no
 * lo son: "29.842.662,44" se teclea atravesando "29.", "29.8" y "29.842.662,".
 * Marcar error en cada uno haría el campo inusable.
 *
 * NO es una segunda validación: quien decide si algo se envía es siempre
 * `parseMoneyEsCo`. Esta función solo decide si MOSTRAR el error todavía. Un
 * valor "a medio escribir" tampoco se envía — sale como cadena vacía y el
 * formulario sigue bloqueado.
 *
 * La distinción fina está en el último grupo: en "29.8" el 8 puede ser el
 * principio de "842", así que se tolera; en "1234.5" el primer grupo ya tiene
 * cuatro cifras y ninguna continuación lo arregla, así que es un error de
 * verdad — y es justo el caso que infló el valor del incidente.
 */
export function isIncompleteEntry(
  input: string,
  options: { allowNegative?: boolean } = {},
): boolean {
  let body = input.trim().replace(/[\s ]/g, "");
  if (options.allowNegative && body.startsWith("-")) body = body.slice(1);

  if (body === "" || body === "-") return true;
  if (!/^[\d.,]*$/.test(body)) return false;
  if (body.split(",").length > 2) return false;

  const [integerPart, decimalPart] = body.split(",");

  if (decimalPart !== undefined) {
    // La coma recién puesta: faltan los decimales y nada más. Vale tanto con
    // la parte entera ya completa ("29.842.662,") como a medio agrupar ("29.8,"
    // no llega a escribirse, pero "199," sí).
    if (decimalPart === "") {
      return (
        parseMoneyEsCo(integerPart).ok ||
        (integerPart.includes(".") && groupsPlausible(integerPart, true))
      );
    }
    if (!/^\d+$/.test(decimalPart) || decimalPart.length > MAX_DECIMALS) return false;
  }

  if (integerPart.endsWith(".")) return true;
  if (!integerPart.includes(".")) return false;

  return groupsPlausible(integerPart, decimalPart === undefined);
}

/** Agrupación de miles todavía alcanzable. `lastMayGrow` es false cuando ya se
 *  escribieron decimales: a esas alturas el último grupo ya no puede crecer. */
function groupsPlausible(integerPart: string, lastMayGrow: boolean): boolean {
  const groups = integerPart.split(".");
  if (groups.some((group) => !/^\d*$/.test(group))) return false;
  if (groups[0].length < 1 || groups[0].length > 3) return false;
  if (groups.slice(1, -1).some((group) => group.length !== 3)) return false;

  const last = groups[groups.length - 1];
  if (last.length === 3) return false;
  return lastMayGrow && last.length < 3;
}

/** Cifras significativas a la izquierda del cursor. Reponer el cursor contando
 *  dígitos —y no posiciones— es lo que evita que salte cuando el reagrupado
 *  inserta o quita un punto. */
export function countDigits(text: string, upTo: number): number {
  let count = 0;
  for (let i = 0; i < Math.min(upTo, text.length); i++) {
    if (text[i] >= "0" && text[i] <= "9") count++;
  }
  return count;
}

/** Posición equivalente a `digits` cifras contadas desde el inicio. */
export function offsetForDigits(text: string, digits: number): number {
  if (digits === 0) {
    // Justo detrás del signo, si lo hay: el cursor no debe caer delante de él.
    return text.startsWith("-") ? 1 : 0;
  }
  let seen = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] >= "0" && text[i] <= "9") {
      seen++;
      if (seen === digits) return i + 1;
    }
  }
  return text.length;
}
