/* IndexedDB solo como buzón de salida: guarda los cambios que aún no han llegado
 * al servidor (sin cobertura) y se vacía en cuanto se envían. El diario de verdad
 * vive en el servidor de casa. */
const NOMBRE = 'birras-diario', VERSION = 2;
let conexion = null;

function abrir() {
  if (conexion) return conexion;
  conexion = new Promise((ok, ko) => {
    const r = indexedDB.open(NOMBRE, VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      for (const s of ['cervezas', 'porProbar']) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
      if (!db.objectStoreNames.contains('fotos')) db.createObjectStore('fotos');
      if (!db.objectStoreNames.contains('cola')) db.createObjectStore('cola', { keyPath: 'n', autoIncrement: true });
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error);
    r.onblocked = () => ko(new Error('La base de datos está bloqueada por otra pestaña.'));
  });
  return conexion;
}

function tx(almacen, modo, fn) {
  return abrir().then((db) => new Promise((ok, ko) => {
    const t = db.transaction(almacen, modo);
    const res = fn(t.objectStore(almacen));
    t.oncomplete = () => ok(res && 'result' in res ? res.result : res);
    t.onerror = () => ko(t.error);
    t.onabort = () => ko(t.error || new Error('Operación cancelada'));
  }));
}

export const todas = (almacen) => tx(almacen, 'readonly', (s) => s.getAll());
export const vaciar = (almacen) => tx(almacen, 'readwrite', (s) => s.clear());
export const fotoLeer = (id) => tx('fotos', 'readonly', (s) => s.get(id));
export const colaPoner = (op) => tx('cola', 'readwrite', (s) => s.add(op));
export const colaTodas = () => tx('cola', 'readonly', (s) => s.getAll());
export const colaQuitar = (n) => tx('cola', 'readwrite', (s) => s.delete(n));

export const nuevoId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
