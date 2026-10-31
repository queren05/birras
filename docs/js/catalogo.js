/* Datos de referencia: estilos, países y cervezas habituales para autocompletar.
 * Las graduaciones son las de etiqueta habituales; el usuario siempre puede corregirlas. */

export const ESTILOS = [
  'Lager', 'Pilsner', 'Especial', 'Extra', 'Tostada / Ámbar', 'Märzen', 'Bock', 'Doppelbock',
  'IPA', 'NEIPA', 'Doble IPA', 'Session IPA', 'APA', 'Pale Ale', 'Red Ale', 'Brown Ale',
  'Stout', 'Imperial Stout', 'Porter', 'Trigo (Weissbier)', 'Witbier', 'Saison',
  'Sour', 'Gose', 'Lambic', 'Blonde belga', 'Dubbel', 'Tripel', 'Quadrupel', 'Belgian Strong',
  'Barley Wine', 'Radler / Clara', 'Sin alcohol', 'Otra',
];

/* Familias para recomendaciones y estadísticas por grupo. */
export const FAMILIA = {
  'Lager': 'Lager', 'Pilsner': 'Lager', 'Especial': 'Lager', 'Extra': 'Lager', 'Märzen': 'Lager', 'Bock': 'Lager', 'Doppelbock': 'Lager', 'Tostada / Ámbar': 'Lager',
  'IPA': 'IPA', 'NEIPA': 'IPA', 'Doble IPA': 'IPA', 'Session IPA': 'IPA', 'APA': 'Ale', 'Pale Ale': 'Ale', 'Red Ale': 'Ale', 'Brown Ale': 'Ale',
  'Stout': 'Negra', 'Imperial Stout': 'Negra', 'Porter': 'Negra', 'Trigo (Weissbier)': 'Trigo', 'Witbier': 'Trigo',
  'Saison': 'Belga', 'Blonde belga': 'Belga', 'Dubbel': 'Belga', 'Tripel': 'Belga', 'Quadrupel': 'Belga', 'Belgian Strong': 'Belga',
  'Sour': 'Ácida', 'Gose': 'Ácida', 'Lambic': 'Ácida', 'Barley Wine': 'Fuerte', 'Radler / Clara': 'Ligera', 'Sin alcohol': 'Ligera', 'Otra': 'Otra',
};

export const PAISES = {
  'España': '🇪🇸', 'Alemania': '🇩🇪', 'Bélgica': '🇧🇪', 'Países Bajos': '🇳🇱', 'Reino Unido': '🇬🇧', 'Irlanda': '🇮🇪',
  'República Checa': '🇨🇿', 'Estados Unidos': '🇺🇸', 'México': '🇲🇽', 'Portugal': '🇵🇹', 'Francia': '🇫🇷', 'Italia': '🇮🇹',
  'Dinamarca': '🇩🇰', 'Escocia': '🏴󠁧󠁢󠁳󠁣󠁴󠁿', 'Austria': '🇦🇹', 'Polonia': '🇵🇱', 'Japón': '🇯🇵', 'China': '🇨🇳', 'Tailandia': '🇹🇭',
  'Brasil': '🇧🇷', 'Argentina': '🇦🇷', 'Perú': '🇵🇪', 'Colombia': '🇨🇴', 'Canadá': '🇨🇦', 'Australia': '🇦🇺', 'Noruega': '🇳🇴',
  'Suecia': '🇸🇪', 'Grecia': '🇬🇷', 'Turquía': '🇹🇷', 'Sudáfrica': '🇿🇦', 'Marruecos': '🇲🇦', 'Islandia': '🇮🇸',
};
export const bandera = (p) => PAISES[p] || (p ? '🏳️' : '');

/* Cervezas habituales para que añadir sea elegir en vez de escribir. */
export const CERVEZAS = [
  ['Mahou Cinco Estrellas', 'Mahou', 'Especial', 5.5, 'España'],
  ['Mahou Clásica', 'Mahou', 'Lager', 4.8, 'España'],
  ['Estrella Galicia Especial', 'Hijos de Rivera', 'Especial', 5.5, 'España'],
  ['1906 Reserva Especial', 'Hijos de Rivera', 'Tostada / Ámbar', 6.5, 'España'],
  ['Estrella Galicia 0,0', 'Hijos de Rivera', 'Sin alcohol', 0, 'España'],
  ['Estrella Damm', 'Damm', 'Lager', 5.4, 'España'],
  ['Voll-Damm', 'Damm', 'Märzen', 7.2, 'España'],
  ['Alhambra Reserva 1925', 'Alhambra', 'Extra', 6.4, 'España'],
  ['Alhambra Especial', 'Alhambra', 'Especial', 5.4, 'España'],
  ['Cruzcampo', 'Heineken España', 'Pilsner', 4.8, 'España'],
  ['San Miguel Especial', 'Mahou San Miguel', 'Especial', 5.4, 'España'],
  ['Ámbar Especial', 'La Zaragozana', 'Especial', 5.2, 'España'],
  ['Moritz', 'Moritz', 'Lager', 5.4, 'España'],
  ['Keler', 'Damm', 'Lager', 6, 'España'],
  ['La Virgen Madrid Lager', 'La Virgen', 'Lager', 5.1, 'España'],
  ['Heineken', 'Heineken', 'Lager', 5, 'Países Bajos'],
  ['Amstel', 'Heineken', 'Lager', 5, 'Países Bajos'],
  ['Guinness Draught', 'Guinness', 'Stout', 4.2, 'Irlanda'],
  ['Paulaner Hefe-Weissbier', 'Paulaner', 'Trigo (Weissbier)', 5.5, 'Alemania'],
  ['Erdinger Weissbier', 'Erdinger', 'Trigo (Weissbier)', 5.3, 'Alemania'],
  ['Leffe Blonde', 'Leffe', 'Blonde belga', 6.6, 'Bélgica'],
  ['Duvel', 'Duvel Moortgat', 'Belgian Strong', 8.5, 'Bélgica'],
  ['Chimay Azul', 'Chimay', 'Quadrupel', 9, 'Bélgica'],
  ['Hoegaarden', 'Hoegaarden', 'Witbier', 4.9, 'Bélgica'],
  ['Pilsner Urquell', 'Pilsner Urquell', 'Pilsner', 4.4, 'República Checa'],
  ['Corona Extra', 'Corona', 'Lager', 4.5, 'México'],
  ['Desperados', 'Heineken', 'Otra', 5.9, 'Países Bajos'],
  ['BrewDog Punk IPA', 'BrewDog', 'IPA', 5.4, 'Escocia'],
  ['Sierra Nevada Pale Ale', 'Sierra Nevada', 'APA', 5.6, 'Estados Unidos'],
  ['Brooklyn Lager', 'Brooklyn Brewery', 'Lager', 5.2, 'Estados Unidos'],
  ['Super Bock', 'Super Bock', 'Lager', 5.2, 'Portugal'],
  ['Asahi Super Dry', 'Asahi', 'Lager', 5, 'Japón'],
].map(([nombre, marca, estilo, abv, pais]) => ({ nombre, marca, estilo, abv, pais }));

/* Validación y limpieza de una ficha antes de guardarla. Devuelve {ok, datos, errores}. */
export function validar(f) {
  const errores = {};
  const txt = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  const datos = {
    nombre: txt(f.nombre, 80), marca: txt(f.marca, 60), estilo: txt(f.estilo, 40), pais: txt(f.pais, 40),
    comentario: String(f.comentario ?? '').trim().slice(0, 600),
    abv: f.abv === '' || f.abv == null ? null : Number(String(f.abv).replace(',', '.')),
    nota: f.nota == null || f.nota === '' ? null : Number(f.nota),
  };
  if (!datos.nombre) errores.nombre = 'Pon al menos el nombre de la cerveza.';
  if (datos.abv != null && (!Number.isFinite(datos.abv) || datos.abv < 0 || datos.abv > 70)) errores.abv = 'La graduación tiene que estar entre 0 y 70 %.';
  else if (datos.abv != null) datos.abv = Math.round(datos.abv * 10) / 10;
  if (datos.nota != null && (!Number.isFinite(datos.nota) || datos.nota < 0.5 || datos.nota > 5)) errores.nota = 'La nota va de 1 a 5.';
  return { ok: !Object.keys(errores).length, datos, errores };
}
