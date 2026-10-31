/* Almacén local del diario (IndexedDB): funciona sin conexión y aguanta fotos.
 * Elegido frente a localStorage porque guarda Blobs y no tiene el límite de ~5 MB. */
const NOMBRE = 'birras-diario', VERSION = 1;
let conexion = null;

function abrir() {
  if (conexion) return conexion;
  conexion = new Promise((ok, ko) => {
    const r = indexedDB.open(NOMBRE, VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('cervezas')) {
        const s = db.createObjectStore('cervezas', { keyPath: 'id' });
        s.createIndex('fecha', 'fecha');
      }
      if (!db.objectStoreNames.contains('porProbar')) db.createObjectStore('porProbar', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('fotos')) db.createObjectStore('fotos');
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
export const guardar = (almacen, obj) => tx(almacen, 'readwrite', (s) => s.put(obj));
export const borrar = (almacen, id) => tx(almacen, 'readwrite', (s) => s.delete(id));
export const fotoGuardar = (id, blob) => tx('fotos', 'readwrite', (s) => s.put(blob, id));
export const fotoLeer = (id) => tx('fotos', 'readonly', (s) => s.get(id));
export const fotoBorrar = (id) => tx('fotos', 'readwrite', (s) => s.delete(id));

export const nuevoId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

/* Pide al navegador que no borre los datos si anda corto de espacio. */
export function persistir() { try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) { /* nada */ } }
