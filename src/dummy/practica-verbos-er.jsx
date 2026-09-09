import React, { useState, useEffect, useCallback, useRef } from "react";
import { ArrowLeft, RotateCcw, Flame, CheckCircle2, XCircle } from "lucide-react";

/* ------------------------------------------------------------------ */
/* Datos de los verbos                                                 */
/* Cada fila: [infinitivo, tipo, empiezaConVocal, español, alternativas*/
/* separadas por coma, resto de la frase de ejemplo (sin el sujeto)]   */
/* tipo: "reg" (regular), "ger" (-ger, nasaliza con -eons),             */
/*        "cer" (-cer, ç antes de -ons)                                */
/* ------------------------------------------------------------------ */

const ROWS = [
  ["donner", "reg", 0, "dar", "dar", "un cadeau à Marie."],
  ["passer", "reg", 0, "pasar", "pasar", "devant la boulangerie chaque matin."],
  ["chercher", "reg", 0, "buscar", "buscar", "les clés partout."],
  ["penser", "reg", 0, "pensar", "pensar", "que c'est une bonne idée."],
  ["écouter", "reg", 1, "escuchar", "escuchar", "de la musique classique."],
  ["aimer", "reg", 1, "amar", "amar,querer,gustar", "le chocolat noir."],
  ["arriver", "reg", 1, "llegar", "llegar", "toujours à l'heure."],
  ["entrer", "reg", 1, "entrar", "entrar", "dans la salle sans bruit."],
  ["cacher", "reg", 0, "esconder", "esconder,ocultar", "la vérité à tout le monde."],

  ["allonger", "ger", 1, "alargar", "alargar,estirar", "la jupe de deux centimètres."],
  ["aménager", "ger", 1, "acondicionar", "acondicionar,arreglar,adaptar", "le grenier en bureau."],
  ["arranger", "ger", 1, "arreglar", "arreglar", "la situation avec calme."],
  ["avantager", "ger", 1, "favorecer", "favorecer", "les plus expérimentés."],
  ["bouger", "ger", 0, "mover", "mover,moverse", "à peine pendant le film."],
  ["changer", "ger", 0, "cambiar", "cambiar", "d'avis à la dernière minute."],
  ["charger", "ger", 0, "cargar", "cargar", "les valises dans la voiture."],
  ["corriger", "ger", 0, "corregir", "corregir", "les fautes d'orthographe."],
  ["décourager", "ger", 0, "desanimar", "desanimar", "les nouveaux élèves."],
  ["encourager", "ger", 1, "animar", "animar,alentar", "les jeunes talents."],
  ["déranger", "ger", 0, "molestar", "molestar", "les voisins après minuit."],
  ["diriger", "ger", 0, "dirigir", "dirigir", "une petite entreprise."],
  ["échanger", "ger", 1, "intercambiar", "intercambiar", "des cadeaux à Noël."],
  ["éponger", "ger", 1, "secar", "secar,enjugar", "l'eau renversée sur la table."],
  ["juger", "ger", 0, "juzgar", "juzgar", "un peu vite les autres."],
  ["longer", "ger", 0, "bordear", "bordear", "la rivière jusqu'au pont."],
  ["manger", "ger", 0, "comer", "comer", "des pâtes tous les soirs."],
  ["mélanger", "ger", 0, "mezclar", "mezclar", "les couleurs sur la palette."],
  ["nager", "ger", 0, "nadar", "nadar", "dans la mer en été."],
  ["obliger", "ger", 1, "obligar", "obligar", "tout le monde à porter un masque."],
  ["partager", "ger", 0, "compartir", "compartir", "un appartement avec des amis."],
  ["plonger", "ger", 0, "zambullirse", "zambullirse,bucear,sumergirse", "dans la piscine sans hésiter."],
  ["protéger", "ger", 0, "proteger", "proteger", "la nature autant que possible."],
  ["ranger", "ger", 0, "ordenar", "ordenar,guardar", "la chambre le dimanche."],
  ["recharger", "ger", 0, "recargar", "recargar", "le téléphone toute la nuit."],
  ["ronger", "ger", 0, "roer", "roer", "un os sous la table."],
  ["venger", "ger", 0, "vengar", "vengar", "les amis injustement accusés."],
  ["voyager", "ger", 0, "viajar", "viajar", "en train plutôt qu'en avion."],

  ["avancer", "cer", 1, "avanzar", "avanzar", "lentement dans la file d'attente."],
  ["coincer", "cer", 0, "atascar", "atascar,atrapar", "la porte avec une chaise."],
  ["commencer", "cer", 0, "empezar", "empezar,comenzar", "le travail à huit heures."],
  ["enfoncer", "cer", 1, "hundir", "hundir,clavar", "le clou d'un seul coup."],
  ["financer", "cer", 0, "financiar", "financiar", "le projet à hauteur de mille euros."],
  ["foncer", "cer", 0, "lanzarse", "lanzarse,precipitarse", "tête baissée sans réfléchir."],
  ["forcer", "cer", 0, "forzar", "forzar", "un peu trop sur les exercices."],
  ["grimacer", "cer", 0, "hacer muecas", "hacer muecas", "de douleur en se levant."],
  ["lancer", "cer", 0, "lanzar", "lanzar", "le ballon vers le panier."],
  ["percer", "cer", 0, "perforar", "perforar,atravesar", "un trou dans le mur."],
  ["prononcer", "cer", 0, "pronunciar", "pronunciar", "ce mot difficilement."],
  ["saucer", "cer", 0, "rebañar", "rebañar,mojar", "le fond de l'assiette avec du pain."],
  ["tracer", "cer", 0, "trazar", "trazar", "une ligne droite au tableau."],
];

const VERBS = ROWS.map(([inf, type, vowelStart, es, altsCsv, suffix]) => ({
  inf,
  type,
  vowelStart: !!vowelStart,
  es,
  esAlts: altsCsv.split(",").map((s) => s.trim()),
  suffix: " " + suffix,
}));

function getForms(v) {
  if (v.inf === "protéger") {
    return { je: "protège", tu: "protèges", il: "protège", nous: "protégeons", vous: "protégez", ils: "protègent" };
  }
  const stem = v.inf.slice(0, -2);
  if (v.type === "ger") {
    return { je: stem + "e", tu: stem + "es", il: stem + "e", nous: stem + "eons", vous: stem + "ez", ils: stem + "ent" };
  }
  if (v.type === "cer") {
    return {
      je: stem + "e", tu: stem + "es", il: stem + "e",
      nous: stem.slice(0, -1) + "ç" + "ons", vous: stem + "ez", ils: stem + "ent",
    };
  }
  return { je: stem + "e", tu: stem + "es", il: stem + "e", nous: stem + "ons", vous: stem + "ez", ils: stem + "ent" };
}

const PRONOUNS = ["je", "tu", "il", "elle", "on", "nous", "vous", "ils", "elles"];
const FORM_KEY = { je: "je", tu: "tu", il: "il", elle: "il", on: "il", nous: "nous", vous: "vous", ils: "ils", elles: "ils" };
const SUBJECT_LABEL = { je: "Je", tu: "Tu", il: "Il", elle: "Elle", on: "On", nous: "Nous", vous: "Vous", ils: "Ils", elles: "Elles" };

function subjectPrefix(pronoun, vowelStart) {
  if (pronoun === "je" && vowelStart) return "J’";
  return SUBJECT_LABEL[pronoun] + " ";
}

const CLASS_INFO = {
  1: { label: "Lección 1", title: "Significado", subtitle: "Español → francés", instruction: "Escribe el infinitivo en francés." },
  2: { label: "Lección 2", title: "Significado", subtitle: "Francés → español", instruction: "Escribe el significado en español." },
  3: { label: "Lección final", title: "Conjugación", subtitle: "presente, en frases", instruction: "Completa la frase con la forma correcta del verbo." },
};

function normalize(s) {
  return (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ------------------------------------------------------------------ */
/* Bancos de tareas                                                    */
/* ------------------------------------------------------------------ */

function getPool(lessonNum) {
  if (lessonNum === 1) {
    return VERBS.map((v) => ({ id: `l1-${v.inf}`, verb: v, prompt: v.es, answer: v.inf }));
  }
  if (lessonNum === 2) {
    return VERBS.map((v) => ({ id: `l2-${v.inf}`, verb: v, prompt: v.inf, answer: v.es, answerAlts: v.esAlts }));
  }
  const pool = [];
  for (const v of VERBS) {
    const forms = getForms(v);
    for (const pronoun of PRONOUNS) {
      pool.push({ id: `l3-${v.inf}-${pronoun}`, verb: v, pronoun, answer: forms[FORM_KEY[pronoun]] });
    }
  }
  return pool;
}

function buildOptions(task, lessonNum) {
  let pool;
  if (lessonNum === 1) pool = VERBS.map((v) => v.inf);
  else if (lessonNum === 2) pool = VERBS.map((v) => v.es);
  else pool = Object.values(getForms(task.verb));

  const wrongCandidates = [...new Set(pool)].filter((a) => normalize(a) !== normalize(task.answer));
  const wrongs = shuffle(wrongCandidates).slice(0, 3);
  return shuffle([task.answer, ...wrongs]);
}

function pickTask(pool, errorCounts, lastId) {
  const weights = pool.map((t) => 1 + (errorCounts[t.id] || 0) * 4);
  for (let attempt = 0; attempt < 6; attempt++) {
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    let idx = 0;
    for (; idx < pool.length; idx++) {
      if (r < weights[idx]) break;
      r -= weights[idx];
    }
    const picked = pool[Math.min(idx, pool.length - 1)];
    if (picked.id !== lastId || pool.length === 1) return picked;
  }
  return pool[0];
}

function isCorrectAnswer(task, raw, lessonNum) {
  if (lessonNum === 2) return task.answerAlts.some((a) => normalize(a) === normalize(raw));
  return normalize(task.answer) === normalize(raw);
}

/* ------------------------------------------------------------------ */
/* Papel de cuaderno francés — solo clases nucleares de Tailwind;      */
/* cualquier color/sombra personalizado va como estilo en línea.       */
/* ------------------------------------------------------------------ */

const PAPER_BG = {
  backgroundColor: "#F8F4E8",
  backgroundImage: "repeating-linear-gradient(#F8F4E8 0px, #F8F4E8 31px, #C9D9E8 32px)",
  backgroundPosition: "0 8px",
  minHeight: 640,
};
const shadowSm = (hex) => ({ boxShadow: `3px 3px 0 ${hex}` });

function FontImport() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Caveat:wght@500;700&family=Inter:wght@400;500;600;700&display=swap');
      .font-hand { font-family: 'Caveat', cursive; }
      .font-body { font-family: 'Inter', system-ui, sans-serif; }
      @keyframes stampIn {
        0% { opacity: 0; transform: scale(2.2) rotate(-14deg); }
        55% { opacity: 1; transform: scale(0.92) rotate(-8deg); }
        75% { transform: scale(1.05) rotate(-10deg); }
        100% { opacity: 1; transform: scale(1) rotate(-8deg); }
      }
      .stamp { animation: stampIn 0.42s ease-out; }
      @keyframes cardIn {
        0% { opacity: 0; transform: translateY(10px); }
        100% { opacity: 1; transform: translateY(0); }
      }
      .card-in { animation: cardIn 0.3s ease-out; }
    `}</style>
  );
}

/* ------------------------------------------------------------------ */
/* Componente principal                                                */
/* ------------------------------------------------------------------ */

export default function FrenchErVerbsGame() {
  const [screen, setScreen] = useState("menu");
  const [selectedClass, setSelectedClass] = useState(1);
  const [difficulty, setDifficulty] = useState("easy");

  const [errorCounts, setErrorCounts] = useState({});
  const [currentTask, setCurrentTask] = useState(null);
  const [options, setOptions] = useState([]);
  const [typedAnswer, setTypedAnswer] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [streak, setStreak] = useState(0);
  const lastTaskId = useRef(null);
  const inputRef = useRef(null);

  const nextTask = useCallback(
    (classNum, diff) => {
      const pool = getPool(classNum);
      const task = pickTask(pool, errorCounts, lastTaskId.current);
      lastTaskId.current = task.id;
      setCurrentTask(task);
      setFeedback(null);
      setTypedAnswer("");
      if (diff === "easy") setOptions(buildOptions(task, classNum));
    },
    [errorCounts]
  );

  function startGame() {
    setScore({ correct: 0, total: 0 });
    setStreak(0);
    lastTaskId.current = null;
    setScreen("game");
    nextTask(selectedClass, difficulty);
  }

  function backToMenu() {
    setScreen("menu");
    setFeedback(null);
  }

  const submitAnswer = useCallback(
    (rawAnswer) => {
      if (!currentTask || feedback) return;
      const isCorrect = isCorrectAnswer(currentTask, rawAnswer, selectedClass);
      setScore((s) => ({ correct: s.correct + (isCorrect ? 1 : 0), total: s.total + 1 }));
      if (isCorrect) {
        setStreak((s) => s + 1);
      } else {
        setStreak(0);
        setErrorCounts((ec) => ({ ...ec, [currentTask.id]: (ec[currentTask.id] || 0) + 1 }));
      }
      setFeedback({ correct: isCorrect, correctAnswer: currentTask.answer });
    },
    [currentTask, feedback, selectedClass]
  );

  // Enter para escribir más rápido: envía la respuesta, y si ya hay
  // feedback, Enter pasa directamente a la siguiente tarea.
  useEffect(() => {
    if (screen !== "game" || difficulty !== "hard") return;
    function onKeyDown(e) {
      if (e.key !== "Enter") return;
      e.preventDefault();
      if (feedback) nextTask(selectedClass, difficulty);
      else if (typedAnswer.trim()) submitAnswer(typedAnswer);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [screen, difficulty, feedback, typedAnswer, selectedClass, submitAnswer, nextTask]);

  useEffect(() => {
    if (screen === "game" && difficulty === "hard" && inputRef.current && !feedback) {
      inputRef.current.focus();
    }
  }, [screen, difficulty, feedback, currentTask]);

  const info = CLASS_INFO[selectedClass];
  const accuracy = score.total ? Math.round((score.correct / score.total) * 100) : null;

  /* ---------------------------- MENU ---------------------------- */
  if (screen === "menu") {
    return (
      <div className="w-full font-body" style={PAPER_BG}>
        <FontImport />
        <div className="relative mx-auto max-w-2xl px-8 py-10 pl-16">
          <div className="absolute left-10 top-0 bottom-0 w-px" style={{ backgroundColor: "#D14D4D" }} />

          <header className="mb-8">
            <p className="font-hand text-xl text-blue-800 -mb-2">le cahier de</p>
            <h1 className="font-hand text-6xl font-bold text-blue-900 leading-none">Verbes en -er</h1>
            <p className="mt-2 text-xs tracking-wide text-stone-500 uppercase">
              Significado y conjugación · 50 verbos
            </p>
          </header>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            {[1, 2, 3].map((n) => {
              const c = CLASS_INFO[n];
              const active = selectedClass === n;
              const errs = getPool(n).reduce((sum, t) => sum + (errorCounts[t.id] || 0), 0);
              return (
                <button
                  key={n}
                  onClick={() => setSelectedClass(n)}
                  className={`text-left rounded-sm border-2 px-4 py-3 transition-all ${
                    active ? "border-blue-900 bg-white" : "border-stone-300 bg-stone-50 hover:bg-white"
                  }`}
                  style={active ? shadowSm("#1B3A6B") : undefined}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 font-hand text-lg font-bold ${
                        active ? "border-red-600 text-red-600" : "border-stone-400 text-stone-500"
                      }`}
                    >
                      {n}
                    </span>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-stone-500">{c.label}</p>
                      <p className="font-hand text-2xl leading-none text-blue-900">{c.title}</p>
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-stone-600">{c.subtitle}</p>
                  {errs > 0 && (
                    <p className="mt-1 text-xs text-red-600">
                      {errs} error{errs > 1 ? "es" : ""} registrado{errs > 1 ? "s" : ""}
                    </p>
                  )}
                </button>
              );
            })}
          </div>

          <div className="mb-8">
            <p className="text-xs uppercase tracking-wide text-stone-500 mb-2">Modo</p>
            <div className="inline-flex rounded-sm border-2 border-blue-900 overflow-hidden">
              {[
                { key: "easy", label: "Fácil · opción múltiple" },
                { key: "hard", label: "Difícil · escribir" },
              ].map((m) => (
                <button
                  key={m.key}
                  onClick={() => setDifficulty(m.key)}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    difficulty === m.key ? "bg-blue-900 text-white" : "bg-white text-blue-900 hover:bg-blue-50"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={startGame}
            className="font-hand text-2xl font-bold rounded-sm bg-red-600 text-white px-8 py-3 hover:-translate-y-0.5 active:translate-y-0 transition-all"
            style={shadowSm("#7d2116")}
          >
            Empezar →
          </button>

          <p className="mt-8 text-xs text-stone-500 leading-relaxed max-w-md">
            Las lecciones 1 y 2 practican el significado (español↔francés). La
            lección final conjuga los 50 verbos en presente dentro de frases —
            incluye los verbos en -ger y -cer, que cambian de ortografía en la
            forma "nous". Las tareas que más fallas vuelven a aparecer más
            seguido. En modo difícil, Enter envía y Enter otra vez avanza.
          </p>
        </div>
      </div>
    );
  }

  /* ---------------------------- JUEGO ---------------------------- */
  const isConjugation = selectedClass === 3;

  return (
    <div className="w-full font-body" style={PAPER_BG}>
      <FontImport />
      <div className="relative mx-auto max-w-2xl px-8 py-8 pl-16">
        <div className="absolute left-10 top-0 bottom-0 w-px" style={{ backgroundColor: "#D14D4D" }} />

        <div className="flex items-center justify-between mb-6">
          <button onClick={backToMenu} className="flex items-center gap-1 text-sm text-blue-900 hover:underline">
            <ArrowLeft size={16} /> Menú
          </button>
          <div className="flex items-center gap-4 text-sm text-stone-600">
            <span className="flex items-center gap-1">
              <Flame size={15} className={streak > 0 ? "text-red-600" : "text-stone-300"} />
              {streak}
            </span>
            <span>
              {score.correct}/{score.total}
              {accuracy !== null && <span className="text-stone-500"> · {accuracy}%</span>}
            </span>
          </div>
        </div>

        <p className="text-xs uppercase tracking-wide text-stone-500">
          {info.label} · {info.title}
        </p>
        <p className="text-sm text-stone-600 mb-6">{info.instruction}</p>

        {currentTask && (
          <div
            key={currentTask.id}
            className="card-in relative bg-white rounded-sm border-2 border-blue-900 px-8 py-10 mb-6 text-center"
            style={{ boxShadow: "4px 4px 0 rgba(27,58,107,0.25)" }}
          >
            {!isConjugation && (
              <>
                <p className="text-xs uppercase tracking-widest text-stone-500 mb-3">
                  {selectedClass === 1 ? "significado en español" : "infinitivo en francés"}
                </p>
                <p className="font-hand text-5xl font-bold text-blue-900">{currentTask.prompt}</p>
              </>
            )}

            {isConjugation && (
              <>
                <p className="text-xs uppercase tracking-widest text-stone-500 mb-3">completa la frase</p>
                <p className="font-hand text-3xl font-bold text-blue-900 leading-snug">
                  {subjectPrefix(currentTask.pronoun, currentTask.verb.vowelStart)}
                  <span className="inline-block border-b-2 border-blue-900 px-1">_____</span>
                  {currentTask.verb.suffix}
                </p>
                <p className="mt-3 inline-block rounded-sm bg-blue-900 text-white text-sm px-3 py-1 font-body">
                  {currentTask.verb.inf}
                </p>
              </>
            )}

            {feedback && (
              <div
                className={`stamp absolute -right-3 -top-3 -rotate-6 rounded border-4 px-4 py-1 font-hand text-2xl font-bold uppercase tracking-wide ${
                  feedback.correct ? "border-green-600 text-green-700" : "border-red-600 text-red-700"
                }`}
                style={{ background: "rgba(255,255,255,0.9)" }}
              >
                {feedback.correct ? "¡Bien!" : "Falta"}
              </div>
            )}
          </div>
        )}

        {difficulty === "easy" && currentTask && (
          <div className="grid grid-cols-2 gap-3 mb-6">
            {options.map((opt) => {
              const isCorrectOpt = feedback && normalize(opt) === normalize(currentTask.answer);
              const isPickedWrong = feedback && !feedback.correct && normalize(opt) === normalize(typedAnswer);
              return (
                <button
                  key={opt}
                  disabled={!!feedback}
                  onClick={() => {
                    setTypedAnswer(opt);
                    submitAnswer(opt);
                  }}
                  className={`font-body text-lg rounded-sm border-2 px-4 py-3 transition-all ${
                    isCorrectOpt
                      ? "border-green-600 bg-green-50 text-green-700"
                      : isPickedWrong
                      ? "border-red-600 bg-red-50 text-red-700"
                      : "border-stone-300 bg-white hover:border-blue-900 hover:bg-blue-50 text-stone-800"
                  } ${feedback ? "cursor-default" : "cursor-pointer"}`}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        )}

        {difficulty === "hard" && currentTask && (
          <div className="mb-6">
            <input
              ref={inputRef}
              type="text"
              value={typedAnswer}
              disabled={!!feedback}
              onChange={(e) => setTypedAnswer(e.target.value)}
              placeholder="Escribe tu respuesta y pulsa Enter…"
              className="w-full font-hand text-3xl bg-transparent border-b-2 border-blue-900 focus:outline-none focus:border-red-600 px-2 py-2 text-blue-900 placeholder:text-stone-400 placeholder:font-body placeholder:text-base"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck="false"
            />
            {feedback && !feedback.correct && (
              <p className="mt-2 text-sm text-stone-600">
                Respuesta correcta: <span className="font-hand text-xl text-green-700">{feedback.correctAnswer}</span>
              </p>
            )}
          </div>
        )}

        <div className="flex items-center gap-3">
          {difficulty === "hard" && !feedback && (
            <button
              onClick={() => submitAnswer(typedAnswer)}
              className="font-hand text-xl font-bold rounded-sm bg-blue-900 text-white px-6 py-2 hover:-translate-y-0.5 transition-all"
              style={shadowSm("#0e2340")}
            >
              Comprobar
            </button>
          )}
          {feedback && (
            <button
              onClick={() => nextTask(selectedClass, difficulty)}
              autoFocus
              className="font-hand text-xl font-bold rounded-sm bg-red-600 text-white px-6 py-2 hover:-translate-y-0.5 transition-all"
              style={shadowSm("#7d2116")}
            >
              Siguiente →
            </button>
          )}
          {feedback && (
            <span className={`flex items-center gap-1 text-sm ${feedback.correct ? "text-green-700" : "text-red-700"}`}>
              {feedback.correct ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
              {feedback.correct ? "Correcto" : `Era: ${feedback.correctAnswer}`}
            </span>
          )}
        </div>

        <button
          onClick={() => setErrorCounts({})}
          className="mt-10 flex items-center gap-1 text-xs text-stone-500 hover:text-stone-700"
        >
          <RotateCcw size={12} /> Reiniciar estadísticas de errores
        </button>
      </div>
    </div>
  );
}
