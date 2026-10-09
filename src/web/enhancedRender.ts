import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

const vertexShader = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const depthFunctions = /* glsl */`
    uniform sampler2D sceneDepth;
    uniform mat4 inverseProjection;
    uniform float cameraFar;
    float viewDistance(vec2 uv) {
        return exp2(texture2D(sceneDepth, uv).r * log2(cameraFar + 1.0)) - 1.0;
    }
    vec3 viewPosition(vec2 uv) {
        vec4 ray = inverseProjection * vec4(uv * 2.0 - 1.0, 0.0, 1.0);
        return ray.xyz * (-viewDistance(uv) / ray.z);
    }
`;

/** On-demand raster rendering. No accumulation loop or scene BVH is needed. */
export class EnhancedRender {
    private color: THREE.WebGLRenderTarget;
    private ao = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
    private occlusion: FullScreenQuad;
    private composite: FullScreenQuad;
    private environment?: THREE.WebGLRenderTarget;
    private materials = new Map<THREE.Material, THREE.Material>();
    private originals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
    private shadowsDirty = true;
    private enabled = false;
    private environmentReady = false;
    private ambientLights: { light: THREE.HemisphereLight; intensity: number }[];
    constructor(private renderer: THREE.WebGLRenderer, private scene: THREE.Scene,
        private assembly: THREE.Group, private camera: THREE.PerspectiveCamera,
        private lights: THREE.DirectionalLight[]) {
        this.ambientLights = scene.children.filter((item): item is THREE.HemisphereLight => item instanceof THREE.HemisphereLight)
            .map(light => ({ light, intensity: light.intensity }));
        // Keep stencil clipping and physical-pixel MSAA for copper/silkscreen.
        const depth = new THREE.DepthTexture(1, 1, THREE.UnsignedInt248Type);
        depth.format = THREE.DepthStencilFormat;
        this.color = new THREE.WebGLRenderTarget(1, 1, {
            depthBuffer: true, stencilBuffer: true, depthTexture: depth,
            type: renderer.extensions.has('EXT_color_buffer_float') ? THREE.HalfFloatType : THREE.UnsignedByteType,
            samples: Math.min(4, renderer.capabilities.maxSamples)
        });
        const depthUniforms = () => ({ sceneDepth: { value: depth },
            inverseProjection: { value: camera.projectionMatrixInverse }, cameraFar: { value: camera.far } });
        this.occlusion = new FullScreenQuad(new THREE.ShaderMaterial({
            vertexShader, depthTest: false, depthWrite: false, toneMapped: false,
            uniforms: { ...depthUniforms(), pixelSize: { value: new THREE.Vector2() }, radius: { value: 1 } },
            fragmentShader: /* glsl */`
                varying vec2 vUv;
                uniform vec2 pixelSize;
                uniform float radius;
                ${depthFunctions}
                void main() {
                    if (texture2D(sceneDepth, vUv).r >= 1.0) { gl_FragColor = vec4(1.0); return; }
                    vec3 p = viewPosition(vUv);
                    vec3 l = viewPosition(vUv - vec2(pixelSize.x, 0.0));
                    vec3 r = viewPosition(vUv + vec2(pixelSize.x, 0.0));
                    vec3 b = viewPosition(vUv - vec2(0.0, pixelSize.y));
                    vec3 t = viewPosition(vUv + vec2(0.0, pixelSize.y));
                    vec3 dx = abs(l.z-p.z) < abs(r.z-p.z) ? p-l : r-p;
                    vec3 dy = abs(b.z-p.z) < abs(t.z-p.z) ? p-b : t-p;
                    vec3 n = normalize(cross(dx, dy));
                    if (dot(n, -p) < 0.0) n = -n;
                    vec2 screenRadius = radius / max(-p.z, 0.01) / vec2(inverseProjection[0][0], inverseProjection[1][1]) * 0.5;
                    float blocked = 0.0;
                    for (int i = 0; i < 16; i++) {
                        float angle = float(i) * 2.39996323;
                        float ring = sqrt((float(i) + 0.5) / 16.0);
                        vec2 uv = vUv + vec2(cos(angle), sin(angle)) * screenRadius * ring;
                        if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0))) || texture2D(sceneDepth, uv).r >= 1.0) continue;
                        vec3 delta = viewPosition(uv) - p;
                        float d = length(delta);
                        float above = max(dot(n, delta) - radius * 0.015, 0.0) / max(d, 0.00001);
                        blocked += above * (1.0 - smoothstep(radius * 0.2, radius, d));
                    }
                    float visibility = clamp(1.0 - blocked * (2.4 / 16.0), 0.48, 1.0);
                    gl_FragColor = vec4(vec3(visibility), 1.0);
                }
            `
        }));
        this.composite = new FullScreenQuad(new THREE.ShaderMaterial({
            vertexShader, depthTest: false, depthWrite: false, premultipliedAlpha: true,
            uniforms: { ...depthUniforms(), sceneColor: { value: this.color.texture },
                occlusion: { value: this.ao.texture }, aoPixel: { value: new THREE.Vector2() },
                backgroundColor: { value: new THREE.Color() }, backgroundAlpha: { value: 1 } },
            fragmentShader: /* glsl */`
                varying vec2 vUv;
                uniform sampler2D sceneColor, occlusion;
                uniform vec2 aoPixel;
                uniform vec3 backgroundColor;
                uniform float backgroundAlpha;
                ${depthFunctions}
                void main() {
                    float center = viewDistance(vUv), sum = 0.0, weights = 0.0;
                    for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) {
                        vec2 uv = clamp(vUv + vec2(float(x), float(y)) * aoPixel, vec2(0.0), vec2(1.0));
                        float weight = exp(-abs(viewDistance(uv) - center) / max(0.01, center * 0.0005));
                        sum += texture2D(occlusion, uv).r * weight;
                        weights += weight;
                    }
                    // Filter only occlusion: text and component colors stay sharp.
                    vec4 sampleColor = texture2D(sceneColor, vUv);
                    // Unpremultiply before tone mapping to preserve transparent MSAA edges.
                    vec3 color = sampleColor.rgb / max(sampleColor.a, 0.0001) * (sum / max(weights, 0.0001));
                    gl_FragColor = vec4(color, sampleColor.a);
                    #include <tonemapping_fragment>
                    #include <colorspace_fragment>
                    #include <premultiplied_alpha_fragment>
                    // Match the normal renderer's clear color: only scene objects
                    // receive tone mapping. Composite the background after it,
                    // including partial MSAA coverage at silhouette edges.
                    vec3 background = linearToOutputTexel(vec4(backgroundColor, 1.0)).rgb;
                    float backgroundCoverage = backgroundAlpha * (1.0 - sampleColor.a);
                    gl_FragColor.rgb += background * backgroundCoverage;
                    gl_FragColor.a += backgroundCoverage;
                }
            `
        }));
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.shadowMap.autoUpdate = false;
        for (const light of lights) {
            light.shadow.mapSize.set(2048, 2048);
            light.shadow.bias = -0.00008;
            scene.add(light.target);
        }
    }

    private material(original: THREE.Material): THREE.Material {
        let result = this.materials.get(original);
        if (result) return result;
        if (original instanceof THREE.MeshPhongMaterial) {
            const shininess = original.shininess <= 1 ? original.shininess * 128 : original.shininess;
            result = new THREE.MeshStandardMaterial({ color: original.color, emissive: original.emissive,
                roughness: THREE.MathUtils.clamp(Math.pow(2 / (shininess + 2), 0.25), 0.25, 0.8), metalness: 0,
                opacity: original.opacity, transparent: original.transparent, alphaTest: original.alphaTest,
                side: original.side, vertexColors: original.vertexColors, flatShading: original.flatShading,
                map: original.map, normalMap: original.normalMap, alphaMap: original.alphaMap });
        } else if (original instanceof THREE.MeshStandardMaterial) {
            const physical = original.clone();
            if (original.userData.kilensSurface === 'soldermask') {
                physical.envMapIntensity = 0.25; physical.roughness = 0.5;
            }
            if (original.userData.kilensSurface === 'copper') {
                physical.metalness = 0.8; physical.roughness = 0.3;
            }
            result = physical;
        } else result = original;
        this.materials.set(original, result);
        return result;
    }

    setEnabled(enabled: boolean) {
        if (enabled !== this.enabled) this.shadowsDirty = true;
        this.enabled = enabled;
        this.renderer.shadowMap.enabled = enabled;
        this.scene.environment = enabled ? this.environment?.texture ?? null : null;
        this.scene.environmentIntensity = 0.4;
        this.ambientLights.forEach(({ light, intensity }) => { light.intensity = enabled ? intensity * 0.55 : intensity; });
        this.lights.forEach(light => { light.castShadow = enabled; });
        if (!enabled) this.originals.forEach((material, mesh) => { mesh.material = material; });
    }

    invalidate() { this.shadowsDirty = true; }

    render(bounds: THREE.Sphere, ambientOcclusion = true) {
        const { renderer, scene, camera } = this;
        if (!this.environmentReady) {
            this.environmentReady = true;
            if (renderer.extensions.has('EXT_color_buffer_float')) {
                const room = new RoomEnvironment(), generator = new THREE.PMREMGenerator(renderer);
                try { this.environment = generator.fromScene(room, 0.04); }
                finally { room.dispose(); generator.dispose(); }
            }
        }
        this.setEnabled(true);
        if (this.shadowsDirty) {
            this.assembly.traverse(object => {
                if (!(object instanceof THREE.Mesh)) return;
                // Temporary estimated bodies own their materials and are removed
                // as models arrive. Do not retain them in enhancement caches.
                if (object.userData.kilensPlaceholder) {
                    object.castShadow = true; object.receiveShadow = true; return;
                }
                const original: THREE.Material | THREE.Material[] = this.originals.get(object) ?? object.material;
                this.originals.set(object, original);
                const list = Array.isArray(original) ? original : [original];
                object.material = Array.isArray(original) ? list.map(m => this.material(m)) : this.material(original);
                object.castShadow = list.some(m => m.colorWrite && !m.userData.kilensArtwork);
                object.receiveShadow = true;
            });
            const r = Math.max(1, bounds.radius);
            this.lights.forEach((light, index) => {
                light.position.copy(bounds.center).addScaledVector(new THREE.Vector3(index ? 0.8 : -0.8, index ? 1.2 : -1.2, index ? -1.8 : 1.8), r * 2);
                light.target.position.copy(bounds.center); light.target.updateMatrixWorld();
                const shadow = light.shadow.camera;
                shadow.left = shadow.bottom = -r * 1.15; shadow.right = shadow.top = r * 1.15;
                shadow.near = 0.1; shadow.far = r * 8; shadow.updateProjectionMatrix();
                light.shadow.normalBias = Math.max(0.002, r * 0.0002);
            });
            renderer.shadowMap.needsUpdate = true;
            this.shadowsDirty = false;
        }
        const size = renderer.getDrawingBufferSize(new THREE.Vector2());
        if (size.x !== this.color.width || size.y !== this.color.height) {
            this.color.setSize(size.x, size.y);
            this.ao.setSize(Math.max(1, Math.ceil(size.x / 2)), Math.max(1, Math.ceil(size.y / 2)));
        }
        const ao = this.occlusion.material as THREE.ShaderMaterial, composite = this.composite.material as THREE.ShaderMaterial;
        ao.uniforms.pixelSize.value.set(1 / size.x, 1 / size.y);
        ao.uniforms.radius.value = THREE.MathUtils.clamp(bounds.radius * 0.08, 0.3, 3);
        ao.uniforms.cameraFar.value = composite.uniforms.cameraFar.value = camera.far;
        composite.uniforms.aoPixel.value.set(1 / this.ao.width, 1 / this.ao.height);
        const target = renderer.getRenderTarget(), mapping = renderer.toneMapping, exposure = renderer.toneMappingExposure;
        const clearColor = renderer.getClearColor(new THREE.Color()), clearAlpha = renderer.getClearAlpha();
        composite.uniforms.backgroundColor.value.copy(clearColor);
        composite.uniforms.backgroundAlpha.value = clearAlpha;
        try {
            renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.08;
            renderer.setClearColor(0x000000, 0);
            renderer.setRenderTarget(this.color); renderer.render(scene, camera);
            renderer.setClearColor(clearColor, clearAlpha);
            renderer.setRenderTarget(this.ao);
            if (ambientOcclusion) this.occlusion.render(renderer);
            else {
                const clear = renderer.getClearColor(new THREE.Color()), alpha = renderer.getClearAlpha();
                renderer.setClearColor(0xffffff, 1); renderer.clear(); renderer.setClearColor(clear, alpha);
            }
            renderer.setRenderTarget(target); this.composite.render(renderer);
        } finally {
            renderer.setClearColor(clearColor, clearAlpha);
            renderer.setRenderTarget(target); renderer.toneMapping = mapping; renderer.toneMappingExposure = exposure;
        }
    }

    dispose() {
        this.setEnabled(false);
        this.materials.forEach((material, original) => { if (material !== original) material.dispose(); });
        this.materials.clear(); this.originals.clear();
        this.environment?.dispose(); this.color.dispose(); this.ao.dispose();
        this.occlusion.material.dispose(); this.occlusion.dispose(); this.composite.material.dispose(); this.composite.dispose();
        this.lights.forEach(light => { light.shadow.dispose(); });
    }
}
