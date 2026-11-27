import { useSyncExternalStore } from "react";

// Minimal history-API router: the URL path is the source of truth for what
// the app shows (see src/lib/routes.ts), so links can be shared and the
// browser's back/forward buttons work. GitHub Pages serves 404.html (a copy
// of index.html, made by `npm run build`) for deep links.

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("popstate", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("popstate", listener);
  };
}

export function usePath(): string {
  return useSyncExternalStore(subscribe, () => window.location.pathname);
}

export function navigate(path: string, { replace = false }: { replace?: boolean } = {}) {
  if (path === window.location.pathname) return;
  if (replace) window.history.replaceState(null, "", path);
  else window.history.pushState(null, "", path);
  listeners.forEach((listener) => listener());
}
