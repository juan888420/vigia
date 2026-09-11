// Sesión del navegador. Es la contraparte de apps/api/src/lib/auth.ts y es tan
// mínima como aquella: guardar un token, adjuntarlo donde hace falta y tirarlo
// cuando el API dice que ya no vale.
//
// El token vive en localStorage y NO en una cookie httpOnly. Es una decisión
// consciente con un coste conocido: cualquier XSS en esta app se lleva el
// token. Se acepta porque toda la app llama al API directamente desde el
// cliente —no hay ninguna capa de proxy en Next— y meterla solo para la sesión
// sería el cambio arquitectónico más grande del proyecto para proteger un
// token que ya caduca en 10 h y no da acceso a ninguna ruta del CRUD. Si algún
// día el API exige autenticación en todo, este módulo es el sitio donde se
// vuelve a discutir.
//
// Lo que NO hay, igual que en el API: registro, cambio de contraseña,
// refresh, y protección de rutas en servidor. `/login` es alcanzable a mano y
// ninguna pantalla se esconde: lo único autenticado hoy es una llamada.
//
// Módulo neutro (sin "use client"), igual que los *-form.ts: lo importa
// lib/api.ts, que a su vez usan los server components. Por eso `readToken`
// comprueba `window` antes de tocarlo — en el servidor devuelve null y
// `authHeader()` sale vacío, que es exactamente lo que corresponde allí.

const TOKEN_KEY = "vigia_token";

/** localStorage no existe en el render de servidor, y en un navegador con el
 *  almacenamiento bloqueado por política tirar excepción. Un fallo aquí
 *  significa "no hay sesión", nunca una pantalla en blanco. */
export function readToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function storeToken(token: string): void {
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Sin almacenamiento no hay sesión que recordar. El login ya redirigió y
    // la siguiente llamada autenticada pedirá volver a entrar.
  }
}

export function clearToken(): void {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Ver storeToken.
  }
}

/** Cabecera lista para extender los headers de una petición. Objeto vacío si
 *  no hay token: así la llamada sale igual y es el API quien responde 401, en
 *  vez de que esta app decida por su cuenta que el token no sirve. */
export function authHeader(): Record<string, string> {
  const token = readToken();
  return token === null ? {} : { Authorization: `Bearer ${token}` };
}

/** Lo que lanza `withAuth` cuando el API rechaza el token. Es un tipo aparte
 *  para que quien llama pueda distinguir "la sesión caducó" de "la petición
 *  estaba mal" sin mirar el texto del mensaje. */
export class UnauthenticatedError extends Error {
  constructor() {
    super("Tu sesión expiró. Vuelve a iniciar sesión.");
    this.name = "UnauthenticatedError";
  }
}

/**
 * Envuelve una llamada autenticada: si el API responde 401, borra el token y
 * manda a /login.
 *
 * La redirección se hace con `window.location` y no con el router de Next a
 * propósito: recarga la app entera, y eso descarta cualquier estado de
 * pantalla que se hubiera construido con una sesión que ya no existe.
 *
 * Se sigue lanzando el error después de programar la redirección. La
 * navegación no es instantánea y sin el throw el `await` de quien llamó
 * continuaría como si la petición hubiera ido bien.
 */
export async function withAuth<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (error instanceof Error && "status" in error && error.status === 401) {
      clearToken();
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
      throw new UnauthenticatedError();
    }
    throw error;
  }
}
