import React, { useState, useEffect, useCallback, useRef } from "react";
import { ArrowLeft, RotateCcw, Flame, CheckCircle2, XCircle } from "lucide-react";

/* ------------------------------------------------------------------ */
/* Datos lingüísticos                                                  */
/* ------------------------------------------------------------------ */

const PAIRS = [
  { es: "yo", fr: "je" },
  { es: "tú", fr: "tu" },
  { es: "él", fr: "il" },
  { es: "ella", fr: "elle" },
  { es: "nosotros", fr: "nous" },
  { es: "vosotros", fr: "vous" },
  { es: "ellos", fr: "ils" },
  { es: "ellas", fr: "elles" },
];

const FR_PRONOUNS = ["je", "tu", "il", "elle", "on", "nous", "vous", "ils", "elles"];

const ETRE = {
  je: "suis", tu: "es", il: "est", elle: "est", on: "est",
  nous: "sommes", vous: "êtes", ils: "sont", elles: "sont",
};
const AVOIR = {
  je: "ai", tu: "as", il: "a", elle: "a", on: "a",
  nous: "avons", vous: "avez", ils: "ont", elles: "ont",
};

const CLASS_INFO = {
  1: {
    label: "Lección 1",
    title: "Pronombres",
    subtitle: "Español → francés",
    instruction: "Escribe el pronombre en francés que corresponde.",
  },
  2: {
    label: "Lección 2",
    title: "Être",
    subtitle: "conjugación de ser/estar",
    instruction: "Escribe la forma correcta de être para este pronombre.",
  },
  3: {
    label: "Lección 3",
    title: "Avoir",
    subtitle: "conjugación de tener",
    instruction: "Escribe la forma correcta de avoir para este pronombre.",
  },
  4: {
    label: "Lección final",
    title: "Être o avoir",
    subtitle: "nivel combinado",
    instruction: "Se indica el verbo pedido: escribe la forma correcta.",
  },
};

function getTaskPool(classNum) {
  if (classNum === 1) {
    return PAIRS.map((p) => ({ id: `c1-${p.es}`, prompt: p.es, answer: p.fr }));
  }
  if (classNum === 2) {
    return FR_PRONOUNS.map((p) => ({ id: `c2-${p}`, prompt: p, answer: ETRE[p] }));
  }
  if (classNum === 3) {
    return FR_PRONOUNS.map((p) => ({ id: `c3-${p}`, prompt: p, answer: AVOIR[p] }));
  }
  return FR_PRONOUNS.flatMap((p) =>
    ["être", "avoir"].map((v) => ({
      id: `c4-${p}-${v}`,
      prompt: p,
      verb: v,
      answer: v === "être" ? ETRE[p] : AVOIR[p],
    }))
  );
}

const DISTRACTOR_POOL = {
  1: PAIRS.map((p) => p.fr),
  2: [...new Set(Object.values(ETRE))],
  3: [...new Set(Object.values(AVOIR))],
  4: [...new Set([...Object.values(ETRE), ...Object.values(AVOIR)])],
};

function normalize(s) {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildOptions(task, classNum) {
  const pool = DISTRACTOR_POOL[classNum].filter((a) => normalize(a) !== normalize(task.answer));
  const wrongs = shuffle(pool).slice(0, 3);
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

/* ------------------------------------------------------------------ */
/* Papel de cuaderno francés — fondo e importación de fuente           */
/* Nota: solo se usan clases nucleares de Tailwind en className;       */
/* cualquier color/sombra personalizado va como estilo en línea,       */
/* porque este entorno no compila clases arbitrarias tipo bg-[#..].    */
/* ------------------------------------------------------------------ */

const PAPER_BG = {
  backgroundColor: "#F8F4E8",
  backgroundImage: "repeating-linear-gradient(#F8F4E8 0px, #F8F4E8 31px, #C9D9E8 32px)",
  backgroundPosition: "0 8px",
  minHeight: 640,
};

const shadowSm = (hex) => ({ boxShadow: `3px 3px 0 ${hex}` });
const shadowMd = (hex) => ({ boxShadow: `4px 4px 0 ${hex}` });

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

export default function FrenchVerbGame() {
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
      const pool = getTaskPool(classNum);
      const task = pickTask(pool, errorCounts, lastTaskId.current);
      lastTaskId.current = task.id;
      setCurrentTask(task);
      setFeedback(null);
      setTypedAnswer("");
      if (diff === "easy") {
        setOptions(buildOptions(task, classNum));
      }
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
      const isCorrect = normalize(rawAnswer) === normalize(currentTask.answer);
      setScore((s) => ({ correct: s.correct + (isCorrect ? 1 : 0), total: s.total + 1 }));
      if (isCorrect) {
        setStreak((s) => s + 1);
      } else {
        setStreak(0);
        setErrorCounts((ec) => ({ ...ec, [currentTask.id]: (ec[currentTask.id] || 0) + 1 }));
      }
      setFeedback({ correct: isCorrect, correctAnswer: currentTask.answer });
    },
    [currentTask, feedback]
  );

  // Enter para escribir más rápido: si hay respuesta escrita, la envía;
  // si ya hay feedback (correcto o no), Enter pasa a la siguiente tarea.
  useEffect(() => {
    if (screen !== "game" || difficulty !== "hard") return;
    function onKeyDown(e) {
      if (e.key !== "Enter") return;
      e.preventDefault();
      if (feedback) {
        nextTask(selectedClass, difficulty);
      } else if (typedAnswer.trim()) {
        submitAnswer(typedAnswer);
      }
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
            <h1 className="font-hand text-6xl font-bold text-blue-900 leading-none">
              Être &amp; Avoir
            </h1>
            <p className="mt-2 text-xs tracking-wide text-stone-500 uppercase">
              Práctica de conjugación · presente
            </p>
          </header>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
            {[1, 2, 3, 4].map((n) => {
              const c = CLASS_INFO[n];
              const active = selectedClass === n;
              const errs = getTaskPool(n).reduce((sum, t) => sum + (errorCounts[t.id] || 0), 0);
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
            Las tareas aparecen al azar dentro de la lección elegida. Las que más
            fallas aparecerán con más frecuencia, hasta que las domines. En modo
            difícil, pulsa Enter para enviar y Enter otra vez para pasar a la
            siguiente.
          </p>
        </div>
      </div>
    );
  }

  /* ---------------------------- JUEGO ---------------------------- */
  return (
    <div className="w-full font-body" style={PAPER_BG}>
      <FontImport />
      <div className="relative mx-auto max-w-2xl px-8 py-8 pl-16">
        <div className="absolute left-10 top-0 bottom-0 w-px" style={{ backgroundColor: "#D14D4D" }} />

        {/* barra superior */}
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

        {/* tarjeta de la tarea */}
        {currentTask && (
          <div
            key={currentTask.id}
            className="card-in relative bg-white rounded-sm border-2 border-blue-900 px-8 py-10 mb-6 text-center"
            style={{ boxShadow: "4px 4px 0 rgba(27,58,107,0.25)" }}
          >
            <p className="text-xs uppercase tracking-widest text-stone-500 mb-3">
              {selectedClass === 1 ? "pronombre en español" : "pronombre francés"}
              {selectedClass === 4 ? "  ·  verbo pedido" : ""}
            </p>
            <p className="font-hand text-6xl font-bold text-blue-900">{currentTask.prompt}</p>
            {selectedClass === 4 && (
              <p className="mt-2 inline-block rounded-sm bg-blue-900 text-white text-sm px-3 py-1 font-body">
                {currentTask.verb}
              </p>
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

        {/* modo fácil: opción múltiple */}
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

        {/* modo difícil: escribir (Enter para enviar / avanzar) */}
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

        {/* acciones */}
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
