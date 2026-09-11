import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

// ─────────────────────────────────────────────────────────────────────────────
// Alta manual de usuarios. Es el ÚNICO camino para crear uno: no hay registro
// público, por diseño. Pensado para que un administrador dé de alta a los
// funcionarios de la oficina uno por uno.
//
//   npm run create-user --workspace=database -- \
//     --email juan@oficina.gov.co --name "Juan Pérez" [--office <officeId>]
//
// La contraseña NO se pasa por argumento: un argumento queda en el historial
// del shell y en la lista de procesos de la máquina. Sale de la variable de
// entorno USER_PASSWORD y, si no está y hay terminal, se pregunta por consola:
//
//   USER_PASSWORD='...' npm run create-user --workspace=database -- --email ...
//
// `--office` se puede omitir cuando solo hay una oficina, que es el caso del
// MVP.
// ─────────────────────────────────────────────────────────────────────────────

/** Mismo coste que usa el API al verificar (apps/api/src/lib/auth.ts). Si uno
 *  cambia, el otro sigue funcionando —bcrypt guarda el coste dentro del hash—
 *  pero conviene mantenerlos iguales. */
const BCRYPT_ROUNDS = 12;

/** No es una política de contraseñas: es el suelo por debajo del cual no vale
 *  la pena ni guardar el hash. */
const MIN_PASSWORD_LENGTH = 10;

const prisma = new PrismaClient();

function readFlag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`La opción --${name} necesita un valor.`);
  }
  return value;
}

/** Pregunta solo si hay una terminal de verdad. Con la entrada redirigida,
 *  readline se cierra al acabar el flujo y la pregunta nunca se respondería:
 *  mejor un error que explique qué falta. */
async function ask(question: string, missing: string): Promise<string> {
  if (!stdin.isTTY) {
    throw new Error(missing);
  }
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}

async function main() {
  const offices = await prisma.office.findMany({ select: { id: true, name: true } });
  if (offices.length === 0) {
    throw new Error("No hay ninguna oficina en la base de datos. Siembra una antes.");
  }

  const email = (
    readFlag("email") ?? (await ask("Email: ", "Falta --email."))
  )
    .trim()
    .toLowerCase();
  if (!email.includes("@")) {
    throw new Error("El email no parece válido.");
  }

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    // No se actualiza la contraseña de un usuario existente desde aquí: sería
    // un reseteo de credenciales disfrazado de alta.
    throw new Error(`Ya existe un usuario con el email ${email}.`);
  }

  const name = (readFlag("name") ?? (await ask("Nombre completo: ", "Falta --name."))).trim();
  if (name.length === 0) {
    throw new Error("El nombre no puede estar vacío.");
  }

  const officeId =
    readFlag("office") ??
    (offices.length === 1
      ? offices[0]!.id
      : await ask(
          `officeId (${offices.map((o) => `${o.id} ${o.name}`).join(" | ")}): `,
          `Falta --office. Oficinas: ${offices.map((o) => `${o.id} (${o.name})`).join(", ")}`,
        ));
  if (!offices.some((office) => office.id === officeId)) {
    throw new Error(`No existe ninguna oficina con id ${officeId}.`);
  }

  const password =
    process.env.USER_PASSWORD ??
    (await ask("Contraseña: ", "Falta la contraseña: define USER_PASSWORD en el entorno."));
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  }

  const user = await prisma.user.create({
    data: { email, name, officeId, passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS) },
    select: { id: true, email: true, name: true, officeId: true },
  });

  // Se imprime el id, nunca el hash ni la contraseña.
  console.log(`\nUsuario creado:\n  id       ${user.id}\n  email    ${user.email}`);
  console.log(`  nombre   ${user.name}\n  officeId ${user.officeId}\n`);
}

main()
  .catch((error) => {
    console.error(`\nError: ${error instanceof Error ? error.message : error}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
