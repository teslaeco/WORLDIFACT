import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import StartingWorld from "./StartingWorld";
import {
  MAX_BLUEPRINT_BYTES,
  demoBlueprint,
  localSceneResult,
  parseBlueprintJson,
  validateGenerationResult,
} from "../lib/blueprint";
import type { GenerationResult, WorldBlueprint } from "../lib/blueprint";
import { readArchive, saveArchive } from "../lib/archive";
import type { ArchivedWorld } from "../lib/archive";
import { createWorldObject, disposeObject } from "../lib/worldGeometry";
import { Group } from "three";

function download(data: Blob, name: string) {
  const url = URL.createObjectURL(data),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export default function WorldStudio() {
  const navigate = useNavigate();
  const [blueprint, setBlueprint] = useState<WorldBlueprint>(() =>
    demoBlueprint("village forest"),
  );
  const [prompt, setPrompt] = useState(
    "Create a riverside village with a red solar rover, workshops and trees.",
  );
  const [mode, setMode] = useState<"demo" | "live">("demo"),
    [live, setLive] = useState(false),
    [image, setImage] = useState<string | null>(null),
    [imageBusy, setImageBusy] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const [busy, setBusy] = useState(false),
    [seconds, setSeconds] = useState(0),
    [notice, setNotice] = useState(
      "DEMO · local procedural meshes. Your original Julie and Queen files are not connected.",
    );
  const [error, setError] = useState(""),
    [archive, setArchive] = useState<ArchivedWorld[]>(() => readArchive()),
    [search, setSearch] = useState("");
  const [selected, setSelected] = useState(""),
    [lastResult, setLastResult] = useState<GenerationResult | null>(null);
  const abort = useRef<AbortController | null>(null);
  const imageRevision = useRef(0);
  const sceneRevision = useRef(0);
  const generationRevision = useRef(0);
  const generationInFlight = useRef(false);
  const importRevision = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    let alive = true;
    const invalidatePending = () => {
      generationRevision.current++;
      generationInFlight.current = false;
      imageRevision.current++;
      importRevision.current++;
      abort.current?.abort();
    };
    fetch("/api/health")
      .then((r) => (r.ok ? r.json() : null))
      .then((v) => {
        if (alive) setLive(!!v?.generationReady);
      })
      .catch(() => {
        if (alive) setLive(false);
      });
    return () => {
      alive = false;
      mounted.current = false;
      invalidatePending();
    };
  }, []);
  useEffect(() => {
    if (!busy) return;
    const start = Date.now(),
      t = setInterval(
        () => setSeconds(Math.floor((Date.now() - start) / 1000)),
        500,
      );
    return () => clearInterval(t);
  }, [busy]);
  function apply(result: GenerationResult) {
    validateGenerationResult(result);
    sceneRevision.current++;
    setBlueprint(result.blueprint);
    setLastResult(result);
    setSelected("");
    setNotice(`${result.mode} · ${result.limitation}`);
    try {
      setArchive(saveArchive(result));
    } catch {
      setNotice(
        `${result.mode} · Scene ready. Device storage is full or unavailable; download your blueprint to keep it.`,
      );
    }
  }
  function editScene(next: WorldBlueprint, limitation?: string) {
    const result = localSceneResult(next, limitation);
    sceneRevision.current++;
    setBlueprint(next);
    setLastResult(result);
    setNotice(`DEMO · ${result.limitation}`);
  }
  async function generate() {
    if (generationInFlight.current || imageBusy) return;
    generationInFlight.current = true;
    const generationId = ++generationRevision.current;
    setBusy(true);
    setError("");
    setSeconds(0);
    const startingRevision = sceneRevision.current;
    const controller = new AbortController();
    abort.current = controller;
    const timer = setTimeout(() => controller.abort(), 40000);
    try {
      if (prompt.trim().length < 3 || prompt.length > 2000)
        throw new Error("Use a prompt between 3 and 2000 characters.");
      if (mode === "demo") {
        apply({
          mode: "DEMO",
          provenance: "MOCK",
          blueprint: demoBlueprint(prompt),
          requestId: crypto.randomUUID(),
          model: null,
          limitation:
            "Rule-based example; image references are not analyzed. GAME export contains procedural meshes; MAKE is not validated.",
        });
      } else {
        const r = await fetch("/api/blueprint", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-WORLDIFACT-Access": accessCode.trim(),
          },
          body: JSON.stringify({ prompt, image, mode }),
          signal: controller.signal,
        });
        const value = await r.json();
        if (generationId !== generationRevision.current)
          return;
        if (!r.ok)
          throw new Error(
            value.error ||
              "Generation failed. Your previous scene is unchanged.",
          );
        validateGenerationResult(value);
        if (sceneRevision.current !== startingRevision)
          throw new Error(
            "The scene changed while Astra was working. The returned scene was not applied; generate again when ready.",
          );
        apply(value);
      }
    } catch (e) {
      if (generationId === generationRevision.current)
        setError(
          e instanceof Error && e.name === "AbortError"
            ? "Generation stopped. Your previous scene is unchanged."
            : e instanceof Error
              ? e.message
              : "Generation failed.",
        );
    } finally {
      clearTimeout(timer);
      if (generationId === generationRevision.current) {
        generationInFlight.current = false;
        if (abort.current === controller) abort.current = null;
        setBusy(false);
      }
    }
  }
  async function importBlueprint(file?: File) {
    setError("");
    if (!file) return;
    const revision = ++importRevision.current;
    const startingRevision = sceneRevision.current;
    try {
      if (file.type && file.type !== "application/json")
        throw new Error("Choose a JSON blueprint file.");
      if (file.size > MAX_BLUEPRINT_BYTES)
        throw new Error("Blueprint file must be 100 KB or smaller.");
      const imported = parseBlueprintJson(await file.text());
      if (!mounted.current || revision !== importRevision.current) return;
      if (sceneRevision.current !== startingRevision)
        throw new Error(
          "The scene changed while the file was loading. Import it again when ready.",
        );
      apply(
        localSceneResult(
          imported,
          "Imported blueprint validated locally. GAME uses procedural meshes; MAKE is not validated.",
        ),
      );
      setSelected("");
    } catch (e) {
      if (!mounted.current || revision !== importRevision.current) return;
      setError(
        e instanceof Error
          ? e.message
          : "Blueprint import failed. Your previous scene is unchanged.",
      );
    }
  }
  async function pickImage(file?: File) {
    const revision = ++imageRevision.current;
    setError("");
    setImage(null);
    setImageBusy(false);
    if (!file) return;
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 1_000_000
    ) {
      setError("Choose PNG, JPEG or WebP up to 1 MB.");
      return;
    }
    setImageBusy(true);
    const reader = new FileReader();
    reader.onload = () => {
      if (revision === imageRevision.current) {
        setImage(String(reader.result));
        setImageBusy(false);
      }
    };
    reader.onerror = () => {
      if (revision === imageRevision.current) {
        setError("Image could not be read.");
        setImageBusy(false);
      }
    };
    reader.onabort = reader.onerror;
    reader.readAsDataURL(file);
  }
  async function exportGLB() {
    try {
      const { GLTFExporter } =
        await import("three/addons/exporters/GLTFExporter.js");
      const scene = new Group();
      scene.name = blueprint.title;
      scene.userData = {
        provenance: lastResult?.provenance || "MOCK",
        manufacturing: "NOT_VALIDATED",
        generator: "WORLDIFACT procedural meshes",
      };
      for (const o of blueprint.objects) scene.add(createWorldObject(o));
      try {
        const output = await new GLTFExporter().parseAsync(scene, {
          binary: true,
        });
        download(
          new Blob([output as ArrayBuffer], { type: "model/gltf-binary" }),
          "WORLDIFACT-GAME-procedural.glb",
        );
      } finally {
        disposeObject(scene);
      }
    } catch {
      setError("GLB export failed; your scene is still available.");
    }
  }
  const object = blueprint.objects.find((o) => o.id === selected);
  function add(item: ArchivedWorld) {
    if (blueprint.objects.length + item.result.blueprint.objects.length > 24) {
      setError(
        "A scene can contain at most 24 objects. Load this world instead.",
      );
      return;
    }
    const newObjects = item.result.blueprint.objects.map((o) => ({
      ...o,
      id: crypto.randomUUID(),
      x: Math.min(35, o.x + 5),
      z: Math.min(35, o.z + 5),
    }));
    editScene({
      ...blueprint,
      objects: [...blueprint.objects, ...newObjects],
    }, "Local composition changed. Save scene to keep these edits; check object placement for overlaps.");
  }
  return (
    <div className="studio">
      <div className="studio-heading">
        <div>
          <span className="eyebrow">AI GAME LAB</span>
          <h1>Build a world. Step inside.</h1>
        </div>
        <span className="pill">
          {live ? "Astra preview available" : "Astra offline · DEMO available"}
        </span>
      </div>
      <div className="studio-layout">
        <div className="studio-scene">
          <StartingWorld
            blueprint={blueprint}
            activePortalId="ai-game-lab"
            onPortalOpen={(id) => navigate(`/portal/${id}`)}
          />
          <div className="scene-toolbar">
            <button onClick={exportGLB}>Export GAME · GLB</button>
            <button
              onClick={() =>
                download(
                  new Blob([JSON.stringify(blueprint, null, 2)], {
                    type: "application/json",
                  }),
                  "WORLDIFACT-blueprint.json",
                )
              }
            >
              Export blueprint
            </button>
            <label className="button-label">
              Import blueprint
              <input
                type="file"
                accept="application/json,.json"
                disabled={busy}
                onChange={(e) => {
                  void importBlueprint(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
            <button
              onClick={() =>
                apply(
                  lastResult?.blueprint === blueprint
                    ? { ...lastResult, requestId: crypto.randomUUID() }
                    : localSceneResult(blueprint),
                )
              }
            >
              Save scene
            </button>
          </div>
        </div>
        <aside className="creator-panel">
          <span className="eyebrow">YOUR NEXT CREATION</span>
          <label>
            Describe your world
            <textarea
              value={prompt}
              maxLength={2000}
              disabled={busy}
              onChange={(e) => setPrompt(e.target.value)}
              rows={5}
            />
          </label>
          <div className="prompt-presets">
            {[
              "Village with a red rover",
              "Moon workshop",
              "Forest with a blue rover",
            ].map((p) => (
              <button key={p} disabled={busy} onClick={() => setPrompt(p)}>
                {p}
              </button>
            ))}
          </div>
          <label>
            Generation mode
            <select
              value={mode}
              disabled={busy}
              onChange={(e) => setMode(e.target.value as "demo" | "live")}
            >
              <option value="demo">DEMO · local rules, no AI charge</option>
              <option value="live" disabled={!live}>
                LIVE · GPT-6 Astra
              </option>
            </select>
          </label>
          {mode === "live" ? (
            <label>
              Preview access code
              <input
                type="password"
                autoComplete="off"
                spellCheck={false}
                maxLength={256}
                value={accessCode}
                disabled={busy}
                onChange={(e) => setAccessCode(e.target.value)}
              />
              <small>Ask the maker for preview access. The code stays in this session.</small>
            </label>
          ) : null}
          <label>
            Reference image · optional
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={busy}
              onChange={(e) => pickImage(e.target.files?.[0])}
            />
          </label>
          {image ? (
            <>
              <img
                className="reference-preview"
                src={image}
                alt="Selected reference"
              />
              <button
                onClick={() => {
                  imageRevision.current++;
                  setImage(null);
                  setImageBusy(false);
                }}
                disabled={busy}
              >
                Remove reference
              </button>
            </>
          ) : null}
          <small>
            {mode === "demo"
              ? "DEMO uses supported preset rules; it does not analyze images."
              : "Astra receives this prompt and optional image through the server."}
          </small>
          {mode === "live" ? <small>Use only references you have permission to share. <Link to="/privacy">How your data is used</Link></small> : null}
          <button
            className="primary"
            disabled={busy || imageBusy || (mode === "live" && accessCode.trim().length < 32)}
            onClick={generate}
          >
            {imageBusy
              ? "Reading reference…"
              : busy
              ? "Creating scene…"
              : mode === "demo"
                ? "Build demo scene"
                : "Create with Astra"}
          </button>
          {busy ? (
            <div role="status" className="generation-status">
              <span className="spinner" />
              Waiting for the result · {seconds}s{" "}
              <button onClick={() => abort.current?.abort()}>Cancel</button>
            </div>
          ) : null}
          {error ? (
            <p role="alert" className="error">
              {error}
            </p>
          ) : null}
          <p role="status" className="result-note">
            {notice}
          </p>
          {lastResult?.evidence ? (
            <details className="generation-evidence">
              <summary>Generation details</summary>
              <p>{lastResult.model} · {lastResult.evidence.receivedAt}</p>
              <p>{lastResult.evidence.totalTokens === null ? "Token usage unavailable" : `${lastResult.evidence.totalTokens} tokens reported by the provider`}</p>
              <small>Scene fingerprint: {lastResult.evidence.blueprintSha256.slice(0, 16)}…</small>
              <button onClick={() => download(
                new Blob([JSON.stringify({ mode: lastResult.mode, model: lastResult.model, requestId: lastResult.requestId, ...lastResult.evidence }, null, 2)], { type: "application/json" }),
                "WORLDIFACT-generation-evidence.json",
              )}>Download generation details</button>
            </details>
          ) : null}
        </aside>
      </div>
      <div className="studio-lower">
        <section>
          <div className="section-heading">
            <h2>Scene objects</h2>
            <span>{blueprint.objects.length}/24</span>
          </div>
          <div className="object-list">
            {blueprint.objects.map((o) => (
              <button
                className={selected === o.id ? "selected" : ""}
                key={o.id}
                onClick={() => setSelected(o.id)}
              >
                <span style={{ background: o.color }} />
                {o.name}
                <small>{o.kind}</small>
              </button>
            ))}
          </div>
          {object ? (
            <div className="object-editor">
              <strong>{object.name}</strong>
              <label>
                Color
                <input
                  type="color"
                  value={object.color}
                  onChange={(e) =>
                    editScene({
                      ...blueprint,
                      objects: blueprint.objects.map((o) =>
                        o.id === object.id
                          ? { ...o, color: e.target.value }
                          : o,
                      ),
                    })
                  }
                />
              </label>
              <label>
                Scale · {object.scale.toFixed(1)}×
                <input
                  type="range"
                  min="0.4"
                  max="3"
                  step="0.1"
                  value={object.scale}
                  onChange={(e) =>
                    editScene({
                      ...blueprint,
                      objects: blueprint.objects.map((o) =>
                        o.id === object.id
                          ? { ...o, scale: Number(e.target.value) }
                          : o,
                      ),
                    })
                  }
                />
              </label>
              <label>
                X position · {object.x.toFixed(0)}
                <input
                  type="range"
                  min="-35"
                  max="35"
                  step="1"
                  value={object.x}
                  onChange={(e) =>
                    editScene({
                      ...blueprint,
                      objects: blueprint.objects.map((o) =>
                        o.id === object.id
                          ? { ...o, x: Number(e.target.value) }
                          : o,
                      ),
                    })
                  }
                />
              </label>
              <label>
                Z position · {object.z.toFixed(0)}
                <input
                  type="range"
                  min="-35"
                  max="35"
                  step="1"
                  value={object.z}
                  onChange={(e) =>
                    editScene({
                      ...blueprint,
                      objects: blueprint.objects.map((o) =>
                        o.id === object.id
                          ? { ...o, z: Number(e.target.value) }
                          : o,
                      ),
                    })
                  }
                />
              </label>
              <label>
                Rotation · {object.rotation.toFixed(0)}°
                <input
                  type="range"
                  min="0"
                  max="360"
                  step="5"
                  value={object.rotation}
                  onChange={(e) =>
                    editScene({
                      ...blueprint,
                      objects: blueprint.objects.map((o) =>
                        o.id === object.id
                          ? { ...o, rotation: Number(e.target.value) }
                          : o,
                      ),
                    })
                  }
                />
              </label>
              <button
                disabled={blueprint.objects.length <= 1}
                onClick={() => {
                  editScene({
                    ...blueprint,
                    objects: blueprint.objects.filter(
                      (o) => o.id !== object.id,
                    ),
                  }, "Object removed locally. Save the scene to keep this edit.");
                  setSelected("");
                }}
              >
                Remove from scene
              </button>
            </div>
          ) : null}
        </section>
        <section>
          <h2>World archive</h2>
          <p className="muted">
            Saved on this device, up to 30 worlds. Download a blueprint for a
            portable copy.
          </p>
          <input
            type="search"
            aria-label="Search saved worlds"
            placeholder="Search saved worlds"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <ul className="archive-list">
            {archive
              .filter((a) =>
                a.result.blueprint.title
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              )
              .map((a) => (
                <li key={a.id}>
                  <div>
                    <strong>{a.result.blueprint.title}</strong>
                    <small>
                      {a.result.mode} · {new Date(a.createdAt).toLocaleString()}{" "}
                      · {a.result.blueprint.objects.length} objects
                    </small>
                  </div>
                  <div>
                    <button
                      onClick={() => {
                        sceneRevision.current++;
                        setBlueprint(a.result.blueprint);
                        setLastResult(a.result);
                        setSelected("");
                        setNotice(
                          `${a.result.mode} · Loaded from this device.`,
                        );
                      }}
                    >
                      Load
                    </button>
                    <button onClick={() => add(a)}>Add to scene</button>
                  </div>
                </li>
              ))}
          </ul>
          {!archive.length ? (
            <p>No saved worlds yet. Build or save a scene to begin.</p>
          ) : null}
        </section>
      </div>
      <div className="workflow-pair">
        <article>
          <span className="eyebrow">GAME · GENERATED MESHES</span>
          <h3>Playable procedural scene</h3>
          <p>
            Export GLB with materials. Rovers and doors work inside WORLDIFACT;
            exported GLB contains geometry, not the game controller or an
            animation rig.
          </p>
        </article>
        <article>
          <span className="eyebrow">MAKE · VALIDATION REQUIRED</span>
          <h3>Production is a separate step</h3>
          <p>
            Check solid geometry, minimum walls, small features, assembly gaps,
            scale, color process and supplier approval. A nice render cannot
            approve production.
          </p>
        </article>
      </div>
    </div>
  );
}
