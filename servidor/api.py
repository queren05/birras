#!/usr/bin/env python3
"""API del diario de Casino Birras. Los datos de todos viven aquí (SQLite + fotos en disco).

Escucha en 127.0.0.1:8790; Tailscale Funnel la publica en https://servidor.tail9fb7ef.ts.net
para que llegue desde cualquier móvil sin abrir puertos del router.

  GET    /api/salud
  GET    /api/diario?u=<jugador>            -> {cervezas:[...], porProbar:[...]}
  PUT    /api/cervezas/<id>    (JSON)       DELETE /api/cervezas/<id>?u=
  PUT    /api/porprobar/<id>   (JSON)       DELETE /api/porprobar/<id>?u=
  PUT    /api/fotos/<id>?u=    (image/jpeg) GET    /api/fotos/<id>
"""
import json, os, re, sqlite3, threading, time
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

DIR = os.environ.get('STATE_DIRECTORY', '/var/lib/birras')
DB = os.path.join(DIR, 'diario.sqlite')
FOTOS = os.path.join(DIR, 'fotos-diario')
PERFILES = os.path.join(DIR, 'perfiles')   # foto de perfil a tamaño grande (en ntfy solo cabe la miniatura)
ID_JUGADOR = re.compile(r'^[a-z0-9]{2,16}$')   # la lista de jugadores la gestiona la app
ORIGENES = {'https://queren05.github.io', 'capacitor://localhost', 'http://localhost', 'https://localhost', 'http://127.0.0.1:8933'}
ID = re.compile(r'^[A-Za-z0-9-]{8,64}$')
MAX_JSON, MAX_FOTO = 16 * 1024, 3 * 1024 * 1024
os.makedirs(FOTOS, exist_ok=True)
os.makedirs(PERFILES, exist_ok=True)
bloqueo = threading.Lock()

def conectar():
    c = sqlite3.connect(DB, timeout=10)
    c.execute('PRAGMA journal_mode=WAL')
    c.execute('CREATE TABLE IF NOT EXISTS fichas (tabla TEXT, id TEXT, u TEXT, datos TEXT, editado INTEGER, borrado INTEGER DEFAULT 0, PRIMARY KEY (tabla, id))')
    c.execute('CREATE INDEX IF NOT EXISTS por_u ON fichas (u, tabla)')
    return c

# Límite sencillo por IP: 120 escrituras por minuto (frena abusos, no molesta al uso normal).
ventana = {}
def permitido(ip):
    ahora = time.time()
    l = [t for t in ventana.get(ip, []) if ahora - t < 60]
    l.append(ahora); ventana[ip] = l
    return len(l) <= 120

def limpiar(d, tabla):
    txt = lambda v, n: re.sub(r'\s+', ' ', str(v or '')).strip()[:n]
    o = {'nombre': txt(d.get('nombre'), 80), 'marca': txt(d.get('marca'), 60), 'estilo': txt(d.get('estilo'), 40), 'pais': txt(d.get('pais'), 40)}
    if not o['nombre']: raise ValueError('falta el nombre')
    if tabla == 'cervezas':
        abv, nota = d.get('abv'), d.get('nota')
        o['abv'] = None if abv in (None, '') else round(float(abv), 1)
        if o['abv'] is not None and not 0 <= o['abv'] <= 70: raise ValueError('graduación fuera de rango')
        o['nota'] = None if nota in (None, '') else float(nota)
        if o['nota'] is not None and not 0.5 <= o['nota'] <= 5: raise ValueError('nota fuera de rango')
        o['comentario'] = str(d.get('comentario') or '').strip()[:600]
        o['fecha'] = int(d.get('fecha') or time.time() * 1000)
        o['creado'] = int(d.get('creado') or o['fecha'])
        o['favorita'] = bool(d.get('favorita'))
        o['tieneFoto'] = bool(d.get('tieneFoto'))
    else:
        o['nota'] = txt(d.get('nota'), 140)
        o['creado'] = int(d.get('creado') or time.time() * 1000)
    o['editado'] = int(d.get('editado') or time.time() * 1000)
    return o

class API(BaseHTTPRequestHandler):
    server_version = 'Birras/1'
    def log_message(self, fmt, *a): pass

    def cors(self):
        o = self.headers.get('Origin', '')
        if o in ORIGENES: self.send_header('Access-Control-Allow-Origin', o); self.send_header('Vary', 'Origin')
        self.send_header('Access-Control-Allow-Methods', 'GET, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Access-Control-Max-Age', '86400')

    def responder(self, code, obj=None, tipo='application/json', cuerpo=None, cache=None):
        datos = cuerpo if cuerpo is not None else json.dumps(obj if obj is not None else {}, ensure_ascii=False).encode()
        self.send_response(code); self.cors()
        self.send_header('Content-Type', tipo); self.send_header('Content-Length', str(len(datos)))
        self.send_header('Cache-Control', cache or 'no-store')
        self.end_headers(); self.wfile.write(datos)

    def ip(self): return self.headers.get('X-Forwarded-For', self.client_address[0]).split(',')[0].strip()

    def leer(self, maximo):
        n = int(self.headers.get('Content-Length') or 0)
        if n > maximo: raise ValueError('demasiado grande')
        return self.rfile.read(n)

    def do_OPTIONS(self): self.responder(204, cuerpo=b'')

    def do_GET(self):
        p = urlparse(self.path); q = parse_qs(p.query)
        if p.path == '/api/salud': return self.responder(200, {'ok': True})
        if p.path == '/api/diario':
            u = (q.get('u') or [''])[0]
            if not (isinstance(u, str) and ID_JUGADOR.match(u)): return self.responder(400, {'error': 'jugador desconocido'})
            with conectar() as c:
                filas = c.execute('SELECT tabla, id, datos, editado, borrado FROM fichas WHERE u=?', (u,)).fetchall()
            out = {'cervezas': [], 'porProbar': [], 'borradas': []}
            for tabla, i, datos, ed, borrado in filas:
                if borrado: out['borradas'].append({'tabla': tabla, 'id': i, 'editado': ed}); continue
                d = json.loads(datos); d['id'] = i; d['u'] = u
                out['cervezas' if tabla == 'cervezas' else 'porProbar'].append(d)
            return self.responder(200, out)
        m = re.fullmatch(r'/api/perfil/([a-z0-9]+)', p.path)
        if m and ID_JUGADOR.match(m.group(1)):
            f = os.path.join(PERFILES, m.group(1) + '.jpg')
            if not os.path.exists(f): return self.responder(404, {'error': 'sin foto'})
            with open(f, 'rb') as fh: return self.responder(200, tipo='image/jpeg', cuerpo=fh.read(), cache='public, max-age=300')
        m = re.fullmatch(r'/api/fotos/([A-Za-z0-9-]+)', p.path)
        if m and ID.match(m.group(1)):
            f = os.path.join(FOTOS, m.group(1) + '.jpg')
            if not os.path.exists(f): return self.responder(404, {'error': 'sin foto'})
            with open(f, 'rb') as fh: return self.responder(200, tipo='image/jpeg', cuerpo=fh.read(), cache='public, max-age=31536000, immutable')
        self.responder(404, {'error': 'no existe'})

    def do_PUT(self):
        if not permitido(self.ip()): return self.responder(429, {'error': 'demasiadas peticiones'})
        p = urlparse(self.path); q = parse_qs(p.query)
        try:
            m = re.fullmatch(r'/api/(cervezas|porprobar)/([A-Za-z0-9-]+)', p.path)
            if m and ID.match(m.group(2)):
                tabla = 'cervezas' if m.group(1) == 'cervezas' else 'porProbar'
                d = json.loads(self.leer(MAX_JSON) or b'{}')
                u = d.get('u')
                if not (isinstance(u, str) and ID_JUGADOR.match(u)): return self.responder(400, {'error': 'jugador desconocido'})
                o = limpiar(d, tabla)
                with bloqueo, conectar() as c:
                    ant = c.execute('SELECT editado, u FROM fichas WHERE tabla=? AND id=?', (tabla, m.group(2))).fetchone()
                    if ant and ant[1] != u: return self.responder(403, {'error': 'es de otro jugador'})
                    if ant and ant[0] > o['editado']: return self.responder(409, {'error': 'hay una versión más nueva'})
                    c.execute('INSERT OR REPLACE INTO fichas (tabla, id, u, datos, editado, borrado) VALUES (?,?,?,?,?,0)',
                              (tabla, m.group(2), u, json.dumps(o, ensure_ascii=False), o['editado']))
                return self.responder(200, {'ok': True})
            m = re.fullmatch(r'/api/perfil/([a-z0-9]+)', p.path)
            if m and ID_JUGADOR.match(m.group(1)):
                cuerpo = self.leer(MAX_FOTO)
                if not cuerpo.startswith(b'\xff\xd8'): return self.responder(400, {'error': 'solo JPEG'})
                tmp = os.path.join(PERFILES, m.group(1) + '.tmp')
                with open(tmp, 'wb') as fh: fh.write(cuerpo)
                os.replace(tmp, os.path.join(PERFILES, m.group(1) + '.jpg'))
                return self.responder(200, {'ok': True})
            m = re.fullmatch(r'/api/fotos/([A-Za-z0-9-]+)', p.path)
            if m and ID.match(m.group(1)):
                cuerpo = self.leer(MAX_FOTO)
                if not cuerpo.startswith(b'\xff\xd8'): return self.responder(400, {'error': 'solo JPEG'})
                tmp = os.path.join(FOTOS, m.group(1) + '.tmp')
                with open(tmp, 'wb') as fh: fh.write(cuerpo)
                os.replace(tmp, os.path.join(FOTOS, m.group(1) + '.jpg'))
                return self.responder(200, {'ok': True})
        except (ValueError, TypeError, json.JSONDecodeError) as e:
            return self.responder(400, {'error': str(e)})
        self.responder(404, {'error': 'no existe'})

    def do_DELETE(self):
        if not permitido(self.ip()): return self.responder(429, {'error': 'demasiadas peticiones'})
        p = urlparse(self.path); q = parse_qs(p.query)
        m = re.fullmatch(r'/api/(cervezas|porprobar)/([A-Za-z0-9-]+)', p.path)
        u = (q.get('u') or [''])[0]
        if not (m and ID.match(m.group(2)) and ID_JUGADOR.match(u)): return self.responder(400, {'error': 'petición no válida'})
        tabla = 'cervezas' if m.group(1) == 'cervezas' else 'porProbar'
        with bloqueo, conectar() as c:
            ant = c.execute('SELECT u FROM fichas WHERE tabla=? AND id=?', (tabla, m.group(2))).fetchone()
            if ant and ant[0] != u: return self.responder(403, {'error': 'es de otro jugador'})
            # Se marca como borrada (no se elimina) para que los demás móviles se enteren al sincronizar.
            c.execute('INSERT OR REPLACE INTO fichas (tabla, id, u, datos, editado, borrado) VALUES (?,?,?,?,?,1)',
                      (tabla, m.group(2), u, '{}', int(time.time() * 1000)))
        f = os.path.join(FOTOS, m.group(2) + '.jpg')
        if tabla == 'cervezas' and os.path.exists(f): os.remove(f)
        self.responder(200, {'ok': True})

if __name__ == '__main__':
    conectar().close()
    ThreadingHTTPServer(('127.0.0.1', 8790), API).serve_forever()
