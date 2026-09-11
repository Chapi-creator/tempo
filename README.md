# Tempo 🗓️

Un tablero Kanban **sin cuenta y sin backend** (todo queda guardado en tu navegador). La **web necesita internet para cargarse**, pero la **app de escritorio funciona 100% offline** — sus archivos viven en tu disco, no en un servidor. Y sí, es gratis de verdad: no mantengo ningún servidor porque no existe.

Construido con **Opencode** (a pulso de conversación), con **$0 de presupuesto** y **cero dependencias en el frontend**: solo HTML + CSS + JS vanilla, y práctica obsesiva de no tocar nada imaginario. El resultado: una página que se abre, funciona y no se cae.

## 🙋 ¿Por qué existe?

Porque la mayoría de apps de productividad te piden cuenta, token, plan premium y hasta la foto de tu primera mascota. Tempo es todo lo contrario:

- **No pide cuenta.** Tus datos no salen de tu máquina.
- **Sin backend ni servidor propio.** No hay nada que hackear, caer o cobrar. La web es un archivo estático hosteado en el CDN de Vercel; la app de escritorio carga sus archivos desde el disco.
- **Offline de verdad solo en la app de escritorio.** La web necesita internet para cargarse; lo que no requiere internet es donde se guardan tus datos (localStorage / disco local). La sincronización entre dispositivos la haces tú exportando/importando un JSON.

## 🚀 Probar sin instalar nada

▶️ **https://tempo-board.vercel.app**

Abre en cualquier navegador, y listo. Si es tu primera visita, te siembro un tablero de ejemplo para que no arranques en blanco.

## ✨ Funciones

- **Tableros múltiples** con su propio tablero independiente (crear, renombrar, borrar).
- **Tarjetas** con título, descripción, etiqueta de color y fecha límite.
- **Búsqueda y filtros** por texto y por etiqueta.
- **Arrastrar y soltar** tarjetas entre columnas.
- **Reordenar columnas** con las flechas del encabezado.
- **Deshacer / Rehacer** (Ctrl+Z / Ctrl+Shift+Z o Ctrl+Y).
- **Atajos**: `N` nueva tarjeta, `T` tema claro/oscuro, `Ctrl+D` duplicar la tarjeta abierta.
- **Vencidas en rojo**: las tarjetas con fecha pasada fuera de la columna de "hecho" se marcan.
- **Estadísticas**: tareas completadas en los últimos 14 días (gráfico de barras).
- **Exportar / Importar** en JSON (tus datos, tu archivo).
- **Imprimir / guardar PDF** del tablero.
- **App de escritorio** (Windows, Electron): con auto-actualización y **backup local automático** en `%APPDATA%\Tempo\backups` cada vez que abres la app.

## 🖥️ App de escritorio (la versión offline)

La app de Windows se empaqueta en cada release (descargable desde las [Releases](https://github.com/Chapi-creator/tempo/releases)). Es la **única forma de usar Tempo sin conexión a internet**: carga todo desde tu disco, no desde la web. Incluye:

- **Auto-update** silencioso al cerrar (parchea futuros CVEs de Electron).
- **Backup local automático** al arrancar (últimos 10, en `%APPDATA%/Tempo/backups`).
- **Asociación de archivos** `.tempo.json`: doble clic en un tablero exportado lo abre directamente.
- Fuses de Electron aplicados (protegido contra exploits de runtime).

## 🛡️ Seguridad

- **Sin servidor = sin SQL inyectable y sin DDoS contra tu código**: el "servidor" es el CDN de Vercel.
- **XSS mitigado**: todo se renderiza con `textContent`, y un test estático en CI **se niega a compilar** si alguien introduce `innerHTML`/`eval` en el front.
- **Schema estricto** al importar JSON: límites de tamaño, columnas, tarjetas y saneado de etiquetas/dates.
- Headers durillos (CSP, HSTS, X-Content-Type-Options, etc.).

## 🧪 Tests

`node test.js` corre en el CI en cada commit y PR:

```
funcional + estadísticas + seguridad (XSS, pollution, schema, límites, ids) + boardStore
```

## 🛠️ Correr localmente

La web no necesita build ni dependencias, se abre directo:

```bash
# web: ábrela con cualquier servidor estático
npx serve .

# app de escritorio (requiere Node y npm):
cd desktop
npm i
npm start        # copia la web y lanza Electron
npm run dist     # genera el instalador de Windows
```

## 🧠 ¿Cómo se hizo?

Todo el desarrollo se hizo **conversando con Opencode** en la terminal, iteración por iteración, con la regla de "no gastar un peso ni una dependencia". El repo, el CI (GitHub Actions), el hosting (Vercel free) y las releases de Electron son todos gratuitos. Si te gusta la idea de construir software a coste cero, este es un ejemplo viviente.