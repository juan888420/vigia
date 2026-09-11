import type { FastifyReply, FastifyRequest } from "fastify";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

// ─────────────────────────────────────────────────────────────────────────────
// Autenticación mínima: lo más pequeño que sirve para que `validatedById` sea
// una identidad verificable y no un campo decorativo.
//
// Lo que HAY: login con email + contraseña contra un hash bcrypt, un JWT
// firmado y un preHandler que lo verifica.
//
// Lo que NO hay, a propósito: registro público (los usuarios se crean con el
// script create-user), recuperación de contraseña, roles, permisos y refresh
// tokens. Tampoco hay revocación: un token robado vale hasta que expira. Para
// una app interna de una oficina con expiración de 10 h es un intercambio
// aceptable; si algún día hay que cerrar sesiones a demanda, hará falta estado
// en servidor y este módulo es el sitio donde se añade.
//
// No se usa @fastify/jwt: la única línea compatible con Fastify 4 arrastra
// fast-jwt <=6.2.3, con CVEs críticos de bypass de autenticación (entre ellos
// "empty HMAC secret accepted by async key resolver" y "Algorithm Confusion").
// El fix exige Fastify 5. jsonwebtoken hace el mismo trabajo, es independiente
// de la versión de Fastify y no arrastra ninguno de esos avisos.
// ─────────────────────────────────────────────────────────────────────────────

/** Coste de bcrypt. 12 son ~250 ms en hardware de escritorio: suficiente para
 *  que probar contraseñas por fuerza bruta no salga a cuenta, y despreciable en
 *  un login que un usuario hace una vez al día. */
const BCRYPT_ROUNDS = 12;

/** Jornada laboral con margen. Suficiente para no reautenticarse a mitad del
 *  día y corto para que un token olvidado en una máquina compartida caduque
 *  solo, ya que no hay revocación. */
const TOKEN_TTL = "10h";

/** Único algoritmo aceptado, declarado tanto al firmar como al verificar. Sin
 *  esta lista en `verify`, un token con `alg: "none"` o con un algoritmo
 *  distinto al previsto puede colarse: es la confusión de algoritmos clásica
 *  de JWT, y la defensa es no dejar que el token elija cómo se valida. */
const ALGORITHM = "HS256" as const;

/** Lo que va dentro del token. Deliberadamente mínimo: ni email ni nombre ni
 *  nada que pueda quedar obsoleto respecto a la base de datos. Un JWT va
 *  firmado pero NO cifrado — cualquiera que lo tenga lee su contenido. */
export interface TokenPayload {
  userId: string;
  officeId: string;
}

/** La identidad ya verificada que se cuelga de la request. */
export interface AuthenticatedUser {
  id: string;
  officeId: string;
}

declare module "fastify" {
  interface FastifyRequest {
    /** Presente solo en rutas que pasaron por `requireAuth`. En cualquier otra
     *  es undefined: el preHandler es lo único que lo puebla. */
    user?: AuthenticatedUser;
  }
}

/** Igual que con ANTHROPIC_API_KEY: se comprueba al usarlo y no al arrancar.
 *  El resto del API no depende de la autenticación y no tiene por qué dejar de
 *  levantar por esto. */
export function isAuthConfigured(): boolean {
  return Boolean(process.env.JWT_SECRET);
}

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    // Nunca un valor por defecto. Un secreto de relleno haría que la
    // autenticación "funcione" en un entorno mal configurado, que es
    // exactamente el fallo que no se detecta hasta que es tarde.
    throw new Error("JWT_SECRET no está definido");
  }
  return secret;
}

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, getSecret(), { algorithm: ALGORITHM, expiresIn: TOKEN_TTL });
}

/** El payload decodificado no se cree: se comprueba. `jwt.verify` garantiza la
 *  firma y la expiración, no que dentro venga lo que esperamos. */
function parsePayload(decoded: unknown): AuthenticatedUser | null {
  if (typeof decoded !== "object" || decoded === null) return null;
  const { userId, officeId } = decoded as Record<string, unknown>;
  if (typeof userId !== "string" || userId.length === 0) return null;
  if (typeof officeId !== "string" || officeId.length === 0) return null;
  return { id: userId, officeId };
}

/** preHandler reutilizable. Lee `Authorization: Bearer <token>`, lo verifica y
 *  decora `request.user`. Cualquier fallo es 401 con el mismo mensaje: decirle
 *  a quien prueba tokens si falló la firma, el formato o la expiración le
 *  ayuda a afinar el ataque y no le sirve de nada a un cliente legítimo.
 *
 *  NO está aplicado a ninguna ruta del CRUD actual: activarlo es una decisión
 *  aparte. */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  if (!isAuthConfigured()) {
    return reply.status(503).send({
      error: "La autenticación no está configurada: falta JWT_SECRET en el entorno del API",
    });
  }

  const header = request.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return reply.status(401).send({ error: "No autenticado" });
  }

  const token = header.slice("Bearer ".length).trim();
  if (token.length === 0) {
    return reply.status(401).send({ error: "No autenticado" });
  }

  let decoded: unknown;
  try {
    // `algorithms` explícito: sin él, el token decide con qué algoritmo se
    // valida y "alg: none" pasa.
    decoded = jwt.verify(token, getSecret(), { algorithms: [ALGORITHM] });
  } catch {
    return reply.status(401).send({ error: "No autenticado" });
  }

  const user = parsePayload(decoded);
  if (!user) {
    return reply.status(401).send({ error: "No autenticado" });
  }

  request.user = user;
}
