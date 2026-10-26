// SPDX-License-Identifier: GPL-2.0-or-later

// Languages for the game's fixed interface (buttons, tabs, headings and settings labels). Text that the game writes as it plays
// (status lines, briefings, the debrief) is still English only. The translations are the project's own first drafts and want a
// native speaker's review.
export const LANGUAGES = Object.freeze({ en: "English", es: "Español", fr: "Français" });
export const DEFAULT_LANGUAGE = "en";

// key: [English, Spanish, French]
const TABLE = Object.freeze({
  "update.now": ["Update now", "Actualizar ahora", "Mettre à jour"],
  "update.later": ["Later", "Más tarde", "Plus tard"],
  "top.operations": ["Operations", "Operaciones", "Opérations"],
  "top.reset": ["Reset", "Reiniciar", "Réinitialiser"],
  "action.move": ["Move to cursor", "Mover al cursor", "Aller au curseur"],
  "tab.mission": ["Mission", "Misión", "Mission"],
  "tab.enemies": ["Enemies", "Enemigos", "Ennemis"],
  "tab.save": ["Save", "Guardar", "Sauvegarde"],
  "heading.objectives": ["Objectives", "Objetivos", "Objectifs"],
  "heading.threats": ["Threats", "Amenazas", "Menaces"],
  "heading.save_data": ["Save data", "Datos guardados", "Données sauvegardées"],
  "save.save": ["Save", "Guardar", "Sauvegarder"],
  "save.load": ["Load", "Cargar", "Charger"],
  "save.export": ["Export JSON", "Exportar JSON", "Exporter en JSON"],
  "save.import": ["Import JSON", "Importar JSON", "Importer un JSON"],
  "footer.settings": ["Settings", "Ajustes", "Réglages"],
  "footer.about": ["About & licenses", "Acerca de y licencias", "À propos et licences"],
  "filter.open": ["Open", "Abiertas", "Ouvertes"],
  "filter.all": ["All", "Todas", "Toutes"],
  "filter.done": ["Done", "Hechas", "Terminées"],
  "title.how_to_play": ["How to play", "Cómo jugar", "Comment jouer"],
  "title.resume": ["Resume the operation", "Reanudar la operación", "Reprendre l'opération"],
  "title.discard": ["Discard it", "Descartarla", "L'abandonner"],
  "title.new_game": ["New game", "Nueva partida", "Nouvelle partie"],
  "title.research": ["Research & Armoury", "Investigación y armería", "Recherche et armurerie"],
  "title.menu": ["Main menu", "Menú principal", "Menu principal"],
  "menu.continue": ["Continue", "Continuar", "Continuer"],
  "menu.campaign": ["Campaign", "Campaña", "Campagne"],
  "menu.campaign_note": [
    "Fight for the territories on the world map.",
    "Lucha por los territorios del mapa mundial.",
    "Battez-vous pour les territoires de la carte du monde.",
  ],
  "menu.new_game": ["New game", "Nueva partida", "Nouvelle partie"],
  "menu.new_game_note": ["Start the whole campaign again.", "Empieza toda la campaña de nuevo.", "Recommencez toute la campagne."],
  "menu.online": ["Online (planned)", "En línea (previsto)", "En ligne (prévu)"],
  "menu.coop": ["Co-op operations", "Operaciones cooperativas", "Opérations en coopération"],
  "menu.coop_note": [
    "Two to four players, one squad each.",
    "De dos a cuatro jugadores, una escuadra cada uno.",
    "De deux à quatre joueurs, une équipe chacun.",
  ],
  "menu.daily": ["Daily operation", "Operación diaria", "Opération du jour"],
  "menu.daily_note": [
    "The same operation for everyone, ranked.",
    "La misma operación para todos, con clasificación.",
    "La même opération pour tous, avec classement.",
  ],
  "menu.rivals": ["Rival syndicates", "Sindicatos rivales", "Syndicats rivaux"],
  "menu.rivals_note": [
    "Raid other players' territories.",
    "Asalta los territorios de otros jugadores.",
    "Attaquez les territoires des autres joueurs.",
  ],
  "menu.more": ["More", "Más", "Plus"],
  "menu.settings": ["Settings", "Ajustes", "Réglages"],
  "menu.editor": ["Mission editor", "Editor de misiones", "Éditeur de missions"],
  "menu.about": ["About & licenses", "Acerca de y licencias", "À propos et licences"],
  "title.begin": ["Begin operation", "Comenzar la operación", "Commencer l'opération"],
  "lab.squad": ["Squad", "Escuadra", "Équipe"],
  "lab.research": ["Research", "Investigación", "Recherche"],
  "lab.parts": ["Body parts research", "Investigación de implantes", "Recherche d'implants"],
  "outcome.next": ["Next operation", "Siguiente operación", "Opération suivante"],
  "outcome.replay": ["Replay operation", "Repetir la operación", "Rejouer l'opération"],
  "outcome.review": ["Review the map", "Ver el mapa", "Revoir la carte"],
  "settings.title": ["Settings", "Ajustes", "Réglages"],
  "settings.volume": ["Volume", "Volumen", "Volume"],
  "settings.mute": ["Mute sound", "Silenciar el sonido", "Couper le son"],
  "settings.music": ["Play music", "Reproducir música", "Jouer la musique"],
  "settings.music_volume": ["Music volume", "Volumen de la música", "Volume de la musique"],
  "settings.captions": ["Show cue captions", "Mostrar subtítulos de sonidos", "Afficher les sous-titres des sons"],
  "settings.edge_scroll": ["Scroll the map at the screen edges", "Desplazar el mapa en los bordes", "Faire défiler la carte aux bords"],
  "settings.motion": ["Reduced motion", "Movimiento reducido", "Mouvement réduit"],
  "settings.text": ["Text size", "Tamaño del texto", "Taille du texte"],
  "settings.language": ["Language", "Idioma", "Langue"],
  "settings.reset_keys": ["Restore default keys", "Restaurar las teclas", "Rétablir les touches"],
  "settings.reset_progress": ["Reset completed operations", "Borrar las operaciones completadas", "Effacer les opérations terminées"],
});

export const KEYS = Object.freeze(Object.keys(TABLE));
const INDEX = { en: 0, es: 1, fr: 2 };

/** The text for a key in a language, falling back to English (and to the key itself if it is unknown). */
export function translate(language, key) {
  const row = TABLE[key];
  if (!row) return key;
  return row[INDEX[language] ?? 0] || row[0];
}

/** A supported language for a browser's language list (["es-MX", "en"] gives "es"), else English. */
export function pickLanguage(preferred = []) {
  for (const tag of preferred) {
    const code = String(tag).toLowerCase().split("-")[0];
    if (code in LANGUAGES) return code;
  }
  return DEFAULT_LANGUAGE;
}

/**
 * Put every element marked with `data-i18n="key"` into a language. The first piece of plain text in the element is replaced and
 * anything else inside it (an input, a count) is left alone, so labels that hold a checkbox keep it.
 */
export function applyTranslations(root, language) {
  for (const element of root.querySelectorAll("[data-i18n]")) {
    const text = translate(language, element.getAttribute("data-i18n"));
    const node = [...element.childNodes].find((child) => child.nodeType === 3 && child.textContent.trim() !== "");
    if (node) node.textContent = node.textContent.replace(node.textContent.trim(), text);
    else if (element.children.length === 0) element.textContent = text;
    else element.prepend(element.ownerDocument.createTextNode(text));
  }
  if (root.documentElement) root.documentElement.lang = language;
}
