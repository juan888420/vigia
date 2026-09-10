"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  countDigits,
  formatPlainToEsCo,
  formatWhileTyping,
  isIncompleteEntry,
  offsetForDigits,
  parseMoneyEsCo,
} from "@/lib/money";

// Campo de dinero. Se escribe en es-CO ("29.842.662,44") y al padre SIEMPRE le
// llega la forma plana que espera el API ("29842662.44").
//
// Cómo se reparte el estado: el texto visible vive aquí, porque mientras se
// teclea hay estados que no son un número todavía ("29.842.6", "1234,"); el
// valor plano vive en el formulario, que es quien arma el payload. Así lo que
// se ve y lo que se envía no pueden divergir sin que este componente lo sepa.
//
// Si lo tecleado no se puede interpretar con certeza, al padre le llega cadena
// vacía y NO el texto crudo. Es deliberado: aunque alguien se saltara el
// bloqueo de envío, lo que saldría sería un campo vacío —que el API rechaza si
// es obligatorio— y nunca una cifra inventada, que es lo que causó el
// incidente. El bloqueo real lo hace setCustomValidity: con un mensaje puesto,
// el navegador no deja enviar el formulario y handleSubmit ni siquiera corre.

interface MoneyInputProps {
  /** Valor plano, tal como viaja al API ("29842662.44"). */
  value: string;
  /** Recibe el valor plano, o "" si lo tecleado no es interpretable. */
  onChange: (plain: string) => void;
  /** `ContractEvent.valueDelta` es un delta y puede corregir a la baja. */
  allowNegative?: boolean;
  required?: boolean;
  placeholder?: string;
  className?: string;
  id?: string;
}

export function MoneyInput({
  value,
  onChange,
  allowNegative = false,
  required = false,
  placeholder,
  className = "",
  id,
}: MoneyInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(() => formatPlainToEsCo(value));
  const [error, setError] = useState<string | null>(null);
  /** Último plano emitido por este campo. Sirve para reconocer el `value` que
   *  vuelve del padre como eco del propio tecleo y no reescribir el texto. */
  const emitted = useRef<string | null>(null);
  /** Dónde dejar el cursor tras el próximo repintado. */
  const caretTarget = useRef<number | null>(null);

  // Reponer el cursor DESPUÉS del commit y de forma síncrona. Agrupar cambia la
  // longitud del texto, así que sin esto el cursor se queda donde estaba y las
  // cifras siguientes se insertan en mitad de lo ya escrito.
  useLayoutEffect(() => {
    const node = inputRef.current;
    if (node === null || caretTarget.current === null) return;
    if (document.activeElement === node) {
      node.setSelectionRange(caretTarget.current, caretTarget.current);
    }
    caretTarget.current = null;
  });

  // El valor puede cambiar desde fuera: la precarga del formulario de edición
  // llega después del primer render.
  //
  // Las dos guardas son necesarias. Sin la del eco, escribir la coma de
  // "29.842.662,44" vaciaba el campo: mientras faltan los decimales el plano
  // emitido es "", el padre devolvía "" y este efecto lo tomaba por un valor
  // externo, borrando lo escrito y dejando solo lo que se tecleara después
  // ("44"). Sin la del foco, cualquier re-render del formulario reformatearía
  // el campo bajo el cursor.
  useEffect(() => {
    if (emitted.current === value) return;
    if (inputRef.current !== null && document.activeElement === inputRef.current) return;
    setText(formatPlainToEsCo(value));
    setError(null);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  // El mensaje nativo es lo que impide el envío, y NO depende de si el error
  // se está mostrando: una entrada a medio escribir no molesta con un aviso
  // rojo, pero tampoco se puede enviar. La validez se recalcula desde el texto,
  // que es la única fuente de lo que el usuario tiene delante.
  useEffect(() => {
    const parsed = parseMoneyEsCo(text, { allowNegative });
    const message = parsed.ok
      ? ""
      : error ?? "Escribe la cifra completa, por ejemplo 29.842.662,44.";
    inputRef.current?.setCustomValidity(message);
  }, [text, error, allowNegative]);

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const rawText = input.value;
    const caret = input.selectionStart ?? rawText.length;
    const digitsBeforeCaret = countDigits(rawText, caret);

    // Se valida SIEMPRE el texto crudo, nunca el reagrupado. Reagrupar primero
    // "arreglaba" las entradas ambiguas en vez de rechazarlas: "1234.5" perdía
    // el punto y se guardaba como 12.345, diez veces el valor tecleado — la
    // misma clase de error que el incidente que originó este componente.
    const parsed = parseMoneyEsCo(rawText, { allowNegative });
    const incomplete = !parsed.ok && isIncompleteEntry(rawText, { allowNegative });

    // Solo se reagrupa lo que ya es interpretable, o lo que está a medio
    // escribir sin puntos puestos a mano. Con puntos de por medio se respeta
    // lo tecleado: reordenarlos mientras se escribe mueve las cifras bajo los
    // dedos del usuario.
    const formatted =
      parsed.ok || (incomplete && !rawText.includes("."))
        ? formatWhileTyping(rawText, { allowNegative })
        : rawText;
    setText(formatted);

    setError(parsed.ok || incomplete ? null : parsed.error);
    onChange(parsed.ok ? parsed.plain : "");
    emitted.current = parsed.ok ? parsed.plain : "";

    // Escribiendo al final —el caso normal— el cursor va al final y punto. La
    // cuenta por cifras solo hace falta al editar en medio: ahí la posición
    // equivalente se desplaza cuando se inserta o se quita un punto de miles,
    // pero el número de cifras a la izquierda del cursor no cambia.
    //
    // Distinguir los dos casos es necesario: contando cifras, un separador
    // recién tecleado deja el cursor DELANTE de él ("199.|" en vez de "199.|"),
    // y la cifra siguiente lo empuja al final, escribiendo "1999." en vez de
    // "199.9".
    caretTarget.current =
      caret >= rawText.length ? formatted.length : offsetForDigits(formatted, digitsBeforeCaret);
  }

  /** Al salir del campo se reescribe desde el valor plano ya interpretado:
   *  así lo que queda a la vista es exactamente lo que se va a enviar. */
  function handleBlur() {
    const parsed = parseMoneyEsCo(text, { allowNegative });
    if (parsed.ok) {
      setText(formatPlainToEsCo(parsed.plain));
      setError(null);
      return;
    }
    // Al salir del campo ya no hay nada "a medio escribir": lo que quedó mal
    // se señala, aunque durante el tecleo se hubiera tolerado en silencio.
    if (text.trim() !== "") setError(parsed.error);
  }

  return (
    <div>
      <input
        ref={inputRef}
        id={id}
        inputMode="decimal"
        autoComplete="off"
        required={required}
        value={text}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        aria-invalid={error !== null}
        className={`${className} ${error ? "border-status-atrasado" : ""}`}
      />
      {error && <p className="mt-1 text-xs text-status-atrasado">{error}</p>}
    </div>
  );
}
