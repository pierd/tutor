import { useEffect, useState } from "react";

const MINUTE = 60 * 1000;

// Current time rounded to the minute, so time-based queries stay cacheable.
export function useMinuteClock() {
  const [now, setNow] = useState(() => Math.floor(Date.now() / MINUTE) * MINUTE);
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / MINUTE) * MINUTE), MINUTE);
    return () => clearInterval(id);
  }, []);
  return now;
}
