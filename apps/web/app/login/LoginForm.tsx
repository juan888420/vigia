"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { login } from "@/lib/api";
import { storeToken } from "@/lib/auth-client";

// Único formulario de la app que no guarda nada del expediente. No comparte
// componente con los demás porque no comparte nada con ellos: dos campos, una
// llamada y una redirección.
//
// El mensaje de error se muestra TAL COMO lo devuelve el API, sin
// interpretarlo. El API responde "Credenciales inválidas" tanto si el email no
// existe como si la contraseña está mal, y a propósito: distinguirlos aquí
// convertiría el login en un verificador de qué correos están registrados.

const inputClass =
  "w-full rounded-md border border-border bg-base px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-border-strong focus:outline-none";

/** A dónde volver tras entrar. Solo se aceptan rutas internas: un `next` con
 *  host propio ("//evil.com") convertiría esta página en un redirector abierto
 *  hacia una copia del login que se quedara con la contraseña. */
function safeNext(value: string | null): string {
  if (value === null) return "/";
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const { token } = await login(email, password);
      storeToken(token);
      const next = safeNext(searchParams.get("next"));
      router.push(next);
      // El destino puede venir de una sesión caducada a mitad de pantalla: sin
      // refresh, Next serviría la versión cacheada de esa ruta.
      router.refresh();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "No se pudo iniciar sesión");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      <label className="block">
        <span className="text-xs text-text-secondary">Correo</span>
        <input
          required
          autoFocus
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="nombre@angelopolis.gov.co"
          className={`mt-1.5 ${inputClass}`}
        />
      </label>

      <label className="block">
        <span className="text-xs text-text-secondary">Contraseña</span>
        <input
          required
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={`mt-1.5 ${inputClass}`}
        />
      </label>

      {error && (
        <p className="rounded-lg border border-status-atrasado-dim bg-status-atrasado-dim/40 px-3 py-2.5 text-sm text-status-atrasado">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-base transition-colors hover:bg-accent/80 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? "Entrando..." : "Entrar"}
      </button>
    </form>
  );
}
