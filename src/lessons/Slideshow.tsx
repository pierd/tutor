import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Pause, Play, SkipBack, SkipForward } from "lucide-react";

// Shared engine of the passive modes: shows slides one after another in a
// shuffled loop until paused, keeping the screen on. Passive modes are for
// glancing at, so they never record evidence.

export type Speed = "slow" | "normal" | "fast";
const SPEED_OPTIONS: Speed[] = ["slow", "normal", "fast"];

function shuffled<T>(items: T[]) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Starts something the slide must wait for (e.g. audio) and returns a cleanup.
export type WaitFor = (done: () => void) => () => void;

export function Slideshow<T extends { _id: string }>({
  slides,
  phases = 1,
  duration,
  waitFor,
  restartKey,
  settings,
  empty,
  render,
}: {
  // May update while playing (e.g. live query); the shuffled order is kept.
  slides: T[] | null | undefined;
  // Steps within a slide, e.g. prompt then answer.
  phases?: number;
  duration: (slide: T, phase: number, speed: Speed) => number;
  waitFor?: (slide: T, phase: number) => WaitFor | null;
  // Changing it restarts the current step (e.g. a setting that affects it).
  restartKey?: unknown;
  settings?: ReactNode;
  empty: ReactNode;
  render: (slide: T, phase: number) => ReactNode;
}) {
  const { t } = useTranslation();
  const [order, setOrder] = useState<string[] | null>(null);
  const [orderedSlides, setOrderedSlides] = useState<T[] | null>(null);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState(0);
  // Bumped on every move so a one-slide loop still restarts its timer.
  const [tick, setTick] = useState(0);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState<Speed>("normal");

  // Keep the order across updates: drop removed slides, append new ones.
  if (slides && slides !== orderedSlides) {
    const ids = slides.map((s) => s._id);
    const current = new Set(ids);
    const known = new Set(order ?? []);
    setOrderedSlides(slides);
    setOrder(
      order === null
        ? shuffled(ids)
        : [...order.filter((id) => current.has(id)), ...ids.filter((id) => !known.has(id))],
    );
  }

  const byId = new Map((slides ?? []).map((s) => [s._id, s]));
  const position = order && order.length > 0 ? Math.min(index, order.length - 1) : 0;
  const slide = order ? byId.get(order[position]) : undefined;

  // Timers call these, so they read the latest state through refs.
  const latest = useRef({ order, position, phase, duration, waitFor });
  useLayoutEffect(() => {
    latest.current = { order, position, phase, duration, waitFor };
  });

  const next = () => {
    const { order: o, position: i } = latest.current;
    if (!o) return;
    if (i + 1 >= o.length) {
      setOrder(shuffled(o));
      setIndex(0);
    } else {
      setIndex(i + 1);
    }
    setPhase(0);
    setTick((n) => n + 1);
  };
  const previous = () => {
    setIndex(Math.max(0, latest.current.position - 1));
    setPhase(phases - 1);
    setTick((n) => n + 1);
  };

  // Moves on once the step's time is up and whatever it waits for is done.
  useEffect(() => {
    if (!slide || paused) return;
    let cancelled = false;
    let timeUp = false;
    let waited = false;
    const advance = () => {
      if (cancelled || !timeUp || !waited) return;
      if (latest.current.phase + 1 < phases) setPhase((p) => p + 1);
      else next();
    };
    const timer = setTimeout(() => {
      timeUp = true;
      advance();
    }, latest.current.duration(slide, phase, speed));
    const start = latest.current.waitFor?.(slide, phase);
    const stop = start?.(() => {
      waited = true;
      advance();
    });
    if (!start) waited = true;
    return () => {
      cancelled = true;
      clearTimeout(timer);
      stop?.();
    };
    // `slide` is tracked by id: live updates to its content don't restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slide?._id, phase, tick, paused, speed, restartKey]);

  // Keep the screen on while playing.
  useEffect(() => {
    if (paused || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = () => {
      if (document.visibilityState !== "visible") return;
      navigator.wakeLock
        .request("screen")
        .then((l) => (cancelled ? void l.release() : (lock = l)))
        .catch(() => {});
    };
    acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", acquire);
      void lock?.release();
    };
  }, [paused]);

  if (!slides || order === null) return null;
  if (!slide) return <>{empty}</>;

  const button = "rounded-lg p-2 text-gray-600 hover:bg-gray-100";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-gray-500">
        <span>
          {position + 1} / {order.length}
        </span>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2">
            {t("passive.speed")}
            <select
              value={speed}
              onChange={(e) => setSpeed(e.target.value as Speed)}
              className="rounded border border-gray-300 bg-white px-2 py-1"
            >
              {SPEED_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {t(`passive.speeds.${s}`)}
                </option>
              ))}
            </select>
          </label>
          {settings}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="h-1 bg-gray-100">
          {!paused && (
            <div
              key={`${tick}-${phase}-${speed}-${String(restartKey)}`}
              className="h-1 bg-gray-300"
              style={{ animation: `slideshow-progress ${duration(slide, phase, speed)}ms linear forwards` }}
            />
          )}
        </div>
        <div className="flex min-h-64 flex-col justify-center gap-6 p-8">{render(slide, phase)}</div>
      </div>

      <div className="flex items-center justify-center gap-2">
        <button
          onClick={previous}
          disabled={position === 0}
          className={`${button} disabled:opacity-40`}
          aria-label={t("passive.previous")}
          title={t("passive.previous")}
        >
          <SkipBack size={20} />
        </button>
        <button
          onClick={() => setPaused((p) => !p)}
          className="rounded-full bg-gray-900 p-3 text-white hover:bg-gray-800"
          aria-label={paused ? t("passive.play") : t("passive.pause")}
          title={paused ? t("passive.play") : t("passive.pause")}
        >
          {paused ? <Play size={20} /> : <Pause size={20} />}
        </button>
        <button onClick={next} className={button} aria-label={t("passive.next")} title={t("passive.next")}>
          <SkipForward size={20} />
        </button>
      </div>
      <p className="text-center text-xs text-gray-400">{t("passive.noProgress")}</p>
    </div>
  );
}
