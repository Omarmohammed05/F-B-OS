/**
 * A demo visitor's change was refused by the API (`X-Demo-Read-Only`).
 *
 * Pages each print their own message for a failed save, and a generic one would
 * read like a bug. The request layer announces the refusal here and
 * `components/DemoNotice.tsx` says the real reason, once, wherever the visitor is.
 */

type Listener = () => void;

const listeners = new Set<Listener>();

export function onDemoBlocked(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function announceDemoBlocked(): void {
  listeners.forEach((listener) => listener());
}
