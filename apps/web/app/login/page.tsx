import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

// Entrar a Vigía. No hay registro: los usuarios los crea a mano un
// administrador con el script create-user del workspace `database`.
//
// Esta pantalla NO protege nada por sí sola. Ninguna ruta de la app está
// cerrada y el CRUD del API sigue sin exigir token: la sesión existe para que
// `validatedById` sea una identidad verificable al confirmar una propuesta de
// la IA, que hoy es la única llamada autenticada. Cerrar el resto es una
// decisión aparte.
//
// Conserva la barra lateral del layout raíz. Esconderla obligaría a mover
// todas las rutas a un route group y no es lo que hace falta hoy.

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-sm px-8 py-24">
      <h1 className="text-lg font-medium text-text-primary">Entrar</h1>
      <p className="mt-1 text-sm text-text-secondary">
        Con la cuenta que te dio el administrador de la oficina.
      </p>

      {/* useSearchParams obliga a un límite de Suspense: sin él, `next build`
          falla al intentar prerenderizar esta página. */}
      <Suspense fallback={<div className="mt-6 h-56" />}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
