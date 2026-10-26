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
  "title.research": ["Research & Armoury", "Investigación y armería", "Recherche et armurerie"],
  "title.menu": ["Main menu", "Menú principal", "Menu principal"],
  "company.heading": ["Name your company", "Nombra tu empresa", "Nommez votre société"],
  "company.intro": [
    "Every operation is run in its name. Other players will see it online.",
    "Cada operación se lleva a cabo en su nombre. Otros jugadores lo verán en línea.",
    "Chaque opération est menée en son nom. Les autres joueurs le verront en ligne.",
  ],
  "company.label": ["Company name", "Nombre de la empresa", "Nom de la société"],
  "company.cancel": ["Back", "Volver", "Retour"],
  "company.save": ["Confirm", "Confirmar", "Confirmer"],
  "company.rename": ["Rename company", "Cambiar nombre", "Renommer la société"],
  "menu.tutorial": ["Tutorial", "Tutorial", "Tutoriel"],
  "menu.tutorial_note": [
    "Learn the controls in a few minutes. Nothing counts.",
    "Aprende los controles en unos minutos. Nada cuenta.",
    "Apprenez les commandes en quelques minutes. Rien ne compte.",
  ],
  "tutorial.title": ["TRAINING", "ENTRENAMIENTO", "ENTRAÎNEMENT"],
  "tutorial.skip_step": ["Skip this step", "Saltar este paso", "Passer cette étape"],
  "tutorial.leave": ["Leave training", "Salir del entrenamiento", "Quitter l'entraînement"],
  "tutorial.again": ["Train again", "Entrenar de nuevo", "Recommencer"],
  "tutorial.finish": ["Main menu", "Menú principal", "Menu principal"],
  "about.eyebrow": ["ABOUT OPENSYND", "ACERCA DE OPENSYND", "À PROPOS D'OPENSYND"],
  "about.heading": ["An unofficial fan game", "Un juego de fans no oficial", "Un jeu de fans non officiel"],
  "about.lead": [
    "NeuroReign is an unofficial, non-profit fan game, made as a hobby. It is inspired by other games and is not affiliated with " +
      "or endorsed by their makers or owners. It is free, has no adverts and sells nothing.",
    "NeuroReign es un juego de fans no oficial y sin ánimo de lucro, hecho como afición. Se inspira en otros juegos y no está " +
      "afiliado ni respaldado por sus creadores o propietarios. Es gratis, no tiene anuncios y no vende nada.",
    "NeuroReign est un jeu de fans non officiel et sans but lucratif, fait par passion. Il s'inspire d'autres jeux, sans affiliation " +
      "ni soutien de leurs créateurs ou propriétaires. Il est gratuit, sans publicité, et ne vend rien.",
  ],
  "about.scratch": [
    "The game, its art, maps, missions and writing were developed from scratch for this project. " +
      "Its rules and numbers come from the open source FreeSynd project.",
    "El juego, su arte, mapas, misiones y textos se desarrollaron desde cero para este proyecto. " +
      "Sus reglas y cifras provienen del proyecto de código abierto FreeSynd.",
    "Le jeu, ses graphismes, cartes, missions et textes ont été développés de zéro pour ce projet. " +
      "Ses règles et ses chiffres viennent du projet libre FreeSynd.",
  ],
  "about.thanks": [
    "Thank you to the FreeSynd team and to the whole open source community, whose work and generosity made this possible.",
    "Gracias al equipo de FreeSynd y a toda la comunidad de código abierto, cuyo trabajo y generosidad lo hicieron posible.",
    "Merci à l'équipe de FreeSynd et à toute la communauté open source, dont le travail et la générosité ont tout rendu possible.",
  ],
  "about.fs_heading": ["How FreeSynd was used", "Cómo se usó FreeSynd", "Comment FreeSynd a été utilisé"],
  "about.fs_fork": [
    "This project began as a copy (a fork) of the FreeSynd repository. The old engine code is still in the repository for " +
      "reference, but the browser game does not use it.",
    "Este proyecto empezó como una copia (un fork) del repositorio de FreeSynd. El código del motor antiguo sigue en el " +
      "repositorio como referencia, pero el juego de navegador no lo usa.",
    "Ce projet est parti d'une copie (un fork) du dépôt de FreeSynd. L'ancien code du moteur reste dans le dépôt pour " +
      "référence, mais le jeu en navigateur ne l'utilise pas.",
  ],
  "about.fs_rules": [
    "FreeSynd's source code is where the rules were learned: how persuading works, the cybernetic upgrades, the drugs, how " +
      "accurate a shot is, carrying weight, refilling ammunition, research, territories with tax, mood and revolt, and how " +
      "police, guards, vehicles and traffic behave. They were rebuilt from scratch in the browser, and where our first idea and " +
      "FreeSynd's rule disagreed, FreeSynd's won.",
    "El código fuente de FreeSynd es donde se aprendieron las reglas: cómo funciona la persuasión, las mejoras cibernéticas, " +
      "las drogas, la precisión de un disparo, el peso que se carga, la recarga de munición, la investigación, los territorios " +
      "con impuestos, ánimo y revuelta, y el comportamiento de policías, guardias, vehículos y tráfico. Se reconstruyeron " +
      "desde cero en el navegador y, cuando nuestra primera idea y la regla de FreeSynd diferían, ganó la de FreeSynd.",
    "Le code source de FreeSynd est la source des règles : la persuasion, les améliorations cybernétiques, les drogues, la " +
      "précision d'un tir, le poids porté, le réapprovisionnement en munitions, la recherche, les territoires avec impôts, " +
      "moral et révolte, et le comportement de la police, des gardes, des véhicules et de la circulation. Elles ont été " +
      "reconstruites de zéro dans le navigateur et, en cas de désaccord, la règle de FreeSynd l'a emporté.",
  ],
  "about.fs_not": [
    "Nothing else was taken: no graphics, sounds, music, maps, missions, writing, names or data files. The FreeSynd team has " +
      "nothing to do with this game and has not seen or approved it.",
    "No se tomó nada más: ni gráficos, sonidos, música, mapas, misiones, textos, nombres ni archivos de datos. El equipo de " +
      "FreeSynd no tiene nada que ver con este juego y no lo ha visto ni aprobado.",
    "Rien d'autre n'a été pris : ni graphismes, sons, musique, cartes, missions, textes, noms ou fichiers de données. " +
      "L'équipe de FreeSynd n'a rien à voir avec ce jeu et ne l'a ni vu ni approuvé.",
  ],
  "about.fs_link": ["Visit the FreeSynd project", "Visitar el proyecto FreeSynd", "Visiter le projet FreeSynd"],
  "about.free": [
    "Free to inspect, modify, and share",
    "Libre de inspeccionar, modificar y compartir",
    "Libre d'inspecter, de modifier et de partager",
  ],
  "menu.signin": ["Sign in", "Iniciar sesión", "Se connecter"],
  "menu.signin_note": [
    "An account keeps your name and scores on the server.",
    "Una cuenta guarda tu nombre y tus puntuaciones en el servidor.",
    "Un compte garde votre nom et vos scores sur le serveur.",
  ],
  "menu.online_test": ["Play on the server", "Jugar en el servidor", "Jouer sur le serveur"],
  "menu.online_test_note": [
    "A test operation run by the server, to check the connection.",
    "Una operación de prueba del servidor, para comprobar la conexión.",
    "Une opération d'essai gérée par le serveur, pour vérifier la connexion.",
  ],
  "signin.heading": ["Sign in", "Iniciar sesión", "Se connecter"],
  "signin.name": ["Name", "Nombre", "Nom"],
  "signin.password": ["Password", "Contraseña", "Mot de passe"],
  "signin.cancel": ["Cancel", "Cancelar", "Annuler"],
  "signin.create": ["Create account", "Crear cuenta", "Créer un compte"],
  "signin.submit": ["Sign in", "Entrar", "Entrer"],
  "daily.heading": ["Daily operation", "Operación diaria", "Opération du jour"],
  "daily.chores": ["Today's chores", "Tareas de hoy", "Tâches du jour"],
  "daily.board": ["Board", "Clasificación", "Classement"],
  "daily.today": ["Today", "Hoy", "Aujourd'hui"],
  "daily.week": ["This week", "Esta semana", "Cette semaine"],
  "daily.all": ["All time", "Siempre", "Depuis toujours"],
  "daily.close": ["Close", "Cerrar", "Fermer"],
  "daily.play": ["Play today's operation", "Jugar la operación de hoy", "Jouer l'opération du jour"],
  "signin.outiva": ["Sign in with Outiva", "Iniciar sesión con Outiva", "Se connecter avec Outiva"],
  "coop.friends": ["Friends", "Amigos", "Amis"],
  "coop.friend_name": ["Add by name", "Añadir por nombre", "Ajouter par nom"],
  "coop.friend_add": ["Ask", "Pedir", "Demander"],
  "coop.heading": ["Co-op operations", "Operaciones cooperativas", "Opérations en coopération"],
  "coop.open_games": ["Open games", "Partidas abiertas", "Parties ouvertes"],
  "coop.quick": ["Quick match", "Partida rápida", "Partie rapide"],
  "coop.players": ["Players", "Jugadores", "Joueurs"],
  "coop.open": ["Open a game", "Abrir una partida", "Ouvrir une partie"],
  "coop.leave": ["Leave", "Salir", "Quitter"],
  "coop.ready": ["Ready", "Listo", "Prêt"],
  "coop.begin": ["Begin", "Empezar", "Commencer"],
  "coop.close": ["Close", "Cerrar", "Fermer"],
  "world.heading": ["Rival companies", "Empresas rivales", "Sociétés rivales"],
  "world.territories": ["Territories", "Territorios", "Territoires"],
  "world.log": ["Recent raids", "Incursiones recientes", "Raids récents"],
  "world.close": ["Close", "Cerrar", "Fermer"],
  "menu.continue": ["Continue", "Continuar", "Continuer"],
  "menu.campaign": ["Start campaign", "Empezar campaña", "Commencer la campagne"],
  "menu.campaign_note": [
    "Fight for the territories on the world map.",
    "Lucha por los territorios del mapa mundial.",
    "Battez-vous pour les territoires de la carte du monde.",
  ],
  "menu.new_game": ["New campaign", "Nueva campaña", "Nouvelle campagne"],
  "menu.new_game_note": ["Wipe this one and begin again.", "Borra esta y empieza de nuevo.", "Effacez celle-ci et recommencez."],
  "menu.online": ["Online", "En línea", "En ligne"],
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
  "menu.rivals": ["Rival companies", "Empresas rivales", "Sociétés rivales"],
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
