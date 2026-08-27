# Vigía — plataforma de control y seguimiento contractual

> Nombre provisional. Aparece solo en `package.json` y en el título de la app.

Plataforma que centraliza los expedientes contractuales de una oficina pública y permite
consultar en segundos el estado **documental**, **financiero** y **temporal** de cada
contrato: qué documentos existen y cuáles faltan, cuánto se ha pagado, cuánto queda
disponible, cuándo vence realmente y qué modificaciones ha tenido — sin buscar manualmente
entre carpetas y archivos.

El MVP se enfoca en **contratación directa (CD)**. Las demás modalidades se agregan después
sin reescribir el modelo (ver *Extensibilidad*).

---

## El problema que resuelve

Hoy, para saber si un contrato está al día, hay que abrir decenas de PDFs repartidos en
carpetas y subcarpetas, y cruzarlos mentalmente. Un expediente real analizado tenía 60+
documentos; otro, 79. El costo no está en *cargar* la información una vez, sino en
*releerla* cada vez que alguien pregunta — por ejemplo, ante un requerimiento de un
organismo de control.

### Qué significa "al día"

No es solo que el plazo siga vigente. Es que exista **coherencia entre lo que ocurrió
jurídicamente y la documentación que lo soporta**. El caso que mejor lo ilustra: un
contrato al que se le amplió el plazo, pero cuyas pólizas no fueron actualizadas — sigue
vigente, y sin embargo está atrasado documentalmente.

Por eso el estado se evalúa en dos dimensiones:

| Dimensión | Qué verifica |
|---|---|
| **Documental** | Qué documentos deberían existir, cuáles existen, cuáles faltan, y si cada evento y cada pago tienen sus soportes |
| **Financiero / temporal** | Valor vigente, respaldo presupuestal (CDP/RP), pagos acumulados, saldo, fecha de terminación vigente tras prórrogas y suspensiones |

---

## Principio automation-first

> **Si una automatización determinística puede resolver el problema de forma fiable,
> NO usamos IA.**

Esto no es una limitación técnica: es una decisión de diseño. Los cálculos financieros y de
plazos de un contrato público deben ser exactos y auditables, no la interpretación de un
modelo. Además permite explicarle a la entidad exactamente qué hace la IA y qué no.

### El único punto de IA previsto en el MVP

```
Documentos no estructurados (PDFs con nombres que no ayudan)
        ↓
IA  ──  clasifica y propone metadatos
        ↓
Usuario valida        ←── el dato NO existe hasta este paso
        ↓
Datos estructurados
        ↓
Motor determinístico  ──  reglas, cálculos, alertas, estado
```

La IA se usa donde no hay alternativa razonable: interpretar documentos redactados distinto
en cada contrato, con nombres de archivo inconsistentes. En dos expedientes reales del mismo
tipo, el mismo documento aparecía como `PAGO_1/` y `PAGO 1/`, como archivo separado y como
PDF combinado, e incluso con errores de tipeo (`COMROBANTE DE EGRESO.pdf`). Ninguna regla
determinística resuelve eso con fiabilidad.

**Flujo obligatorio:** `IA propone → usuario valida → sistema guarda`.
Nunca `IA decide → sistema guarda`.

Esto está impuesto por el modelo de datos, no por convención: un `ContractDocument` con
`source = AI_SUGGESTED` y `validatedAt = null` está en la cola de revisión y **no cuenta como
presente** para el checklist.

### Lo que la IA NO decide nunca

Saldo · pagos acumulados · fechas calculadas · estado contractual · alertas · cumplimiento
del checklist · cualquier cálculo financiero o temporal.

Todo eso pertenece al motor de reglas, en código.

### Ejemplos de lo que se resuelve SIN IA

- **Saldo** = valor vigente − suma de pagos.
- **Fecha de terminación vigente** = inicio + plazo + prórrogas − tiempo suspendido.
- **Saltos de secuencia**: Otrosí 1, 2, 9 → faltan potencialmente 3–8. Es ordenar y buscar huecos.
- **Póliza no actualizada tras una modificación**: comparar dos fechas ya extraídas.
- **Documento faltante**: comparar los requisitos de la modalidad contra los documentos validados.

---

## Modelo de dominio

```
Office
 └─ Contract ──────────────── ContractType ── DocumentRequirement ── DocumentType
     │                                              │
     │                                     ContractRequirementOverride
     ├─ BudgetRecord            (CDP / RP)
     ├─ ContractEvent           (otrosí, adición, prórroga, suspensión, reinicio,
     │                           terminación, liquidación)
     ├─ Payment                 (pago N con sus soportes)
     ├─ Guarantee               (póliza; puede amparar un evento concreto)
     ├─ ContractDocument        (archivo; cuelga del contrato y, si aplica,
     │                           de un pago / evento / garantía)
     ├─ Alert                   (hallazgo determinístico del motor de reglas)
     └─ Contract[]              (contratos derivados)
```

### Decisiones principales

**1. Los valores vigentes se derivan, no se almacenan.**
`Contract` guarda solo condiciones iniciales (`initialValue`, `initialTermDays`,
`initialEndDate`). El valor y la fecha de terminación actuales los calcula el motor de
reglas sumando eventos. Almacenarlos como columnas escribibles permitiría que se
desincronizaran del historial que deben resumir.

**2. Un solo `ContractEvent` con discriminador, no seis tablas.**
Alternativa descartada: `Extension`, `Suspension`, `Resumption`, `Amendment`… como tablas
separadas. Razones para unificarlas: la detección de saltos de secuencia es una consulta
ordenada en vez de seis; un documento se relaciona con su evento por una FK simple en vez de
relaciones polimórficas. Costo aceptado: algunos campos quedan nulos según el tipo.

**3. `Payment` sí es entidad propia.**
Tiene semántica distinta a los demás eventos: se le evalúa un checklist propio de soportes.
De ahí sale *"Pago 2 incompleto — falta el informe de supervisión"*, que es exactamente lo
que el usuario necesita ver. `DocumentRequirement.appliesToEachPayment` marca qué requisitos
se repiten en cada pago.

**4. `Guarantee.coversEventId` — la relación clave.**
Una póliza puede apuntar al evento de modificación que ampara. Esto convierte la regla más
importante del dominio ("se prorrogó pero no se actualizó la garantía") en una verificación
determinística: todo evento que cambia valor o plazo debe tener una garantía que lo
referencie. Nulo = garantía inicial.

**5. Contratos derivados = `Contract` con `parentContractId`.**
No son una etapa del padre. En los expedientes reales, cada derivado tiene su propio ciclo
precontractual → contractual → postcontractual, sus pólizas y sus actas. Un contrato CD
puede tener varios simultáneos.

**6. `number` + `normalizedNumber`.**
Los datos reales traen `CD-011-2025`, `CD013-2026` y `CD-004A-2024`. Se conserva la forma
escrita y se indexa una forma canónica, única por oficina.

**7. `originalFileName` se conserva siempre.**
`standardizedName` (`CD-001-2025_Acta-Inicio.pdf`) es una **consecuencia** de la
clasificación, nunca su insumo: para renombrar hay que saber primero qué es el documento. El
nombre original permite que el funcionario reconozca su archivo y que una clasificación
errónea sea auditable.

**8. `contentHash` en los documentos.**
Los expedientes repiten el mismo PDF en varias carpetas. El hash distingue un duplicado real
de dos documentos distintos que casualmente se llaman igual.

**9. `Alert.ruleCode`.**
Hace la alerta auditable: permite responder *"¿por qué el sistema dice que está atrasado?"*
señalando la regla exacta, y regenerar alertas sin duplicar las existentes.

**10. `Office` desde el día 1, sin multi-tenancy compleja.**
Solo la FK raíz. Sin roles, permisos ni facturación. Agregar la columna ahora no cuesta
nada; agregarla con datos en producción obligaría a migrar y revisar cada query.

### Extensibilidad

Una modalidad nueva (licitación, mínima cuantía…) es un `ContractType` con sus
`DocumentRequirement` — **datos, no código**. `ContractRequirementOverride` cubre el caso
real de que dentro de una misma modalidad un contrato de obra exija documentos distintos a
uno de suministro.

---

## Estado del proyecto

| Componente | Estado |
|---|---|
| Monorepo (npm workspaces) | Listo |
| `schema.prisma` | **Diseñado y validado** — sin migraciones aún |
| Wireframe del dashboard (`apps/web`) | Listo, con datos mock en `lib/mock-data.ts` |
| `apps/api` (Fastify) | Esqueleto con rutas mock |
| Motor de reglas | No implementado |
| Clasificación con IA | No implementada |

### Fuera de alcance en esta etapa

Integración con SECOP · verificación contra expediente físico · notificaciones externas
(WhatsApp, Telegram) · agentes autónomos · OCR complejo · RAG / chat con documentos ·
automatización de las demás modalidades.

---

## Decisiones pendientes antes de generar migraciones

1. **El estado del contrato no es una columna.** Se calcula al leer. Es lo correcto para
   decenas de contratos; si el volumen crece, habrá que añadir una caché explícita
   (`cachedStatus` + `computedAt`) marcada como derivada, nunca autoritativa.
2. **Umbrales de las reglas.** ¿Cuántos días después del vencimiento pasa de "requiere
   atención" a "atrasado"? ¿Con cuántos días de anticipación se alerta una póliza por vencer?
   Son criterio del cliente, no técnicos.
3. **Qué documentos son críticos.** ¿Un informe de supervisión faltante bloquea igual que un
   acta de recibo faltante? Define la severidad de la alerta.
4. **Seed inicial de `DocumentType` / `DocumentRequirement` para CD.** Debe derivarse de los
   expedientes reales analizados y validarse con el cliente antes de sembrarlo.
5. **Documentos del contratista y clausulado.** Se incluirán como requisitos **opcionales**
   hasta confirmar si entran en el seguimiento de esta oficina o los controla otra área.
6. **Storage de archivos.** `storagePath` asume un proveedor externo. Los expedientes
   contienen datos personales y financieros de contratistas: el bucket debe ser privado, con
   control de acceso.

---

## Cómo correr esto

```bash
npm install
npm run dev:web   # http://localhost:3000
npm run dev:api   # http://localhost:3333
```

Para el schema (requiere `DATABASE_URL`):

```bash
cd packages/database
npx prisma validate
npx prisma migrate dev --name init   # solo cuando las decisiones pendientes estén cerradas
```
