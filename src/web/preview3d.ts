import * as THREE from 'three';
import { EnhancedRender } from './enhancedRender';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { VRMLLoader } from 'three/examples/jsm/loaders/VRMLLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ModelReference, Pad3d, parseBoard3d, Point } from './board3dData';
import { textStrokes } from './strokeText';
export { textStrokes } from './strokeText';

interface Options {
    container: HTMLElement; source: string; workerUrl: string; wasmUrl: string;
    postMessage: (message: unknown) => void;
    state?: { position: number[]; target: number[] };
    persist: (state: { position: number[]; target: number[] }) => void;
    enhanced?: boolean;
    persistEnhanced: (enabled: boolean) => void;
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
export function copperZoneGeometry(points: Point[], back: boolean): THREE.ShapeGeometry {
    const geometry = new THREE.ShapeGeometry(path(points));
    if (back) {
        const indices = geometry.index!;
        for (let i = 0; i < indices.count; i += 3) {
            const first = indices.getX(i); indices.setX(i, indices.getX(i + 2)); indices.setX(i + 2, first);
        }
        geometry.computeVertexNormals();
    }
    return geometry;
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
export function createModelPlaceholder(ref: ModelReference, thickness: number): THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial> {
    const estimate = ref.placeholder!;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...estimate.size),
        new THREE.MeshStandardMaterial({ color: estimate.color, roughness: 0.85 }));
    // Footprint graphics already contain the back-side mirroring. Model-file
    // rotations, unit corrections and offsets do not apply to these dimensions.
    const center = new THREE.Vector2(estimate.center[0], -estimate.center[1]).rotateAround(new THREE.Vector2(), radians(ref.angle));
    mesh.position.set(ref.position[0] + center.x, -ref.position[1] + center.y,
        (ref.back ? -1 : 1) * (thickness / 2 + estimate.size[2] / 2 + 0.03));
    mesh.rotation.z = radians(ref.angle);
    mesh.userData.kilensPlaceholder = true;
    return mesh;
}
/** A component WRL may include a CAD viewer's environment, not just geometry. */
export function loadWrlModel(text: string): THREE.Object3D {
    if (!/^#VRML V2\.0/m.test(text)) throw new Error('Only VRML 2.0 models are supported.');
    // PCB model geometry is local. Never fetch URLs embedded in VRML files.
    if (/\b(?:Inline|ImageTexture|MovieTexture|AudioClip)\s*\{/.test(text)) throw new Error('External VRML resources are unsupported. Use a self-contained model.');
    const object = new VRMLLoader().parse(text, '');
    const backgrounds: THREE.Object3D[] = [];
    // Three.js r180 marks Background groups this way. Filtering the loader's
    // explicit marker preserves legitimate spheres and large component parts.
    object.traverse(item => { if (item.renderOrder === -Infinity) backgrounds.push(item); });
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    for (const background of backgrounds) {
        background.removeFromParent();
        background.traverse(item => {
            if (!(item instanceof THREE.Mesh)) return;
            geometries.add(item.geometry);
            (Array.isArray(item.material) ? item.material : [item.material]).forEach(material => materials.add(material));
        });
    }
    geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose());
    object.scale.multiplyScalar(2.54); // KiCad WRL library units: 0.1 inch.
    return object;
}
export function usableCameraState(state: Options['state'], bounds: THREE.Sphere): boolean {
    if (!state || ![state.position, state.target].every(v => v?.length === 3 && v.every(Number.isFinite))) return false;
    const position = new THREE.Vector3().fromArray(state.position), target = new THREE.Vector3().fromArray(state.target);
    // Recover cameras saved while a model's background inflated the board bounds.
    const limit = Math.max(1, bounds.radius) * 100;
    return position.distanceTo(target) > 0.001 && position.distanceTo(bounds.center) < limit && target.distanceTo(bounds.center) < limit;
}
export function mount(options: Options) {
    const { container } = options;
    const data = parseBoard3d(options.source);
    const viewport = container.querySelector<HTMLElement>('.three-viewport')!;
    const status = container.querySelector<HTMLElement>('.three-status')!;
    const details = container.querySelector<HTMLElement>('.three-details')!;
    // Logarithmic depth also preserves layer separation when zoomed inside the board bounds.
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, stencil: true, logarithmicDepthBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x101d23, 1);
    viewport.append(renderer.domElement);
    renderer.domElement.style.visibility = 'hidden';
    renderer.domElement.tabIndex = 0;
    renderer.domElement.setAttribute('aria-label', '3D PCB preview: drag to orbit, right-drag to pan, scroll to zoom');
    const scene = new THREE.Scene(), assembly = new THREE.Group(), models = new THREE.Group(), silkscreen = new THREE.Group();
    scene.add(assembly); assembly.add(models, silkscreen);
    // Brighter, slightly cool studio lighting lifts shadows and reduces the warm cast.
    scene.add(new THREE.HemisphereLight(0xf0f5ff, 0x828b99, 3));
    const light = new THREE.DirectionalLight(0xf4f7ff, 3.5); light.position.set(50, -20, 100); scene.add(light);
    const bottomLight = new THREE.DirectionalLight(0xf4f7ff, 2.5); bottomLight.position.set(-30, 40, -70); scene.add(bottomLight);
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1000); camera.up.set(0, 0, 1);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false; controls.enabled = false;
    let disposed = false, active = true, interacting = false, modelsLoading = true, cameraInitialized = false;
    let enhanced: EnhancedRender | undefined;
    const renderToggle = container.querySelector<HTMLInputElement>('[name=three-render]')!;
    renderToggle.checked = options.enhanced === true;
    const renderStatus = container.querySelector<HTMLElement>('.three-render-status')!;
    const boardShapes: THREE.Shape[] = [];
    const bounds = new THREE.Sphere(new THREE.Vector3(), 20);
    const assemblyBounds = new THREE.Box3();
    const updateBounds = () => {
        assemblyBounds.setFromObject(assembly);
        if (!assemblyBounds.isEmpty()) assemblyBounds.getBoundingSphere(bounds);
        enhanced?.invalidate();
    };
    const draw = () => {
        if (disposed || !active || !cameraInitialized || document.hidden) return;
        updateCameraDepth(camera, bounds);
        try {
            if (renderToggle.checked) {
                enhanced ??= new EnhancedRender(renderer, scene, assembly, camera, [light, bottomLight]);
                enhanced.render(bounds, !interacting && !modelsLoading);
            } else {
                enhanced?.setEnabled(false); renderer.render(scene, camera);
            }
        } catch (error) {
            enhanced?.dispose(); enhanced = undefined;
            renderToggle.checked = false; options.persistEnhanced(false);
            renderStatus.hidden = false; renderStatus.textContent = 'Enhanced rendering unavailable. Standard preview restored: ' + String(error);
            renderer.setRenderTarget(null); renderer.setScissorTest(false); renderer.autoClear = true;
            renderer.render(scene, camera);
        }
    };
    controls.addEventListener('change', draw);
    controls.addEventListener('start', () => { interacting = true; draw(); });
    controls.addEventListener('end', () => {
        interacting = false; draw(); options.persist({ position: camera.position.toArray(), target: controls.target.toArray() });
    });
    renderer.domElement.addEventListener('webglcontextlost', event => {
        renderToggle.disabled = true; renderStatus.hidden = true;
        event.preventDefault(); status.hidden = false; status.textContent = 'Graphics context lost. Return to 2D and refresh the preview.';
    });
    const green = new THREE.MeshStandardMaterial({ color: 0x153b1b, roughness: 0.65, side: THREE.DoubleSide });
    const edge = new THREE.MeshStandardMaterial({ color: 0xbba878, roughness: 0.85 });
    const copper = new THREE.MeshStandardMaterial({ color: 0xcdb77d, metalness: 0.5, roughness: 0.38, side: THREE.DoubleSide });
    const track = new THREE.MeshStandardMaterial({ color: 0x234c25, roughness: 0.6 });
    const silk = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.7 });
    green.userData.kilensSurface = 'soldermask'; track.userData.kilensSurface = 'soldermask';
    copper.userData.kilensSurface = 'copper'; silk.userData.kilensSurface = 'silkscreen';
    for (const material of [copper, track, silk]) material.userData.kilensArtwork = true;
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
        boardShapes.push(shape);
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
    for (const polygon of data.copperPolygons) {
        // Copper beneath solder mask, below tracks and exposed pads. Reuse the
        // artwork material so batching and board/drill clipping work in both renderers.
        const mesh = new THREE.Mesh(copperZoneGeometry(polygon.points, polygon.back), track);
        mesh.position.z = (polygon.back ? -1 : 1) * (data.thickness / 2 + 0.008);
        assembly.add(mesh);
    }
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
            for (const points of textStrokes(text)) data.traces.push({ points, width: text.width, back: text.back, silk: true });
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
    const placeholders = new Map<number, ReturnType<typeof createModelPlaceholder>>();
    for (const ref of data.models) {
        if (!ref.placeholder || placeholders.has(ref.placeholder.footprint)) continue;
        const placeholder = createModelPlaceholder(ref, data.thickness);
        placeholders.set(ref.placeholder.footprint, placeholder); models.add(placeholder);
    }
    resize();
    updateBounds();
    if (usableCameraState(options.state, bounds) && options.state) {
        camera.position.fromArray(options.state.position); controls.target.fromArray(options.state.target); controls.update();
    } else fit('iso');
    cameraInitialized = true; controls.enabled = active;
    renderer.domElement.style.visibility = 'visible';
    draw();
    const listeners = new AbortController();
    renderToggle.addEventListener('change', () => {
        options.persistEnhanced(renderToggle.checked); renderStatus.hidden = true; draw();
    }, { signal: listeners.signal });
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) draw();
    }, { signal: listeners.signal });
    container.querySelectorAll<HTMLButtonElement>('[data-three-view]').forEach(button => button.addEventListener('click', () => {
        fit(button.dataset.threeView);
    }, { signal: listeners.signal }));
    container.querySelector<HTMLInputElement>('[name=three-models]')!.addEventListener('change', event => {
        models.visible = (event.target as HTMLInputElement).checked; enhanced?.invalidate(); draw();
    }, { signal: listeners.signal });
    container.querySelector<HTMLInputElement>('[name=three-silkscreen]')!.addEventListener('change', event => {
        silkscreen.visible = (event.target as HTMLInputElement).checked; enhanced?.invalidate(); draw();
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
            const defaultColor = part.color ?? [0.65, 0.67, 0.69];
            const materials = [material(defaultColor)];
            const materialIndices = new Map<string, number>([[defaultColor.join(','), 0]]);
            const faces = part.brep_faces ?? [];
            let cursor = 0;
            for (const face of faces) {
                if (!face.color) continue;
                const start = face.first * 3, count = (face.last - face.first + 1) * 3;
                if (start > cursor) geometry.addGroup(cursor, start - cursor, 0);
                const key = face.color.join(',');
                if (!materialIndices.has(key)) { materialIndices.set(key, materials.length); materials.push(material(face.color)); }
                geometry.addGroup(start, count, materialIndices.get(key)!); cursor = start + count;
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
        status.hidden = !modelsLoading && !placeholders.size;
        if (modelsLoading) status.textContent = `Loading 3D models… ${loaded}/${data.models.length} loaded · ${placeholders.size} estimated component(s)`;
        else if (placeholders.size) status.textContent += ` · ${placeholders.size} estimated component(s)`;
        details.textContent = [...(placeholders.size ? ['Colored boxes estimate component size and color from footprint information.'] : []),
            ...messages, ...Array.from(failures, ([name, error]) => `${name}: ${error}`)].join('\n');
        details.hidden = !details.textContent;
    };
    report();
    void (async () => {
        // Read a small window ahead while the single STEP worker converts the
        // current model. Deduplicate paths without buffering the whole library.
        const indices = new Map<string, number>();
        data.models.forEach((ref, index) => { if (!indices.has(ref.path)) indices.set(ref.path, index); });
        const uniqueModels = [...indices];
        type ReadResult = { response: Awaited<ReturnType<typeof requestModel>> } | { error: unknown };
        const reads = new Map<string, Promise<ReadResult>>();
        let nextRead = 0;
        function prefetch() {
            while (!disposed && reads.size < 2 && nextRead < uniqueModels.length) {
                const [path, index] = uniqueModels[nextRead++];
                reads.set(path, requestModel(index).then(response => ({ response }), error => ({ error })));
            }
        }
        // Give the board and estimated bodies a frame before model decoding starts.
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        prefetch();
        for (const [index, ref] of data.models.entries()) {
            if (disposed) break;
            try {
                if (failures.has(ref.path)) continue;
                let object = cache.get(ref.path);
                if (!object) {
                    status.hidden = false;
                    status.textContent = `Loading model ${index + 1}/${data.models.length} · ${placeholders.size} estimated component(s): ${ref.path}`;
                    const result = await reads.get(ref.path)!;
                    reads.delete(ref.path);
                    prefetch();
                    if ('error' in result) throw result.error;
                    const { response } = result;
                    if (disposed) break;
                    if (response.format === 'wrl') {
                        const text = new TextDecoder().decode(new Uint8Array(response.bytes));
                        object = loadWrlModel(text);
                    } else object = await step(new Uint8Array(response.bytes));
                    cache.set(ref.path, object);
                }
                if (disposed) break;
                const placed = placeModel(object.clone(true), ref, data.thickness);
                models.add(placed); loaded++;
                const key = ref.placeholder?.footprint;
                const placeholder = key === undefined ? undefined : placeholders.get(key);
                if (placeholder) {
                    placeholder.removeFromParent(); placeholder.geometry.dispose(); placeholder.material.dispose();
                    placeholders.delete(key!);
                }
                // Expand clipping bounds for the new geometry without traversing
                // the complete board or moving the user's current camera.
                assemblyBounds.union(new THREE.Box3().setFromObject(placed)); assemblyBounds.getBoundingSphere(bounds);
                enhanced?.invalidate(); draw();
            } catch (error) { if (!disposed) failures.set(ref.path, String((error as Error).message ?? error)); }
            if (!disposed) report();
            await new Promise(resolve => setTimeout(resolve, 0));
        }
        modelsLoading = false;
        if (!disposed) {
            // Tighten bounds once after replacement; keep the initial/user camera.
            updateBounds();
            report(); enhanced?.invalidate(); draw();
        }
    })();
    return {
        captureImage() {
            if (disposed || !active || !cameraInitialized || renderer.getContext().isContextLost()) throw new Error('The 3D preview is currently unavailable.');
            const clearColor = renderer.getClearColor(new THREE.Color()), clearAlpha = renderer.getClearAlpha();
            try {
                renderer.setClearColor(0x000000, 0);
                draw();
                return renderer.domElement.toDataURL('image/png');
            } finally {
                renderer.setClearColor(clearColor, clearAlpha);
                draw();
            }
        },
        setActive(value: boolean) { active = value; controls.enabled = value && cameraInitialized; interacting = false; if (value) { resize(); draw(); } },
        dispose() {
            disposed = true; enhanced?.dispose(); listeners.abort(); observer.disconnect(); controls.dispose(); worker?.terminate(); stepReject?.(new Error('Preview closed'));
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
