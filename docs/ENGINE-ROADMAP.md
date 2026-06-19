# Custom Engine Roadmap (DEFERRED — do this later)

We chose **Three.js** to ship a great-looking game fast. This file preserves the
"build our own 3D engine from scratch" plan so we can swap it in later without
losing the vision.

## Why defer
- A from-scratch WebGL engine that can load **rigged, animated glTF characters**
  (skeletal animation) is a large amount of work and would eat the whole build
  budget before the *game* exists.
- Three.js gets us beautiful animated characters + bloom/postprocessing *today*.

## The three paths we discussed
- **Path A — Pure custom engine.** Everything hand-written (vec/mat math,
  shaders, camera, lighting, collision). Characters are **stylized / voxel /
  low-poly**, generated in code. Maximum bragging rights, achievable as its own
  project. *No glTF needed.*
- **Path B — Custom engine + glTF loader.** Custom engine, but write a glTF
  parser + skinned-animation system so we can load free Mixamo/Quaternius
  characters. The loader is the hard part.
- **Path C — Three.js (CHOSEN NOW).** Library does rendering, skinning, glTF.
  We hand-build all the *game* systems on top. Best visual payoff per hour.

## Migration strategy (Three.js → custom engine)
Keep game logic decoupled from the renderer so the engine can be swapped:
- Isolate all Three.js calls behind a thin **`Renderer` interface**
  (createMesh, setCamera, drawFrame, loadModel, light, etc.).
- Keep **game state, physics, AI, economy** in renderer-agnostic modules.
- When ready, implement the same `Renderer` interface in raw WebGL (Path A/B),
  swap it in, and the game logic is untouched.

## Custom-engine build order (when we tackle it)
1. Math lib: `vec3`, `mat4`, quaternions.
2. WebGL2 context, shader pipeline, mesh abstraction, instancing.
3. Camera (perspective, chase + FPS), input.
4. Lighting (directional + point), basic shadows.
5. Collision (AABB / capsule) + arcade physics.
6. glTF/GLB loader (Path B) — static meshes first, then skinned animation.
7. Particles, postprocessing (bloom), fog.
8. Match the `Renderer` interface; swap out Three.js.

> TL;DR: ship the fun with Three.js now; the clean `Renderer` boundary means the
> custom engine becomes a drop-in upgrade, not a rewrite.
