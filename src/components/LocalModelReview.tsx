import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { disposeObject } from "../lib/worldGeometry";
import { inspectGLB } from "../lib/glb";
import type { GLBInspection } from "../lib/glb";
export default function LocalModelReview() {
  const mount = useRef<HTMLDivElement>(null),
    revision = useRef(0),
    view = useRef("front"),
    geometry = useRef(false);
  const [buffer, setBuffer] = useState<ArrayBuffer | null>(null),
    [name, setName] = useState(""),
    [hash, setHash] = useState(""),
    [info, setInfo] = useState<GLBInspection | null>(null);
  const [error, setError] = useState(""),
    [status, setStatus] = useState(
      "Choose an original GLB to inspect it locally.",
    ),
    [geo, setGeo] = useState(false);
  useEffect(
    () => () => {
      revision.current++;
    },
    [],
  );
  async function choose(file?: File) {
    const id = ++revision.current;
    setError("");
    setBuffer(null);
    setInfo(null);
    setHash("");
    setName(file?.name ?? "");
    setStatus(
      file
        ? "Reading and validating the original file…"
        : "Choose an original GLB to inspect it locally.",
    );
    if (!file) return;
    try {
      if (file.size > 50_000_000) throw new Error("Maximum GLB size is 50 MB.");
      const data = await file.arrayBuffer(),
        inspection = inspectGLB(data);
      const digest = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", data)),
        (x) => x.toString(16).padStart(2, "0"),
      ).join("");
      if (id !== revision.current) return;
      setInfo(inspection);
      setHash(digest);
      setBuffer(data);
      setStatus("Loading geometry and textures…");
    } catch (e) {
      if (id === revision.current)
        setError(e instanceof Error ? e.message : "Model could not be read.");
    }
  }
  useEffect(() => {
    if (!buffer || !mount.current) return;
    const host = mount.current;
    let alive = true,
      contextLost = false,
      frame = 0,
      root: THREE.Group | undefined,
      renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      queueMicrotask(() =>
        setError(
          "WebGL is unavailable; file inspection succeeded but no visual review was performed.",
        ),
      );
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.setSize(host.clientWidth, host.clientHeight);
    host.appendChild(renderer.domElement);
    renderer.domElement.style.touchAction = "none";
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#1b2d37");
    scene.add(new THREE.HemisphereLight("#f2f3e8", "#5b727d", 2.7));
    const light = new THREE.DirectionalLight("#fff1da", 3.4);
    light.position.set(3, 5, 7);
    scene.add(light);
    const camera = new THREE.PerspectiveCamera(
        38,
        host.clientWidth / host.clientHeight,
        0.01,
        10000,
      ),
      controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    const originals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>(),
      plain = new THREE.MeshStandardMaterial({
        color: "#bdd0d4",
        roughness: 0.7,
      });
    let lastView = "",
      lastGeo = false,
      radius = 1;
    const resize = new ResizeObserver(() => {
      if (!host.clientWidth || !host.clientHeight) return;
      camera.aspect = host.clientWidth / host.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(host.clientWidth, host.clientHeight);
      lastView = "";
    });
    resize.observe(host);
    new GLTFLoader()
      .parseAsync(buffer, "")
      .then((g) => {
        if (!alive) {
          disposeObject(g.scene);
          return;
        }
        root = g.scene;
        root.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(root),
          size = bounds.getSize(new THREE.Vector3()),
          center = bounds.getCenter(new THREE.Vector3());
        if (!Number.isFinite(size.length()) || size.length() === 0)
          throw new Error("Empty or invalid model bounds.");
        root.position.sub(center);
        scene.add(root);
        root.traverse((o) => {
          if (o instanceof THREE.Mesh) originals.set(o, o.material);
        });
        radius = size.length() / 2;
        camera.near = Math.max(radius / 1000, 0.001);
        camera.far = radius * 100;
        camera.updateProjectionMatrix();
        setStatus(
          `Geometry loaded · bounds ${size.x.toFixed(3)} × ${size.y.toFixed(3)} × ${size.z.toFixed(3)} glTF units. Confirm units before making a print copy.`,
        );
      })
      .catch(() => {
        if (root) {
          root.parent?.remove(root);
          disposeObject(root);
          root = undefined;
        }
        if (alive) {
          setStatus("File inspection completed; visual preview did not load.");
          setError(
            "This GLB could not be rendered. Unsupported compression, textures or geometry may need conversion.",
          );
        }
      });
    const lost = (event: Event) => {
      event.preventDefault();
      if (contextLost) return;
      contextLost = true;
      cancelAnimationFrame(frame);
      setError("WebGL context was lost; waiting for the browser to restore the preview.");
    };
    const restored = () => {
      if (!alive || !contextLost) return;
      contextLost = false;
      lastView = "";
      setError("");
      frame = requestAnimationFrame(animate);
    };
    renderer.domElement.addEventListener("webglcontextlost", lost);
    renderer.domElement.addEventListener("webglcontextrestored", restored);
    function animate() {
      if (!alive || contextLost) return;
      if (root) {
        if (lastView !== view.current) {
          lastView = view.current;
          const d =
            (radius / Math.sin(THREE.MathUtils.degToRad(19))) *
            1.15 *
            Math.max(1, 1 / camera.aspect);
          camera.position.set(
            lastView === "side" ? d : 0,
            0,
            lastView === "front" ? d : lastView === "back" ? -d : 0,
          );
          controls.target.set(0, 0, 0);
          controls.update();
        }
        if (lastGeo !== geometry.current) {
          lastGeo = geometry.current;
          for (const [mesh, mat] of originals)
            mesh.material = lastGeo ? plain : mat;
        }
      }
      controls.update();
      renderer.render(scene, camera);
      if (alive && !contextLost) frame = requestAnimationFrame(animate);
    }
    frame = requestAnimationFrame(animate);
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      resize.disconnect();
      renderer.domElement.removeEventListener("webglcontextlost", lost);
      renderer.domElement.removeEventListener("webglcontextrestored", restored);
      controls.dispose();
      for (const [mesh, mat] of originals) mesh.material = mat;
      disposeObject(scene);
      plain.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [buffer]);
  return (
    <section>
      <div className="section-heading">
        <h2>Inspect an original model</h2>
        <span className="pill">LOCAL FILE · NO UPLOAD</span>
      </div>
      <p>
        Load Julie, Queen or another original GLB. Geometry and textured
        appearance need separate review. This inspection does not certify wall
        thickness, watertightness or production readiness.
      </p>
      <label>
        Self-contained GLB · maximum 50 MB
        <input
          type="file"
          accept=".glb,model/gltf-binary"
          onChange={(e) => choose(e.target.files?.[0])}
        />
      </label>
      {buffer ? (
        <>
          <div className="model-review" ref={mount} />
          <div className="scene-toolbar">
            {["front", "side", "back"].map((v) => (
              <button
                key={v}
                onClick={() => {
                  view.current = v;
                }}
              >
                {v[0].toUpperCase() + v.slice(1)}
              </button>
            ))}
            <button
              onClick={() => {
                geometry.current = !geometry.current;
                setGeo(geometry.current);
              }}
            >
              {geo ? "Show textures" : "Geometry only"}
            </button>
          </div>
        </>
      ) : null}
      <p role="status">{status}</p>
      {error ? (
        <p role="alert" className="error">
          {error}
        </p>
      ) : null}
      {info ? (
        <div className="result-note">
          <strong>{name}</strong>
          <p>
            {info.meshCount} source meshes · {info.triangles.toLocaleString()}{" "}
            source triangles · {info.renderedTriangles.toLocaleString()} with
            scene instances · {info.materialCount} materials ·{" "}
            {(info.byteLength / 1e6).toFixed(2)} MB
          </p>
          <small className="file-hash">SHA-256: {hash}</small>
          <p>
            MAKE status: VALIDATION REQUIRED. Preserve this hash with every
            supplier quote and revision.
          </p>
        </div>
      ) : null}
    </section>
  );
}
