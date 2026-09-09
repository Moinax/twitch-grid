import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal, flushSync } from "react-dom";

// The SDK owns player containers; the React tree owns all their surrounding UI.
export function createViews() {
  let snapshot = new Map<Element, ReactNode>();
  let nextKey = 0;
  const keys = new WeakMap<Element, string>();
  const listeners = new Set<() => void>();
  function commit(next: Map<Element, ReactNode>) {
    snapshot = next;
    flushSync(() => listeners.forEach((listener) => listener()));
  }
  return {
    keyFor(element: Element) {
      if (!keys.has(element)) keys.set(element, String(nextKey++));
      return keys.get(element)!;
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    render(element: Element, content: ReactNode) {
      commit(new Map(snapshot).set(element, content));
    },
    remove(element: Element) {
      if (!snapshot.has(element)) return;
      const next = new Map(snapshot);
      next.delete(element);
      commit(next);
    },
    dispose() {
      commit(new Map());
    },
  };
}
export type WorkspaceViews = ReturnType<typeof createViews>;

export function DynamicViews({ views }: { views: WorkspaceViews }) {
  const snapshot = useSyncExternalStore(views.subscribe, views.getSnapshot);
  return (
    <>
      {[...snapshot].map(([element, content]) =>
        createPortal(content, element, views.keyFor(element)),
      )}
    </>
  );
}
