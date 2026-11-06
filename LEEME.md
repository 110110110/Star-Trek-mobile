# Star Trek · Consola de mando (juego independiente)

Versión de pantalla de Star Trek (reglas de Super Star Trek) como app web instalable (PWA) para celular y tablet de 7".
Sin dependencias ni compilación: son archivos estáticos.

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html` | Estructura de la pantalla |
| `style.css` | Estilos y diseños (celular vertical, tablet 7", celular apaisado) |
| `engine.js` | Motor del juego (reglas de Super Star Trek), sin interfaz |
| `ui.js` | Interfaz táctil, pestañas, sonido, guardado |
| `manifest.webmanifest` | Datos de instalación (nombre, íconos, colores) |
| `sw.js` | Service worker: deja el juego funcionando sin conexión |
| `icons/` | Íconos 192, 512, maskable y de iOS |

## Cómo publicarlo (recomendado)

La PWA necesita servirse por **HTTPS** para poder instalarse y funcionar sin conexión. Cualquiera de estos sirve y es gratis:

1. **Netlify Drop**: entrar a app.netlify.com/drop y arrastrar la carpeta. Devuelve un link HTTPS al instante.
2. **GitHub Pages**: subir la carpeta a un repositorio y activar Pages en Settings → Pages.
3. **Cloudflare Pages**: crear un proyecto y subir la carpeta directamente.

Los archivos van en la raíz del sitio o en una subcarpeta; las rutas son relativas y funcionan en ambos casos.

## Instalar en el dispositivo

- **Android (Chrome):** abrir el link → menú ⋮ → *Instalar app* (o el botón *Instalar como app* del menú del juego).
- **iPhone / iPad (Safari):** Compartir → *Agregar a inicio*.

Queda con su ícono, a pantalla completa, y funciona sin conexión.

## Probarlo en la red local (sin publicar)

Desde la carpeta: `python3 -m http.server 8000` y abrir `http://IP-DE-LA-PC:8000` en el celular.
El juego anda igual, pero por HTTP plano el navegador no permite instalar ni usar sin conexión (solo `localhost` y HTTPS lo permiten).

## Actualizar una versión ya instalada

Después de cambiar cualquier archivo, subir el número de `VERSION` en `sw.js` (por ejemplo `startrek-v2`). Los dispositivos se actualizan solos la próxima vez que abran la app con conexión.

## APK / Play Store con PWABuilder

1. Publicar primero la carpeta en HTTPS (ver arriba): PWABuilder analiza una URL pública, no archivos sueltos.
2. Entrar a pwabuilder.com, pegar la URL del juego y tocar *Start*. El manifest ya trae íconos (incluido maskable), capturas, atajo y categoría.
3. *Package for stores* → *Android*. Para probar en el celular alcanza con el **APK** (hay que permitir "instalar apps de orígenes desconocidos"). Para Play Store se necesita el **AAB** y una cuenta de desarrollador.
4. En las opciones, el *Package ID* es el identificador definitivo de la app (por ejemplo `ar.com.tudominio.startrek`); conviene elegirlo bien antes de publicar.
5. PWABuilder genera y firma con una clave nueva: **guardar el archivo de firma y su contraseña** que entrega, porque sin ella no se pueden publicar actualizaciones.

Alternativa sin Android: Capacitor, con la misma carpeta.

## Notas de uso

- La partida se guarda sola; al volver aparece *Continuar misión*.
- Los escudos arrancan en 0 (regla original): al entrar en un cuadrante con Klingon se abre solo el panel de escudos.
- Menú (☰): sonido, vibración, nivel del efecto de pantalla antigua (suave / completa / apagada), pantalla completa, nueva misión.
