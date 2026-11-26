/**
 * Page background: a calm, static workspace — soft tone, a faint dot grid and two
 * barely-there colour glows. It stays out of the way so the note is what you see.
 * Pure CSS (see `.scene` in globals.css): nothing to load, nothing animating.
 */
export function SceneBackground() {
  return <div className="scene" aria-hidden="true" />;
}
