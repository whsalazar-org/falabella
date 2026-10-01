# Funcionalidades de GitHub Copilot: demostración del repositorio

Este recorrido usa la demostración del plano de control de Nova AI para
explicar cuatro conceptos de GitHub Copilot:

- **MCP (Model Context Protocol)**: una forma estándar para que Copilot
  descubra y llame herramientas, o recupere contexto de sistemas externos.
- **Extensiones personalizadas**: instrucciones, agentes e integraciones
  específicas del repositorio que adaptan Copilot al flujo de trabajo de un
  equipo.
- **Habilidades**: procedimientos reutilizables y enfocados que enseñan a
  Copilot a realizar una tarea determinada.
- **Cadenas de herramientas de agentes**: un flujo de trabajo compuesto en el
  que un agente usa instrucciones, habilidades, herramientas y comandos de
  validación para completar el trabajo de forma segura.

El repositorio ya contiene los componentes básicos para las extensiones
personalizadas, las habilidades y una cadena de herramientas. No incluye un
servidor MCP; la parte de MCP de la demostración usa un cliente/servidor MCP
configurado en el entorno de Copilot.

## El repositorio en un minuto

```text
Navegador
  -> frontend de Next.js (:3000)
  -> gateway de Kong (:8000/api)
  -> API de Go (:8080)
  -> proveedor compatible con OpenAI
                              \
                               -> trazas opcionales de Langfuse
```

Ubicaciones útiles:

| Tema | Ejemplo en el repositorio |
| --- | --- |
| Contexto del producto y la arquitectura | `README.md` |
| Guía persistente de Copilot | `.github/copilot-instructions.md` |
| Agentes personalizados | `.github/agents/` |
| Habilidades reutilizables | `.github/skills/` |
| Procedimiento operativo específico de E2E | `frontend/e2e/AGENTS.md` |
| Validación de todo el stack | `Makefile`, `compose.e2e.yml` |
| Límite del gateway | `kong/kong.yml` |

## Descripción general de las funcionalidades

### Temas de la sesión

Esta sesión especializada abordará:

- Introducción al Model Context Protocol (MCP).
- Arquitectura de MCP: clientes, servidores y herramientas.
- Conexión de agentes con API y sistemas empresariales.
- Creación y reutilización de habilidades.
- Herramientas y capacidades personalizadas para agentes.
- Composición de herramientas en cadenas de herramientas para agentes.
- Contexto compartido entre agentes.
- Seguridad, permisos y gobernanza de integraciones.
- Patrones para una plataforma empresarial extensible.

### MCP

MCP separa un modelo de los detalles de implementación de una herramienta. Un
servidor MCP anuncia herramientas y recursos tipados; Copilot decide cuándo
llamarlos, sujeto a los permisos del usuario y a la configuración del servidor.

Para esta demostración, configura un servidor MCP que pueda leer archivos del
repositorio o consultar GitHub Actions. Luego pregunta:

> «Usando el contexto del repositorio y el resultado más reciente del flujo de
> trabajo, explica cómo se valida el stack de E2E».

El resultado esperado es una explicación fundamentada que cite `Makefile`,
`compose.e2e.yml` y el resultado del flujo de trabajo, en lugar de inventar
comandos. MCP es un límite de integración, no un reemplazo de los archivos
fuente ni de la suite de pruebas del repositorio.

### Extensiones personalizadas

Las extensiones personalizadas hacen que Copilot se comporte como un compañero
con conocimiento del repositorio. Este repositorio lo demuestra mediante:

- `.github/copilot-instructions.md` para los límites de arquitectura, las
  convenciones, las reglas de seguridad y las comprobaciones obligatorias.
- `.github/agents/issue-diagnostician.md` y
  `.github/agents/e2e-test-author.md` como puntos de entrada para agentes
  especializados.
- Las herramientas MCP de GitHub que usa el entorno de desarrollo para
  incidencias, solicitudes de extracción, Actions y archivos del repositorio.

Una extensión debe acotar el contexto operativo y los permisos del agente. No
debe omitir el gateway, colocar credenciales del proveedor en el navegador ni
debilitar las pruebas.

### Habilidades

Una habilidad es un manual enfocado que un agente puede aplicar repetidamente.
La habilidad de cobertura de E2E en
`.github/skills/assess-e2e-coverage/SKILL.md` es un ejemplo concreto: define
entradas, clasifica los archivos modificados, relaciona el comportamiento con
el mapa de cobertura y produce un veredicto de cubierto/parcialmente
cubierto/no cubierto.

La habilidad complementaria `write-e2e-test` convierte una brecha identificada
en una especificación de Playwright y una entrada correspondiente en
`frontend/e2e/coverage-map.yml`. Las habilidades son más específicas que los
agentes: una habilidad describe un procedimiento; un agente coordina ese
procedimiento con herramientas y el contexto del repositorio.

### Cadenas de herramientas de agentes

Una cadena de herramientas de agentes es el recorrido completo desde la
solicitud hasta el cambio verificado. En este repositorio, la cadena de
herramientas de cobertura de E2E es:

1. Las instrucciones del repositorio establecen la arquitectura y los límites
   no negociables.
2. Un agente especializado selecciona la habilidad relevante.
3. La habilidad lee el diff y el mapa de cobertura.
4. El agente usa las herramientas del repositorio para inspeccionar o editar
   únicamente los archivos permitidos.
5. `make test-e2e` ejecuta el stack real de Compose con el `mock-provider`
   determinista.
6. `make e2e-coverage BASE=origin/main` comprueba que el comportamiento esté
   mapeado.

Esto es más que un prompt: cada etapa tiene una entrada, una salida y una
condición de fallo explícitas.

## Guion de la demostración en vivo

### 1. Empieza con el límite del producto

**Di:**

> «Este es un plano de control de IA con alcance por tenant. El navegador
> habla con Kong, Kong enruta a la API de Go y solo la API habla con el
> proveedor del modelo».

**Muestra:**

```sh
sed -n '30,54p' README.md
sed -n '15,26p' .github/copilot-instructions.md
cat kong/kong.yml
```

Señala que Kong elimina `/api` y que las credenciales del proveedor no son
entradas del navegador.

### 2. Demuestra las instrucciones personalizadas

**Pregunta a Copilot:**

> «¿Dónde está el límite de la API y qué no debe ocurrir al cambiar el
> frontend?»

**Resultado esperado:** Copilot cita `.github/copilot-instructions.md` y dice
que el frontend usa la URL del gateway, no la API de Go directamente.

### 3. Demuestra una herramienta MCP

Con un servidor MCP habilitado, **pregunta:**

> «Enumera las ejecuciones más recientes de los flujos de trabajo de CI de este
> repositorio e identifica qué comando ejecuta la suite del navegador».

**Resultado esperado:** Copilot usa la herramienta MCP de GitHub/Actions y
relaciona el flujo de trabajo con `make test-e2e` y
`.github/workflows/e2e.yml`. Si no hay un servidor MCP habilitado, explica que
la misma pregunta puede responderse a partir de los archivos registrados, pero
que la consulta de Actions en vivo no está disponible.

### 4. Invoca un agente y una habilidad personalizados

**Pregunta a Copilot:**

> «Evalúa si un cambio en `backend/main.go` que modifica la respuesta de error
> del chat necesita una nueva prueba de E2E».

Repasa lo siguiente:

1. `e2e-test-author` identifica la tarea de cobertura de E2E.
2. `assess-e2e-coverage` lee el diff, el mapa y las especificaciones
   correspondientes.
3. El resultado nombra el comportamiento exacto y proporciona un veredicto.
4. Si no está cubierto, `write-e2e-test` añade la especificación y la entrada
   del mapa.

Destaca que el agente no debe debilitar una prueba existente ni usar
interceptación de rutas del navegador cuando el proveedor simulado pueda
ejercitar la ruta real a través del gateway y la API.

### 5. Ejecuta la cadena de herramientas de validación

Para este cambio exclusivo de documentación, estos son comandos de referencia
para la demostración y no es necesario ejecutarlos. Para un cambio de la
aplicación, ejecuta:

```sh
make test
make build
make test-e2e
make e2e-coverage BASE=origin/main
```

Explica que `compose.e2e.yml` reemplaza el proveedor real por `mock-provider`,
por lo que la suite de E2E es determinista y no requiere una clave real del
proveedor.

### 6. Cierra con la distinción

**Di:**

> «MCP conecta Copilot con herramientas y contexto externos. Las extensiones
> personalizadas adaptan Copilot a este repositorio. Las habilidades codifican
> procedimientos repetibles. Una cadena de herramientas de agentes los combina
> todos con pruebas y políticas para que el resultado sea revisable».

## Lista de comprobación de la demostración

- [ ] Muestra la ruta frontend → gateway → API → proveedor.
- [ ] Muestra las instrucciones del repositorio y un agente personalizado.
- [ ] Muestra la habilidad de cobertura de E2E y el mapa de cobertura.
- [ ] Usa MCP para una consulta en vivo del repositorio o de Actions, si está
      configurado.
- [ ] Ejecuta o explica los comandos de validación.
- [ ] Indica qué comportamiento está cubierto y dónde se encuentra la
      evidencia.
