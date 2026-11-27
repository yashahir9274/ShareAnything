/** How many background designs rotate (each has a `.scene-layer-N` style in globals.css). */
const LAYERS = 6;

/**
 * Page background: six calm designs that take turns — each shows for 10 seconds, then
 * fades out while the next fades in, with a very slow drift while it's on screen.
 * Pure CSS (see "Background" in globals.css): nothing to load, cheap on phones,
 * and a single still design for people who turn off animations.
 */
export function SceneBackground() {
  return (
    <div className="scene" aria-hidden="true">
      {Array.from({ length: LAYERS }, (_, index) => (
        <div key={index} className={`scene-layer scene-layer-${index + 1}`} />
      ))}
    </div>
  );
}
