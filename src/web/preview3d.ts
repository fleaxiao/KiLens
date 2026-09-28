import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { VRMLLoader } from 'three/examples/jsm/loaders/VRMLLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ModelReference, Pad3d, parseBoard3d, Point, SilkText3d } from './board3dData';

interface Options {
    container: HTMLElement; source: string; workerUrl: string; wasmUrl: string;
    postMessage: (message: unknown) => void;
    state?: { position: number[]; target: number[] };
    persist: (state: { position: number[]; target: number[] }) => void;
    textStrokes: (text: SilkText3d) => Point[][];
}
const radians = THREE.MathUtils.degToRad;
/** KiCad strokes have round ends, including where separate segments meet. */
export function strokeGeometry(length: number, width: number): THREE.ShapeGeometry {
    const r = Math.max(0.005, width / 2), half = length / 2;
    const shape = new THREE.Shape();
    shape.moveTo(-half, -r); shape.lineTo(half, -r);
    shape.absarc(half, 0, r, -Math.PI / 2, Math.PI / 2, false);
    shape.lineTo(-half, r);
    shape.absarc(-half, 0, r, Math.PI / 2, Math.PI * 1.5, false);
    shape.closePath();
    return new THREE.ShapeGeometry(shape, 12);
}

export function updateCameraDepth(camera: THREE.PerspectiveCamera, bounds: THREE.Sphere): void {
    const distance = camera.position.distanceTo(bounds.center);
    const radius = Math.max(1, bounds.radius);
    // A fixed 0.01–100000 range loses the micrometre-scale separation of PCB layers.
    camera.near = Math.max(0.01, distance - radius * 1.2);
    camera.far = Math.max(camera.near + 1, distance + radius * 1.2);
    camera.updateProjectionMatrix();
}
function path(points: Point[]): THREE.Shape {
    const result = new THREE.Shape(points.map(p => new THREE.Vector2(p[0], -p[1])));
    result.closePath();
    return result;
}
function contains(loop: Point[], p: Point): boolean {
    let inside = false;
    for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
        const a = loop[i], b = loop[j];
        if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
}
function padShape(size: Point, shape: string, ratio: number): THREE.Shape {
    const [w, h] = size;
    const r = shape === 'circle' || shape === 'oval' ? Math.min(w, h) / 2
        : shape === 'roundrect' ? Math.min(w, h) * Math.min(0.5, Math.max(0, ratio)) : 0;
    const s = new THREE.Shape();
    if (shape === 'circle') { s.absellipse(0, 0, w / 2, h / 2, 0, Math.PI * 2, false, 0); return s; }
    s.moveTo(-w / 2 + r, -h / 2); s.lineTo(w / 2 - r, -h / 2);
    s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r); s.lineTo(w / 2, h / 2 - r);
    s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2); s.lineTo(-w / 2 + r, h / 2);
    s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r); s.lineTo(-w / 2, -h / 2 + r);
    s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
    return s;
}
function hole(pad: Pad3d, world: boolean): THREE.Path {
    const pts = padShape(pad.drill, pad.drill[0] === pad.drill[1] ? 'circle' : 'oval', 0).getPoints(12);
    const a = radians(pad.angle);
    return new THREE.Path(pts.map(p => {
        p.x += pad.drillOffset[0]; p.y -= pad.drillOffset[1];
        return world ? new THREE.Vector2(p.x * Math.cos(a) - p.y * Math.sin(a) + pad.position[0],
            p.x * Math.sin(a) + p.y * Math.cos(a) - pad.position[1]) : p;
    }));
}
export function placeModel(object: THREE.Object3D, ref: ModelReference, thickness: number): THREE.Group {
    const footprint = new THREE.Group();
    footprint.position.set(ref.position[0], -ref.position[1], (ref.back ? -1 : 1) * thickness / 2);
    footprint.rotation.z = radians(ref.angle);
    // KiCad BOARD_ADAPTER: Rz(footprint) * Ry(180) * Rz(180) on the back.
    if (ref.back) { footprint.rotateY(Math.PI); footprint.rotateZ(Math.PI); }
    const placement = new THREE.Group();
    placement.position.fromArray(ref.offset);
    placement.rotation.set(-radians(ref.rotation[0]), -radians(ref.rotation[1]), -radians(ref.rotation[2]), 'ZYX');
    placement.scale.fromArray(ref.scale);
    placement.add(object); footprint.add(placement);
    return footprint;
}
export function mount(options: Options) {
    const { container } = options;
    const data = parseBoard3d(options.source);
    const viewport = container.querySelector<HTMLElement>('.three-viewport')!;
    const status = container.querySelector<HTMLElement>('.three-status')!;
    const details = container.querySelector<HTMLElement>('.three-details')!;
    // Logarithmic depth also preserves layer separation when zoomed inside the board bounds.
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, stencil: true, logarithmicDepthBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x101d23);
    viewport.append(renderer.domElement);
    renderer.domElement.tabIndex = 0;
    renderer.domElement.setAttribute('aria-label', '3D PCB preview: drag to orbit, right-drag to pan, scroll to zoom');
    const scene = new THREE.Scene(), assembly = new THREE.Group(), models = new THREE.Group(), silkscreen = new THREE.Group();
    scene.add(assembly); assembly.add(models, silkscreen);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x607080, 2.5));
    const light = new THREE.DirectionalLight(0xffffff, 3); light.position.set(50, -20, 100); scene.add(light);
    const bottomLight = new THREE.DirectionalLight(0xffffff, 2); bottomLight.position.set(-30, 40, -70); scene.add(bottomLight);
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1000); camera.up.set(0, 0, 1);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    let disposed = false, active = true, userMoved = false;
    const bounds = new THREE.Sphere(new THREE.Vector3(), 20);
    const updateBounds = () => {
        const box = new THREE.Box3().setFromObject(assembly);
        if (!box.isEmpty()) box.getBoundingSphere(bounds);
    };
    const draw = () => {
        if (!disposed && active) { updateCameraDepth(camera, bounds); renderer.render(scene, camera); }
    };
    controls.addEventListener('change', draw);
    controls.addEventListener('start', () => { userMoved = true; });
    controls.addEventListener('end', () => options.persist({ position: camera.position.toArray(), target: controls.target.toArray() }));
    renderer.domElement.addEventListener('webglcontextlost', event => {
        event.preventDefault(); status.textContent = 'Graphics context lost. Return to 2D and refresh the preview.';
    });
    const green = new THREE.MeshStandardMaterial({ color: 0x176447, roughness: 0.65, side: THREE.DoubleSide });
    const edge = new THREE.MeshStandardMaterial({ color: 0xbba878, roughness: 0.85 });
    const copper = new THREE.MeshStandardMaterial({ color: 0xcdb77d, metalness: 0.5, roughness: 0.38, side: THREE.DoubleSide });
    const track = new THREE.MeshStandardMaterial({ color: 0x288867, roughness: 0.6 });
    const silk = new THREE.MeshStandardMaterial({ color: 0xf1eee3, roughness: 0.7 });
    // Clip surface artwork to the visible board face, including every drill/cutout.
    // Depth testing remains enabled for artwork so components and the board occlude it.
    if (data.loops.length) for (const material of [copper, track, silk]) {
        material.stencilWrite = true; material.stencilRef = 1; material.stencilFunc = THREE.EqualStencilFunc;
    }
    const depths = data.loops.map(loop => data.loops.filter(other => other !== loop && contains(other, loop[0])).length);
    data.loops.forEach((loop, i) => {
        if (depths[i] % 2) return;
        const shape = path(loop);
        data.loops.forEach((inner, j) => { if (depths[j] === depths[i] + 1 && contains(loop, inner[0])) shape.holes.push(path(inner)); });
        for (const pad of data.pads) {
            if (pad.drill[0] <= 0 || pad.drill[1] <= 0) continue;
            const drillPath = hole(pad, true), center = drillPath.getPoints(2)[0];
            const p: Point = [center.x, -center.y];
            if (contains(loop, p)
                && !data.loops.some((inner, j) => depths[j] === depths[i] + 1 && contains(inner, p))) shape.holes.push(drillPath);
        }
        const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: data.thickness, bevelEnabled: false, curveSegments: 12 }), [green, edge]);
        mesh.position.z = -data.thickness / 2; assembly.add(mesh);
        const maskGeometry = new THREE.ShapeGeometry(shape, 12);
        for (const back of [false, true]) {
            const mask = new THREE.Mesh(maskGeometry, new THREE.MeshBasicMaterial({
                colorWrite: false, depthWrite: false, depthTest: false,
                side: back ? THREE.BackSide : THREE.FrontSide,
                stencilWrite: true, stencilRef: 1, stencilFunc: THREE.AlwaysStencilFunc,
                stencilZPass: THREE.ReplaceStencilOp
            }));
            mask.position.z = (back ? -1 : 1) * (data.thickness / 2 + 0.012);
            mask.renderOrder = -1; assembly.add(mask);
        }
    });
    for (const pad of data.pads) {
        if (pad.size.some(v => v <= 0)) continue;
        const shape = padShape(pad.size, pad.shape, pad.ratio);
        if (pad.drill[0] > 0 && pad.drill[1] > 0) shape.holes.push(hole(pad, false));
        const geometry = new THREE.ShapeGeometry(shape, 12);
        for (const back of [false, true]) {
            if (back ? !pad.back : !pad.front) continue;
            const mesh = new THREE.Mesh(geometry, copper);
            mesh.position.set(pad.position[0], -pad.position[1], (back ? -1 : 1) * (data.thickness / 2 + 0.025));
            mesh.rotation.z = radians(pad.angle); assembly.add(mesh);
        }
    }
    for (const text of data.silkTexts) {
        try {
            for (const points of options.textStrokes(text)) data.traces.push({ points, width: text.width, back: text.back, silk: true });
        } catch { data.warnings.push(`Unable to render silkscreen text: ${text.text}`); }
    }
    for (const polygon of data.silkPolygons) {
        const mesh = new THREE.Mesh(new THREE.ShapeGeometry(path(polygon.points)), silk);
        mesh.position.z = (polygon.back ? -1 : 1) * (data.thickness / 2 + 0.045);
        // Preserve board coordinates when reversing the back face.
        if (polygon.back) { const indices = mesh.geometry.index!; for (let i = 0; i < indices.count; i += 3) {
            const a = indices.getX(i); indices.setX(i, indices.getX(i + 2)); indices.setX(i + 2, a);
        } mesh.geometry.computeVertexNormals(); }
        assembly.add(mesh);
    }
    for (const trace of data.traces) {
        for (let i = 1; i < trace.points.length; i++) {
            const a = trace.points[i - 1], b = trace.points[i];
            const start = new THREE.Vector3(a[0], -a[1], (trace.back ? -1 : 1) * (data.thickness / 2 + (trace.silk ? 0.045 : 0.012)));
            const end = new THREE.Vector3(b[0], -b[1], start.z), delta = end.clone().sub(start);
            if (delta.length() < 1e-6) continue;
            const mesh = new THREE.Mesh(strokeGeometry(delta.length(), trace.width), trace.silk ? silk : track);
            mesh.position.copy(start.add(end).multiplyScalar(0.5));
            mesh.rotation.z = Math.atan2(delta.y, delta.x);
            if (trace.back) mesh.rotateX(Math.PI);
            assembly.add(mesh);
        }
    }
    // Batch flat copper and silkscreen so large routed boards need few draw calls.
    for (const material of [copper, track, silk]) {
        const meshes = assembly.children.filter((item): item is THREE.Mesh => item instanceof THREE.Mesh && item.material === material);
        if (!meshes.length) continue;
        const originals = new Set<THREE.BufferGeometry>();
        const geometries = meshes.map(mesh => {
            mesh.updateMatrix(); originals.add(mesh.geometry); assembly.remove(mesh);
            return mesh.geometry.clone().applyMatrix4(mesh.matrix);
        });
        const merged = mergeGeometries(geometries);
        if (merged) (material === silk ? silkscreen : assembly).add(new THREE.Mesh(merged, material));
        geometries.forEach(g => g.dispose()); originals.forEach(g => g.dispose());
    }
    updateBounds();
    const resize = () => {
        if (!viewport.clientWidth || !viewport.clientHeight) return;
        renderer.setSize(viewport.clientWidth, viewport.clientHeight);
        camera.aspect = viewport.clientWidth / viewport.clientHeight; camera.updateProjectionMatrix(); draw();
    };
    const observer = new ResizeObserver(resize); observer.observe(viewport);
    const fit = (view = 'iso', persist = true) => {
        const box = new THREE.Box3().setFromObject(assembly);
        const center = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
        const size = box.isEmpty() ? 20 : Math.max(1, box.getSize(new THREE.Vector3()).length());
        const distance = size / (2 * Math.tan(radians(camera.fov / 2))) / Math.min(1, camera.aspect) * 1.15;
        const direction = view === 'top' ? new THREE.Vector3(0, -0.001, 1) : view === 'bottom' ? new THREE.Vector3(0, 0.001, -1) : new THREE.Vector3(0.7, -1, 1);
        camera.position.copy(center).add(direction.normalize().multiplyScalar(distance));
        controls.target.copy(center); controls.update(); draw();
        if (persist) options.persist({ position: camera.position.toArray(), target: controls.target.toArray() });
    };
    resize(); fit('iso', false);
    if (options.state && [options.state.position, options.state.target].every(v => v?.length === 3 && v.every(Number.isFinite))) {
        camera.position.fromArray(options.state.position); controls.target.fromArray(options.state.target); controls.update();
    }
    const listeners = new AbortController();
    container.querySelectorAll<HTMLButtonElement>('[data-three-view]').forEach(button => button.addEventListener('click', () => { userMoved = true; fit(button.dataset.threeView); }, { signal: listeners.signal }));
    container.querySelector<HTMLInputElement>('[name=three-models]')!.addEventListener('change', event => {
        models.visible = (event.target as HTMLInputElement).checked; draw();
    }, { signal: listeners.signal });
    container.querySelector<HTMLInputElement>('[name=three-silkscreen]')!.addEventListener('change', event => {
        silkscreen.visible = (event.target as HTMLInputElement).checked; draw();
    }, { signal: listeners.signal });
    const pending = new Map<string, { resolve: (value: { bytes: number[]; format: string }) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
    const session = Math.random().toString(36).slice(2);
    window.addEventListener('message', event => {
        if (event.data?.type !== 'model3dResult') return;
        const request = pending.get(event.data.requestId); if (!request) return;
        pending.delete(event.data.requestId); clearTimeout(request.timer);
        if (event.data.error) request.reject(new Error(event.data.error)); else request.resolve(event.data);
    }, { signal: listeners.signal });
    function requestModel(index: number): Promise<{ bytes: number[]; format: string }> {
        return new Promise((resolve, reject) => {
            const requestId = `${session}:${index}`;
            const timer = setTimeout(() => { pending.delete(requestId); reject(new Error('Model read timed out.')); }, 45000);
            pending.set(requestId, { resolve, reject, timer });
            options.postMessage({ type: 'load3dModel', index, requestId });
        });
    }
    let worker: Worker | undefined, workerReady: Promise<Worker> | undefined;
    let stepReject: ((error: Error) => void) | undefined;
    async function step(bytes: Uint8Array): Promise<THREE.Group> {
        workerReady ??= Promise.all([fetch(options.workerUrl).then(r => { if (!r.ok) throw new Error('STEP worker unavailable'); return r.text(); }),
            fetch(options.wasmUrl).then(r => { if (!r.ok) throw new Error('STEP parser unavailable'); return r.arrayBuffer(); })]).then(([source, wasm]) => {
            if (disposed) throw new Error('Preview closed');
            const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
            try { worker = new Worker(url); } finally { URL.revokeObjectURL(url); }
            worker.postMessage({ type: 'init', wasm }, [wasm]); return worker;
        });
        const current = await workerReady;
        const result = await new Promise<any>((resolve, reject) => {
            const timer = setTimeout(() => { current.terminate(); workerReady = undefined; stepReject = undefined; reject(new Error('STEP conversion exceeded 90 seconds.')); }, 90000);
            const fail = (error: Error) => { clearTimeout(timer); stepReject = undefined; reject(error); };
            stepReject = fail;
            current.onmessage = event => { clearTimeout(timer); stepReject = undefined; event.data.error ? reject(new Error(event.data.error)) : resolve(event.data); };
            current.onerror = event => { current.terminate(); workerReady = undefined; fail(new Error(event.message || 'STEP worker failed')); };
            current.postMessage({ type: 'step', bytes }, [bytes.buffer]);
        });
        if (!result.success || !result.meshes?.length) throw new Error('No geometry could be read from the STEP model.');
        const group = new THREE.Group();
        for (const part of result.meshes) {
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(part.attributes.position.array, 3));
            geometry.setIndex(part.index.array);
            if (part.attributes.normal) geometry.setAttribute('normal', new THREE.Float32BufferAttribute(part.attributes.normal.array, 3)); else geometry.computeVertexNormals();
            const material = (color: number[]) => new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(...color as [number, number, number], THREE.SRGBColorSpace), metalness: 0.15, roughness: 0.55 });
            const materials = [material(part.color ?? [0.65, 0.67, 0.69])];
            const faces = part.brep_faces ?? [];
            let cursor = 0;
            for (const face of faces) {
                if (!face.color) continue;
                const start = face.first * 3, count = (face.last - face.first + 1) * 3;
                if (start > cursor) geometry.addGroup(cursor, start - cursor, 0);
                materials.push(material(face.color)); geometry.addGroup(start, count, materials.length - 1); cursor = start + count;
            }
            if (cursor < part.index.array.length) geometry.addGroup(cursor, part.index.array.length - cursor, 0);
            group.add(new THREE.Mesh(geometry, materials));
        }
        return group;
    }
    const cache = new Map<string, THREE.Object3D>();
    const failures = new Map<string, string>();
    let loaded = 0;
    const messages = [...data.warnings];
    const report = () => {
        status.textContent = `Models: ${loaded}/${data.models.length}${failures.size ? ` · ${failures.size} file(s) unavailable` : ''}`;
        details.textContent = [...messages, ...Array.from(failures, ([name, error]) => `${name}: ${error}`)].join('\n');
        details.hidden = !details.textContent;
    };
    report();
    void (async () => {
        for (const [index, ref] of data.models.entries()) {
            if (disposed) break;
            try {
                if (failures.has(ref.path)) continue;
                let object = cache.get(ref.path);
                if (!object) {
                    status.textContent = `Loading model ${index + 1}/${data.models.length}: ${ref.path}`;
                    const response = await requestModel(index);
                    if (disposed) break;
                    if (response.format === 'wrl') {
                        const text = new TextDecoder().decode(new Uint8Array(response.bytes));
                        if (!/^#VRML V2\.0/m.test(text)) throw new Error('Only VRML 2.0 models are supported.');
                        // PCB model geometry is local. Never fetch URLs embedded in VRML files.
                        if (/\b(?:Inline|ImageTexture|MovieTexture|AudioClip)\s*\{/.test(text)) throw new Error('External VRML resources are unsupported. Use a self-contained model.');
                        object = new VRMLLoader().parse(text, '');
                        object.scale.multiplyScalar(2.54); // KiCad WRL library units: 0.1 inch.
                    } else object = await step(new Uint8Array(response.bytes));
                    cache.set(ref.path, object);
                }
                if (disposed) break;
                models.add(placeModel(object.clone(true), ref, data.thickness)); loaded++; updateBounds(); draw();
            } catch (error) { if (!disposed) failures.set(ref.path, String((error as Error).message ?? error)); }
            if (!disposed) report();
            await new Promise(resolve => setTimeout(resolve, 0));
        }
        if (!disposed && !userMoved && !options.state) fit();
    })();
    return {
        setActive(value: boolean) { active = value; controls.enabled = value; if (value) { resize(); draw(); } },
        dispose() {
            disposed = true; listeners.abort(); observer.disconnect(); controls.dispose(); worker?.terminate(); stepReject?.(new Error('Preview closed'));
            for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error('Preview closed')); } pending.clear();
            const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
            const collect = (object: THREE.Object3D) => object.traverse(item => {
                const mesh = item as THREE.Mesh;
                if (mesh.geometry) geometries.add(mesh.geometry);
                if (mesh.material) (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(m => materials.add(m));
            });
            collect(scene); cache.forEach(collect);
            geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
            renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
        }
    };
}
