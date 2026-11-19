import { useRef } from "react";
import { useQuery as useCachedQuery } from "convex-helpers/react/cache/hooks";

// Cached useQuery: subscriptions outlive unmounting for a few minutes (see
// ConvexQueryCacheProvider in main.tsx), so going back to a view shows its
// data immediately instead of an empty first render. Use this, not the one
// from convex/react.
export const useQuery = useCachedQuery;

// Like useQuery, but while new args are loading it keeps returning the
// previous result instead of undefined. Only for args that refine the same
// data (e.g. a clock), never for ones that pick different data (an id).
export const useStableQuery: typeof useCachedQuery = (query, ...args) => {
  const result = useCachedQuery(query, ...args);
  const last = useRef(result);
  if (result !== undefined) last.current = result;
  return result ?? last.current;
};
