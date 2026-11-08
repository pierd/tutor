// Starter unit for Spanish speakers learning French, transcribed from the
// original practice games (docs/suggested-lessons/fr-es/).

import type { StarterUnit, SeedCard, SeedItem } from "./types";

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
const PERSONS = ["je", "tu", "il", "elle", "on", "nous", "vous", "ils", "elles"] as const;
type FormKey = "je" | "tu" | "il" | "nous" | "vous" | "ils";
const FORM_KEY: Record<(typeof PERSONS)[number], FormKey> = {
  je: "je", tu: "tu", il: "il", elle: "il", on: "il", nous: "nous", vous: "vous", ils: "ils", elles: "ils",
};
const SUBJECT: Record<(typeof PERSONS)[number], string> = {
  je: "Je", tu: "Tu", il: "Il", elle: "Elle", on: "On", nous: "Nous", vous: "Vous", ils: "Ils", elles: "Elles",
};

type Verb = { inf: string; gloss: string; suffix: string; forms: Partial<Record<FormKey, string>>; alts?: Partial<Record<FormKey, string[]>> };

function forms(csv: string): Record<FormKey, string> {
  const [je, tu, il, nous, vous, ils] = csv.split(" ");
  return { je, tu, il, nous, vous, ils };
}

// infinitive, Spanish meanings, sentence ending, présent forms (je tu il nous vous ils)
const ESSENTIAL: Verb[] = (
  [
    ["être", "ser, estar", "à la maison.", "suis es est sommes êtes sont"],
    ["avoir", "tener, haber", "un livre.", "ai as a avons avez ont"],
    ["vouloir", "querer", "un café.", "veux veux veut voulons voulez veulent"],
    ["aller", "ir", "au cinéma.", "vais vas va allons allez vont"],
    ["devoir", "deber, tener que", "partir tôt.", "dois dois doit devons devez doivent"],
    ["falloir", "hacer falta, ser necesario", "du temps.", "- - faut - - -"],
    ["penser", "pensar", "que c'est une bonne idée.", "pense penses pense pensons pensez pensent"],
    ["faire", "hacer", "les devoirs.", "fais fais fait faisons faites font"],
    ["prendre", "tomar, coger", "le bus.", "prends prends prend prenons prenez prennent"],
    ["dire", "decir", "la vérité.", "dis dis dit disons dites disent"],
    ["pouvoir", "poder", "venir.", "peux peux peut pouvons pouvez peuvent"],
    ["savoir", "saber", "la réponse.", "sais sais sait savons savez savent"],
    ["voir", "ver", "la mer.", "vois vois voit voyons voyez voient"],
    ["venir", "venir", "à la fête.", "viens viens vient venons venez viennent"],
    ["aimer", "amar, querer, gustar", "la musique.", "aime aimes aime aimons aimez aiment"],
    ["donner", "dar", "un cadeau.", "donne donnes donne donnons donnez donnent"],
    ["oublier", "olvidar", "un rendez-vous.", "oublie oublies oublie oublions oubliez oublient"],
    ["mettre", "poner", "un manteau.", "mets mets met mettons mettez mettent"],
    ["trouver", "encontrar", "une solution.", "trouve trouves trouve trouvons trouvez trouvent"],
    ["attendre", "esperar", "le bus.", "attends attends attend attendons attendez attendent"],
    ["essayer", "intentar, probar", "un nouveau restaurant.", "essaie essaies essaie essayons essayez essaient"],
    ["apprendre", "aprender, enseñar", "le français.", "apprends apprends apprend apprenons apprenez apprennent"],
    ["jouer", "jugar", "au tennis.", "joue joues joue jouons jouez jouent"],
    ["parler", "hablar", "français.", "parle parles parle parlons parlez parlent"],
    ["chercher", "buscar", "les clés.", "cherche cherches cherche cherchons cherchez cherchent"],
    ["sortir", "salir", "ce soir.", "sors sors sort sortons sortez sortent"],
    ["rire", "reír", "de bon cœur.", "ris ris rit rions riez rient"],
    ["vivre", "vivir", "à Paris.", "vis vis vit vivons vivez vivent"],
    ["comprendre", "comprender, entender", "la question.", "comprends comprends comprend comprenons comprenez comprennent"],
    ["croire", "creer", "à cette histoire.", "crois crois croit croyons croyez croient"],
  ] as const
).map(([inf, gloss, suffix, csv]) => {
  const all = forms(csv);
  const present = Object.fromEntries(Object.entries(all).filter(([, f]) => f !== "-")) as Partial<Record<FormKey, string>>;
  const alts = inf === "essayer" ? { je: ["essaye"], tu: ["essayes"], il: ["essaye"], ils: ["essayent"] } : undefined;
  return { inf, gloss, suffix, forms: present, alts };
});

// infinitive, type (reg | ger | cer), Spanish meanings, sentence ending
const ER: [string, "reg" | "ger" | "cer", string, string][] = [
  ["donner", "reg", "dar", "un cadeau à Marie."],
  ["passer", "reg", "pasar", "devant la boulangerie chaque matin."],
  ["chercher", "reg", "buscar", "les clés partout."],
  ["penser", "reg", "pensar", "que c'est une bonne idée."],
  ["écouter", "reg", "escuchar", "de la musique classique."],
  ["aimer", "reg", "amar, querer, gustar", "le chocolat noir."],
  ["arriver", "reg", "llegar", "toujours à l'heure."],
  ["entrer", "reg", "entrar", "dans la salle sans bruit."],
  ["cacher", "reg", "esconder, ocultar", "la vérité à tout le monde."],
  ["allonger", "ger", "alargar, estirar", "la jupe de deux centimètres."],
  ["aménager", "ger", "acondicionar, arreglar, adaptar", "le grenier en bureau."],
  ["arranger", "ger", "arreglar", "la situation avec calme."],
  ["avantager", "ger", "favorecer", "les plus expérimentés."],
  ["bouger", "ger", "mover, moverse", "à peine pendant le film."],
  ["changer", "ger", "cambiar", "d'avis à la dernière minute."],
  ["charger", "ger", "cargar", "les valises dans la voiture."],
  ["corriger", "ger", "corregir", "les fautes d'orthographe."],
  ["décourager", "ger", "desanimar", "les nouveaux élèves."],
  ["encourager", "ger", "animar, alentar", "les jeunes talents."],
  ["déranger", "ger", "molestar", "les voisins après minuit."],
  ["diriger", "ger", "dirigir", "une petite entreprise."],
  ["échanger", "ger", "intercambiar", "des cadeaux à Noël."],
  ["éponger", "ger", "secar, enjugar", "l'eau renversée sur la table."],
  ["juger", "ger", "juzgar", "un peu vite les autres."],
  ["longer", "ger", "bordear", "la rivière jusqu'au pont."],
  ["manger", "ger", "comer", "des pâtes tous les soirs."],
  ["mélanger", "ger", "mezclar", "les couleurs sur la palette."],
  ["nager", "ger", "nadar", "dans la mer en été."],
  ["obliger", "ger", "obligar", "tout le monde à porter un masque."],
  ["partager", "ger", "compartir", "un appartement avec des amis."],
  ["plonger", "ger", "zambullirse, bucear, sumergirse", "dans la piscine sans hésiter."],
  ["protéger", "ger", "proteger", "la nature autant que possible."],
  ["ranger", "ger", "ordenar, guardar", "la chambre le dimanche."],
  ["recharger", "ger", "recargar", "le téléphone toute la nuit."],
  ["ronger", "ger", "roer", "un os sous la table."],
  ["venger", "ger", "vengar", "les amis injustement accusés."],
  ["voyager", "ger", "viajar", "en train plutôt qu'en avion."],
  ["avancer", "cer", "avanzar", "lentement dans la file d'attente."],
  ["coincer", "cer", "atascar, atrapar", "la porte avec une chaise."],
  ["commencer", "cer", "empezar, comenzar", "le travail à huit heures."],
  ["enfoncer", "cer", "hundir, clavar", "le clou d'un seul coup."],
  ["financer", "cer", "financiar", "le projet à hauteur de mille euros."],
  ["foncer", "cer", "lanzarse, precipitarse", "tête baissée sans réfléchir."],
  ["forcer", "cer", "forzar", "un peu trop sur les exercices."],
  ["grimacer", "cer", "hacer muecas", "de douleur en se levant."],
  ["lancer", "cer", "lanzar", "le ballon vers le panier."],
  ["percer", "cer", "perforar, atravesar", "un trou dans le mur."],
  ["prononcer", "cer", "pronunciar", "ce mot difficilement."],
  ["saucer", "cer", "rebañar, mojar", "le fond de l'assiette avec du pain."],
  ["tracer", "cer", "trazar", "une ligne droite au tableau."],
];

function erForms(inf: string, type: "reg" | "ger" | "cer"): Record<FormKey, string> {
  if (inf === "protéger") return forms("protège protèges protège protégeons protégez protègent");
  const stem = inf.slice(0, -2);
  const nous = type === "ger" ? `${stem}eons` : type === "cer" ? `${stem.slice(0, -1)}çons` : `${stem}ons`;
  return { je: `${stem}e`, tu: `${stem}es`, il: `${stem}e`, nous, vous: `${stem}ez`, ils: `${stem}ent` };
}

const startsWithVowel = (s: string) => /^[aeiouyàâäéèêëîïôöûùüœh]/i.test(s);

// "Je ___ un café." (or "J'___" before a vowel) with the infinitive as cue.
function conjugationCards(verb: Verb, itemKeys: string[], withSuffix: boolean): SeedCard[] {
  return PERSONS.flatMap((person) => {
    const key = FORM_KEY[person];
    const answer = verb.forms[key];
    if (!answer) return [];
    const subject = person === "je" && startsWithVowel(answer) ? "J'" : `${SUBJECT[person]} `;
    return [
      {
        itemKeys,
        kind: "form" as const,
        prompt: `${subject}___${withSuffix ? ` ${verb.suffix}` : ""}`,
        cue: verb.inf,
        answer,
        accepted: [answer, ...(verb.alts?.[key] ?? [])],
      },
    ];
  });
}

const meaningCard = (key: string, gloss: string, answer: string): SeedCard => ({
  itemKeys: [key],
  kind: "meaning",
  prompt: gloss,
  answer,
  accepted: [answer],
});

const lemma = (key: string, gloss: string): SeedItem => ({ kind: "lemma", key, text: key, gloss });

const etre = ESSENTIAL.find((v) => v.inf === "être")!;
const avoir = ESSENTIAL.find((v) => v.inf === "avoir")!;
const ER_TYPE_ITEM = { reg: "present:er-regular", ger: "present:er-ger", cer: "present:er-cer" } as const;

export const FR_ES: StarterUnit = {
  baseLang: "es",
  targetLang: "fr",
  title: "Lo básico",
  description: "Pronombres y presente de los verbos más importantes.",
  lessons: [
    {
      title: "Pronombres sujeto",
      items: [
        ...PRONOUNS.map(([fr, es]) => lemma(fr, es)),
        { kind: "grammar", key: "pronouns:subject", text: "Pronoms sujets", gloss: "pronombres personales sujeto" },
      ],
      cards: PRONOUNS.map(([fr, es]) => ({ ...meaningCard(fr, es, fr), itemKeys: [fr, "pronouns:subject"] })),
    },
    {
      title: "Être",
      items: [
        lemma("être", etre.gloss),
        { kind: "grammar", key: "present:etre", text: "Présent : être", gloss: "presente de être (ser/estar)", notes: "suis, es, est, sommes, êtes, sont" },
      ],
      cards: [meaningCard("être", etre.gloss, "être"), ...conjugationCards(etre, ["être", "present:etre"], false)],
    },
    {
      title: "Avoir",
      items: [
        lemma("avoir", avoir.gloss),
        { kind: "grammar", key: "present:avoir", text: "Présent : avoir", gloss: "presente de avoir (tener/haber)", notes: "ai, as, a, avons, avez, ont" },
      ],
      cards: [meaningCard("avoir", avoir.gloss, "avoir"), ...conjugationCards(avoir, ["avoir", "present:avoir"], false)],
    },
    {
      title: "30 verbos esenciales",
      items: [
        ...ESSENTIAL.map((v) => lemma(v.inf, v.gloss)),
        { kind: "grammar", key: "present:irregular-common", text: "Présent : verbes irréguliers fréquents", gloss: "presente de los verbos irregulares más usados" },
      ],
      cards: ESSENTIAL.flatMap((v) => [
        meaningCard(v.inf, v.gloss, v.inf),
        ...conjugationCards(v, [v.inf, "present:irregular-common"], true),
      ]),
    },
    {
      title: "Verbos en -er",
      items: [
        ...ER.map(([inf, , gloss]) => lemma(inf, gloss)),
        { kind: "grammar", key: "present:er-regular", text: "Présent : verbes en -er", gloss: "presente de los verbos regulares en -er", notes: "-e, -es, -e, -ons, -ez, -ent" },
        { kind: "grammar", key: "present:er-ger", text: "Présent : verbes en -ger", gloss: "verbos en -ger: nous mangeons", notes: "nous + -eons" },
        { kind: "grammar", key: "present:er-cer", text: "Présent : verbes en -cer", gloss: "verbos en -cer: nous commençons", notes: "c → ç antes de -ons" },
      ],
      cards: ER.flatMap(([inf, type, gloss, suffix]) => [
        meaningCard(inf, gloss, inf),
        ...conjugationCards({ inf, gloss, suffix, forms: erForms(inf, type) }, [inf, ER_TYPE_ITEM[type]], true),
      ]),
    },
  ],
};
