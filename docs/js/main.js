/* Punto de entrada de los módulos nuevos. El bote compartido (app.js + logica.js)
 * se carga antes como script clásico y expone window.BirrasApp como puente. */
import { iniciar, resumen } from './diario.js';
window.BirrasDiario = { resumen };

function arrancar() {
  if (!window.BirrasApp) return setTimeout(arrancar, 30);
  iniciar().catch((e) => { console.error(e); window.BirrasApp.toast('El diario no ha podido arrancar en este navegador.'); });
}
arrancar();
