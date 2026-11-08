// Starter items for Spanish speakers learning French, transcribed from the
// original practice games (docs/suggested-lessons/fr-es/).

type Seed = {
  kind: "lemma" | "chunk" | "grammar" | "glyph";
  key: string;
  text: string;
  gloss?: string;
  notes?: string;
};

const PRONOUNS: [string, string][] = [
  ["je", "yo"],
  ["tu", "tú"],
  ["il", "él"],
  ["elle", "ella"],
  ["on", "uno, nosotros (coloquial)"],
  ["nous", "nosotros"],
  ["vous", "vosotros, usted(es)"],
  ["ils", "ellos"],
  ["elles", "ellas"],
];

// Infinitive and accepted Spanish meanings.
const ESSENTIAL_VERBS: [string, string][] = [
  ["être", "ser, estar"],
  ["avoir", "tener, haber"],
  ["vouloir", "querer"],
  ["aller", "ir"],
  ["devoir", "deber, tener que"],
  ["falloir", "hacer falta, ser necesario"],
  ["penser", "pensar"],
  ["faire", "hacer"],
  ["prendre", "tomar, coger"],
  ["dire", "decir"],
  ["pouvoir", "poder"],
  ["savoir", "saber"],
  ["voir", "ver"],
  ["venir", "venir"],
  ["aimer", "amar, querer, gustar"],
  ["donner", "dar"],
  ["oublier", "olvidar"],
  ["mettre", "poner"],
  ["trouver", "encontrar"],
  ["attendre", "esperar"],
  ["essayer", "intentar, probar"],
  ["apprendre", "aprender, enseñar"],
  ["jouer", "jugar"],
  ["parler", "hablar"],
  ["chercher", "buscar"],
  ["sortir", "salir"],
  ["rire", "reír"],
  ["vivre", "vivir"],
  ["comprendre", "comprender, entender"],
  ["croire", "creer"],
];

const ER_VERBS: [string, string][] = [
  ["donner", "dar"],
  ["passer", "pasar"],
  ["chercher", "buscar"],
  ["penser", "pensar"],
  ["écouter", "escuchar"],
  ["aimer", "amar, querer, gustar"],
  ["arriver", "llegar"],
  ["entrer", "entrar"],
  ["cacher", "esconder, ocultar"],
  ["allonger", "alargar, estirar"],
  ["aménager", "acondicionar, arreglar, adaptar"],
  ["arranger", "arreglar"],
  ["avantager", "favorecer"],
  ["bouger", "mover, moverse"],
  ["changer", "cambiar"],
  ["charger", "cargar"],
  ["corriger", "corregir"],
  ["décourager", "desanimar"],
  ["encourager", "animar, alentar"],
  ["déranger", "molestar"],
  ["diriger", "dirigir"],
  ["échanger", "intercambiar"],
  ["éponger", "secar, enjugar"],
  ["juger", "juzgar"],
  ["longer", "bordear"],
  ["manger", "comer"],
  ["mélanger", "mezclar"],
  ["nager", "nadar"],
  ["obliger", "obligar"],
  ["partager", "compartir"],
  ["plonger", "zambullirse, bucear, sumergirse"],
  ["protéger", "proteger"],
  ["ranger", "ordenar, guardar"],
  ["recharger", "recargar"],
  ["ronger", "roer"],
  ["venger", "vengar"],
  ["voyager", "viajar"],
  ["avancer", "avanzar"],
  ["coincer", "atascar, atrapar"],
  ["commencer", "empezar, comenzar"],
  ["enfoncer", "hundir, clavar"],
  ["financer", "financiar"],
  ["foncer", "lanzarse, precipitarse"],
  ["forcer", "forzar"],
  ["grimacer", "hacer muecas"],
  ["lancer", "lanzar"],
  ["percer", "perforar, atravesar"],
  ["prononcer", "pronunciar"],
  ["saucer", "rebañar, mojar"],
  ["tracer", "trazar"],
];

const GRAMMAR: Seed[] = [
  {
    kind: "grammar",
    key: "pronouns:subject",
    text: "Pronoms sujets",
    gloss: "pronombres personales sujeto",
  },
  {
    kind: "grammar",
    key: "present:etre",
    text: "Présent : être",
    gloss: "presente de être (ser/estar)",
    notes: "suis, es, est, sommes, êtes, sont",
  },
  {
    kind: "grammar",
    key: "present:avoir",
    text: "Présent : avoir",
    gloss: "presente de avoir (tener/haber)",
    notes: "ai, as, a, avons, avez, ont",
  },
  {
    kind: "grammar",
    key: "present:er-regular",
    text: "Présent : verbes en -er",
    gloss: "presente de los verbos regulares en -er",
    notes: "-e, -es, -e, -ons, -ez, -ent",
  },
  {
    kind: "grammar",
    key: "present:er-ger",
    text: "Présent : verbes en -ger",
    gloss: "verbos en -ger: nous mangeons",
    notes: "nous + -eons (mangeons, voyageons)",
  },
  {
    kind: "grammar",
    key: "present:er-cer",
    text: "Présent : verbes en -cer",
    gloss: "verbos en -cer: nous commençons",
    notes: "c → ç before -ons (commençons, lançons)",
  },
  {
    kind: "grammar",
    key: "present:irregular-common",
    text: "Présent : verbes irréguliers fréquents",
    gloss: "presente de los verbos irregulares más usados",
  },
];

function buildFrEs(): Seed[] {
  const lemmas = new Map<string, Seed>();
  for (const [text, gloss] of [...PRONOUNS, ...ESSENTIAL_VERBS, ...ER_VERBS]) {
    if (!lemmas.has(text)) lemmas.set(text, { kind: "lemma", key: text, text, gloss });
  }
  return [...lemmas.values(), ...GRAMMAR];
}

export const STARTER_SETS: Record<string, { baseLang: string; targetLang: string; items: Seed[] }> = {
  "fr-es": { baseLang: "es", targetLang: "fr", items: buildFrEs() },
};
