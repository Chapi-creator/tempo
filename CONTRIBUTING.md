# Contribuir a Tempo 🙌

¡Gracias por querer aportar! Tempo es un proyecto hobby que mantengo en ratos libres, así que las reglas son pocas pero firmes.

## Antes de escribir código

**Abrí un issue primero** contando qué querés hacer (idea, bug o mejora). Coordinamos ahí antes de que escribas código: evita PRs gigantes de cosas que no van con el proyecto.

## Reglas del proyecto

1. **Sin dependencias nuevas.** El frontend es HTML + CSS + JS vanilla, y así se queda ($0 de presupuesto).
2. **Sin `innerHTML`, `eval` ni `document.write`.** Todo se renderiza con `textContent` (el CI rechaza el PR si aparece un sink — ver Pack5 en `test.js`).
3. **`node test.js` tiene que pasar** antes de mandar el PR.
4. **PRs chicos: una cosa por PR.** Más fácil de revisar, más rápido de mergear.
5. **Sin backend, sin cuentas, sin nube.** La identidad del proyecto es: tus datos nunca salen de tu máquina. Propuestas que requieran servidor/login van en contra del proyecto (se agradecen igual, pero no se mergean).

## Cómo mandar el PR

1. Fork → rama con nombre descriptivo (`fix/...`, `feat/...`).
2. Describí qué cambia y cómo lo probaste.
3. El CI corre tests automáticamente; si falla, arreglalo en la misma rama.

## Tiempos

Reviso cuando puedo — puede tardar unos días. La decisión final de qué entra queda en el mantenedor. ¡Gracias de nuevo!
