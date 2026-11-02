// Polyfills for running unit tests under jsdom (the default Vitest environment).
// Ionic components such as ion-menu and ion-split-pane query `window.matchMedia`,
// which jsdom does not implement.
if (!window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

// Web Locks are available in supported secure-context browsers, but not jsdom.
if (!navigator.locks) {
  const queues = new Map<string, Promise<unknown>>();
  Object.defineProperty(navigator, 'locks', { configurable: true, value: {
    request: <T>(name: string, callback: (lock: Lock) => T | PromiseLike<T>): Promise<T> => {
      const result = (queues.get(name) ?? Promise.resolve()).then(() => callback({ name, mode: 'exclusive' }));
      queues.set(name, result.catch(() => undefined));
      return result;
    },
  } });
}
