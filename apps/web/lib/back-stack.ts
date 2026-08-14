import { useEffect, useRef } from "react";

type BackHandler = () => boolean;

const handlers: BackHandler[] = [];

export function registerBackHandler(handler: BackHandler) {
  handlers.push(handler);
  return () => {
    const index = handlers.lastIndexOf(handler);
    if (index >= 0) handlers.splice(index, 1);
  };
}

export function consumeBack(): boolean {
  for (let i = handlers.length - 1; i >= 0; i -= 1) {
    if (handlers[i]()) return true;
  }
  return false;
}

function pushStayState() {
  const next = { ...(window.history.state ?? {}), remetumStay: true };
  window.history.pushState(next, "", window.location.href);
}

export function useStayInAppBack(enabled: boolean, onBack: () => boolean) {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    if (!enabled) return;

    pushStayState();

    const onPopState = () => {
      consumeBack() || onBackRef.current();
      pushStayState();
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [enabled]);
}
