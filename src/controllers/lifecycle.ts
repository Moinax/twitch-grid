// Own browser resources for one workspace mount, including hot reloads.
export function createLifecycle() {
  const abort = new AbortController();
  const timers = new Set<number>();
  const intervals = new Set<number>();
  const observers: { disconnect(): void }[] = [];
  return {
    signal: abort.signal,
    get disposed() {
      return abort.signal.aborted;
    },
    setTimeout(callback: () => void, delay = 0): number {
      const id = window.setTimeout(() => {
        timers.delete(id);
        if (!abort.signal.aborted) callback();
      }, delay);
      timers.add(id);
      return id;
    },
    setInterval(callback: () => void, delay: number): number {
      const id = window.setInterval(() => {
        if (!abort.signal.aborted) callback();
      }, delay);
      intervals.add(id);
      return id;
    },
    ResizeObserver: class extends ResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        super(callback);
        observers.push(this);
      }
    },
    IntersectionObserver: class extends IntersectionObserver {
      constructor(
        callback: IntersectionObserverCallback,
        options?: IntersectionObserverInit,
      ) {
        super(callback, options);
        observers.push(this);
      }
    },
    MutationObserver: class extends MutationObserver {
      constructor(callback: MutationCallback) {
        super(callback);
        observers.push(this);
      }
    },
    addEventListener<K extends keyof WindowEventMap>(
      type: K,
      callback: (event: WindowEventMap[K]) => void,
      options: AddEventListenerOptions = {},
    ) {
      window.addEventListener(type, callback, {
        ...options,
        signal: abort.signal,
      });
    },
    dispose() {
      abort.abort();
      timers.forEach((id) => window.clearTimeout(id));
      intervals.forEach((id) => window.clearInterval(id));
      observers.forEach((observer) => observer.disconnect());
    },
  };
}
