import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Pause, Play, Rewind, Snail, Square, Volume2 } from "lucide-react";
import {
  currentAudioOwner,
  pauseAudio,
  playAudio,
  resumeAudio,
  rewindAudio,
  stopAudio,
  useAudioState,
} from "./audioPlayer";

const SLOW_RATE = 0.7;

// "Listen" and "Slower" buttons that turn into rewind / pause / stop while
// their clip plays. `getUrl` is called once (e.g. to render TTS on demand);
// the URL is then reused, and slow playback needs no new audio.
export function ListenControls({
  getUrl,
  size = 16,
  autoPlay = false,
}: {
  getUrl: () => Promise<string | null>;
  size?: number;
  autoPlay?: boolean;
}) {
  const { t } = useTranslation();
  const owner = useId();
  const { owner: playingOwner, playing } = useAudioState();
  const active = playingOwner === owner;
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<"normal" | "slow" | null>(null);

  const listen = (slow: boolean) => {
    const rate = slow ? SLOW_RATE : 1;
    if (url) return playAudio(url, { owner, rate });
    setLoading(slow ? "slow" : "normal");
    void getUrl()
      .then((u) => {
        if (!u) return;
        setUrl(u);
        playAudio(u, { owner, rate });
      })
      .finally(() => setLoading(null));
  };

  // Autoplay once on mount.
  useEffect(() => {
    if (!autoPlay) return;
    let cancelled = false;
    void getUrl().then((u) => {
      if (!u || cancelled) return;
      setUrl(u);
      playAudio(u, { owner });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stop our clip when this control goes away (e.g. navigating elsewhere).
  useEffect(
    () => () => {
      if (currentAudioOwner() === owner) stopAudio();
    },
    [owner],
  );

  const button =
    "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-50";

  if (active) {
    return (
      <span className="inline-flex items-center">
        <button onClick={() => rewindAudio()} className={button} title={t("audio.rewind")} aria-label={t("audio.rewind")}>
          <Rewind size={size} />
        </button>
        <button
          onClick={playing ? pauseAudio : resumeAudio}
          className={button}
          title={playing ? t("audio.pause") : t("audio.resume")}
          aria-label={playing ? t("audio.pause") : t("audio.resume")}
        >
          {playing ? <Pause size={size} /> : <Play size={size} />}
        </button>
        <button onClick={stopAudio} className={button} title={t("audio.stop")} aria-label={t("audio.stop")}>
          <Square size={size} />
        </button>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center">
      <button onClick={() => listen(false)} disabled={loading !== null} className={button}>
        {loading === "normal" ? <Loader2 size={size} className="animate-spin" /> : <Volume2 size={size} />}
        {t("audio.listen")}
      </button>
      <button onClick={() => listen(true)} disabled={loading !== null} className={button} title={t("audio.slower")}>
        {loading === "slow" ? <Loader2 size={size} className="animate-spin" /> : <Snail size={size} />}
        <span className="sr-only sm:not-sr-only">{t("audio.slower")}</span>
      </button>
    </span>
  );
}
