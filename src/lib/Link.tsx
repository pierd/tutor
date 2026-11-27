import type { AnchorHTMLAttributes } from "react";
import { navigate } from "./router";

// An <a> that navigates within the app on a plain click; modified clicks
// (new tab, new window) and middle clicks keep the browser's behaviour.
export function Link({ to, onClick, ...props }: { to: string } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  return (
    <a
      {...props}
      href={to}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
          return;
        }
        event.preventDefault();
        navigate(to);
      }}
    />
  );
}
