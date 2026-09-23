# Meta
En cada solicitud de extracción (PR), determine si el conjunto de pruebas de extremo a extremo existente cubre el comportamiento que modifica la PR; de no ser así, genere una nueva prueba de extremo a extremo utilizando instrucciones, habilidades y agentes residentes en el repositorio, impulsada principalmente por la revisión de código de Copilot, con un respaldo de CI determinista.

## Phase 1 - Hacer que la cobertura sea verificable por máquina.
La decisión de diseño fundamental: la cobertura debe expresarse como datos, no inferirse a partir de la prosa en cada ejecución.

- Adopte un artefacto de mapeo explícito, por ejemplo, frontend/e2e/coverage-map.yml, que vincule las rutas de origen y las rutas de API con las especificaciones E2E que las evalúan (por ejemplo, backend/main.go:/v1/chat → e2e/chat.spec.ts; frontend/src/app/page.tsx → e2e/tenant.spec.ts).

- Exija que cada especificación incluya una etiqueta/anotación estable (ID de característica) que coincida con una entrada en el mapa, de modo que el mapeo sea verificable en lugar de meramente aspiracional.

- Defina un conjunto de reglas explícitas para los "cambios relevantes para E2E": los cambios en backend/, frontend/src/app/, kong/kong.yml o compose.yml son relevantes; la documentación, los Dockerfiles y los lockfiles no lo son.

## Phase 2 - Proporcione a Copilot todo lo que necesita para escribir una prueba correcta sin tener que adivinar.

- .github/copilot-instructions.md — Arquitectura del repositorio, límites de la pila, política de cobertura E2E y la expectativa de que las solicitudes de extracción que modifican el comportamiento actualicen el mapa de cobertura.
- frontend/e2e/AGENTS.md — Convenciones específicas de E2E: estrategia de selección, fixtures, simulación de proveedores, nomenclatura, etiquetado y cómo ejecutar localmente.
- .github/skills/write-e2e-test/ — Una habilidad que describe paso a paso cómo crear una nueva especificación: localizar la superficie afectada, elegir entre el nivel de interfaz de usuario y el de API, reutilizar fixtures, configurar la entrada del mapa de cobertura y validar la ejecución.
- .github/skills/assess-e2e-coverage/ — Una habilidad que define cómo determinar si una diferencia ya está cubierta: leer la diferencia, clasificar el comportamiento modificado, consultar el mapa de cobertura e informar si está cubierta, parcialmente cubierta o no, con su correspondiente justificación.
- .github/agents/e2e-test-author.md: un agente personalizado que compone las dos habilidades y que puede ser invocado por nombre (@e2e-test-author) desde un comentario de PR para producir realmente la especificación faltante.

## Phase 3 - Integración de la revisión de código de Copilot

- Habilita la revisión de código de Copilot en el repositorio, con revisión automática para las solicitudes de extracción dirigidas a la rama predeterminada.
- Añade instrucciones a `.github/copilot-review-instructions` (a través de las instrucciones de revisión personalizadas del repositorio) para que el revisor indique, para cada diferencia relevante de extremo a extremo, qué especificación existente cubre el cambio o señale explícitamente la brecha y recomiende el nombre y el escenario de la nueva especificación.
- Mantén el resultado de la revisión como informativo: los comentarios de revisión de Copilot identifican la brecha; no crean la prueba en su lugar.

## Phase 4 - Respaldo de CI determinista
Dado que la revisión del programa LLM no es determinista, combínela con una verificación que no se pueda omitir.

- Añade .github/workflows/e2e.yml: compila la pila de Compose, ejecuta el conjunto de Playwright en las solicitudes de extracción (PR) y sube los rastros/informes como artefactos.
- Añade una tarea de control de cobertura: calcula las rutas modificadas de la PR, las resuelve con coverage-map.yml y genera un mensaje claro cuando una ruta relevante para E2E no tiene una especificación mapeada, o cuando una especificación mapeada no se ejecuta.
- En caso de fallo en el control de cobertura, la tarea publica un comentario en la PR que indica la superficie no cubierta y le indica al autor que invoque a @e2e-test-author (o ejecute la skill localmente) para generar la especificación.

## Phase 5 - Cerrar el inodoro

- El autor (o un mantenedor) invoca al agente desde la solicitud de extracción (PR); este genera la especificación y la entrada del mapa de cobertura, confirma los cambios en la rama de la PR y vuelve a ejecutar la integración continua (CI).
- Proporcione una solución alternativa documentada: una etiqueta explícita `e2e-coverage: not-required` con una justificación requerida, para que las solicitudes de extracción de bajo riesgo no se bloqueen.
- Agregue `.github/pull_request_template.md` con una casilla de verificación de cobertura E2E para que la expectativa sea visible antes de que comience la revisión.
