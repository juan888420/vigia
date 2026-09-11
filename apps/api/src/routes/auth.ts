import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import { hashPassword, isAuthConfigured, signToken, verifyPassword } from "../lib/auth";

// ─────────────────────────────────────────────────────────────────────────────
// Login. La única ruta pública de autenticación que existe: no hay registro,
// no hay recuperación de contraseña y no hay cambio de contraseña. Los usuarios
// los crea a mano un administrador con el script create-user.
// ─────────────────────────────────────────────────────────────────────────────

/** Hash bcrypt de descarte, con el mismo coste que los reales. Se compara
 *  contra él cuando el email no existe para que la respuesta tarde lo mismo
 *  que con un email real y contraseña mala. Sin esto, un atacante distingue
 *  emails registrados de los que no por la diferencia de tiempo (~250 ms), y
 *  el mensaje de error genérico de abajo no serviría de nada. */
const DUMMY_HASH_PROMISE = hashPassword("contraseña-que-no-pertenece-a-nadie");

const loginSchema = {
  body: {
    type: "object",
    properties: {
      email: { type: "string", minLength: 1 },
      password: { type: "string", minLength: 1 },
    },
    required: ["email", "password"],
    additionalProperties: false,
  },
} as const;

interface LoginBody {
  email: string;
  password: string;
}

export async function authRoutes(app: FastifyInstance) {
  app.post<{ Body: LoginBody }>("/auth/login", { schema: loginSchema }, async (request, reply) => {
    if (!isAuthConfigured()) {
      return reply.status(503).send({
        error: "La autenticación no está configurada: falta JWT_SECRET en el entorno del API",
      });
    }

    // El email se normaliza porque en la práctica la gente lo teclea con
    // mayúsculas y espacios; la contraseña NO se toca: recortarla cambiaría
    // silenciosamente una contraseña legítima que empiece o termine en espacio.
    const email = request.body.email.trim().toLowerCase();

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, officeId: true, passwordHash: true },
    });

    // Se compara SIEMPRE, exista el usuario o no: ver arriba.
    const hash = user?.passwordHash ?? (await DUMMY_HASH_PROMISE);
    const passwordMatches = await verifyPassword(request.body.password, hash);

    if (!user || !passwordMatches) {
      // Un único mensaje para los dos casos. Decir "ese email no existe"
      // convierte el login en un verificador de qué correos están registrados.
      return reply.status(401).send({ error: "Credenciales inválidas" });
    }

    return { token: signToken({ userId: user.id, officeId: user.officeId }) };
  });
}
