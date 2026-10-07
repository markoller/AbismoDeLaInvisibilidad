import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {game} from './game.js';
import {math} from './math.js';
import {noise} from './noise.js';
import {spline} from './spline.js';

import {assets} from './assets.js';
import {scatter} from './scatter.js';
import {ASSET_CATALOG} from './catalog.js';

let _APP = null;

//Configuraciones

const _IS_MOBILE = window.matchMedia('(pointer: coarse)').matches ||
    Math.min(window.innerWidth, window.innerHeight) < 600;

const _CONFIG = {
    chunkSize: 256,                        
    segments: _IS_MOBILE ? 32 : 64,        
    viewRadius: _IS_MOBILE ? 4 : 6,        
    buildBudgetMs: _IS_MOBILE ? 4 : 8,     
    propRadius: _IS_MOBILE ? 3 : 4,
    propBudgetMs: _IS_MOBILE ? 3 : 4,
    autoFlySpeed: 30,                      
    skyColour: 0x0b3a52,
};

function _GetSeed() {
    const s = new URLSearchParams(window.location.search).get('seed');
    if (s !== null && s !== '') {
        const n = Number(s);
        if (Number.isFinite(n)) {
            return Math.floor(n);
        }
        let h = 0;
        for (let i = 0; i < s.length; i++) {
            h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
        }
        return h;
    }
    return Math.floor(Math.random() * 2147483647);
}

const _NOISE_PARAMS = {
    octaves: 6,
    persistence: 1.0,
    lacunarity: 2.0,
    exponentiation: 2.5,
    contrast: 2.0,
    height: 320.0,
    scale: 700.0,
    seed: _GetSeed(),
};

//Chunk

const _ROCK = new THREE.Color(0x2f3a40);

class TerrainChunk {
    constructor(params) {
        this._params = params;
        this._Init();
    }

    _Init() {
        const {cx, cz, size, segments, generator, colourSpline, maxHeight} = this._params;
        const step = size / segments;
        const n = segments + 1;           // vertices por lado
        const m = segments + 3;           // alturas por lado, con 1 vertice de borde
        const ox = cx * size;
        const oz = cz * size;

    // 1) Alturas (incluyendo borde, para calcular normales sin costuras entre chunks).
        const heights = new Float32Array(m * m);
        for (let j = 0; j < m; j++) {
            for (let i = 0; i < m; i++) {
                heights[j * m + i] = generator.Get(ox + (i - 1) * step, oz + (j - 1) * step);
        }
    }

    // 2) Vertices, normales y colores
    const positions = new Float32Array(n * n * 3);
    const normals = new Float32Array(n * n * 3);
    const colours = new Float32Array(n * n * 3);
    const tmp = new THREE.Color();

    for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
            const h = heights[(j + 1) * m + (i + 1)];
            const hL = heights[(j + 1) * m + i];
            const hR = heights[(j + 1) * m + i + 2];
            const hD = heights[j * m + (i + 1)];
            const hU = heights[(j + 2) * m + (i + 1)];

            let nx = hL - hR;
            let ny = 2.0 * step;
            let nz = hD - hU;
            const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
            nx /= len; ny /= len; nz /= len;

            const idx = (j * n + i) * 3;
            positions[idx] = i * step;
            positions[idx + 1] = h;
            positions[idx + 2] = j * step;
            normals[idx] = nx;
            normals[idx + 1] = ny;
            normals[idx + 2] = nz;

            // Color por altura (spline) + roca en pendientes fuertes
            tmp.copy(colourSpline.Get(h / maxHeight));
            const steep = math.sat((0.8 - ny) / 0.25);
            tmp.lerp(_ROCK, steep);
            colours[idx] = tmp.r;
            colours[idx + 1] = tmp.g;
            colours[idx + 2] = tmp.b;
        }
    }

    // 3) Indices (triangulos con cara hacia +Y)
    const indices = new (n * n > 65535 ? Uint32Array : Uint16Array)(segments * segments * 6);
    let k = 0;
    for (let j = 0; j < segments; j++) {
        for (let i = 0; i < segments; i++) {
            const a = j * n + i;
            const b = a + 1;
            const c = a + n;
            const d = c + 1;
            indices[k++] = a; indices[k++] = c; indices[k++] = b;
            indices[k++] = b; indices[k++] = c; indices[k++] = d;
        }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
    geometry.computeBoundingSphere();

    this._mesh = new THREE.Mesh(geometry, this._params.material);
    this._mesh.position.set(ox, 0, oz);
    this._params.scene.add(this._mesh);
    }

    Destroy() {
        this._params.scene.remove(this._mesh);
        this._mesh.geometry.dispose();  
    }
}

// Crear y destruir chunks

    class TerrainChunkManager {
    constructor(params) {
        this._scene = params.scene;
        this._camera = params.camera;
        this._focus = params.focus || null;
        this._Init();
    }

    _Init() {
        const size = _CONFIG.chunkSize;

        // Perlin Noise
        this._generator = new noise.Noise(_NOISE_PARAMS);
        console.log('Seed del mundo:', _NOISE_PARAMS.seed);

        // Colores
        const _colourLerp = (t, p0, p1) => p0.clone().lerp(p1, t);
        this._colourSpline = new spline.LinearSpline(_colourLerp);
        this._colourSpline.AddPoint(0.00, new THREE.Color(0x3b4a45));  // fondo
        this._colourSpline.AddPoint(0.06, new THREE.Color(0x4f6b62));  // sedimento
        this._colourSpline.AddPoint(0.30, new THREE.Color(0x2c4a52));  // medio
        this._colourSpline.AddPoint(0.55, new THREE.Color(0x33414a));  // roca oscura
        this._colourSpline.AddPoint(0.75, new THREE.Color(0x5a6b73));  // punta más alta

        this._material = new THREE.MeshStandardMaterial({
        color: 0xFFFFFF,
        vertexColors: true,
        roughness: 1.0,
        metalness: 0.0,
        });

        // Niebla: esconde el borde donde aparecen los chunks nuevos
        const far = _CONFIG.viewRadius * size * 0.95;
        this._scene.background = new THREE.Color(_CONFIG.skyColour);
        this._scene.fog = new THREE.Fog(_CONFIG.skyColour, far * 0.05, far * 0.7);
        this._camera.far = far * 1.5;
        this._camera.updateProjectionMatrix();

        this._chunks = {};
        this._pending = [];
        this._cx = null;
        this._cz = null;

        //Assets: biblioteca de modelos y generador de obejtos
        this._library = new assets.AssetLibrary(ASSET_CATALOG);
        this._library.Load();
        this._props = new scatter.PropScatter({
            scene: this._scene,
            library: this._library,
            catalog: ASSET_CATALOG,
            seed: _NOISE_PARAMS.seed,
            heightAt: (x, z) => this._generator.Get(x, z),
            heightMax: _NOISE_PARAMS.height,
            chunkSize: _CONFIG.chunkSize,
            radius: _CONFIG.propRadius,
            budgetMs: _CONFIG.propBudgetMs,
        });
    }

    _Key(x, z) {
        return x + '.' + z;
    }

    _Refresh() {
        const R = _CONFIG.viewRadius;

        // Destruir chunks lejanos
        for (let k in this._chunks) {
        const c = this._chunks[k];
        if (Math.hypot(c.cx - this._cx, c.cz - this._cz) > R + 1.5) {
            c.chunk.Destroy();
            delete this._chunks[k];
        }
        }

        this._pending = [];
        for (let dx = -R; dx <= R; dx++) {
        for (let dz = -R; dz <= R; dz++) {
            const d = Math.hypot(dx, dz);
            const x = this._cx + dx;
            const z = this._cz + dz;
            if (d <= R && !(this._Key(x, z) in this._chunks)) {
            this._pending.push({cx: x, cz: z, d: d});
            }
        }
        }
        this._pending.sort((a, b) => b.d - a.d);
    }

    _AddChunk(cx, cz) {
        const chunk = new TerrainChunk({
        scene: this._scene,
        material: this._material,
        generator: this._generator,
        colourSpline: this._colourSpline,
        maxHeight: _NOISE_PARAMS.height,
        cx: cx,
        cz: cz,
        size: _CONFIG.chunkSize,
        segments: _CONFIG.segments,
        });
        this._chunks[this._Key(cx, cz)] = {chunk: chunk, cx: cx, cz: cz};
    }

    Update(timeInSeconds) {
        const p = this._camera.position;
        const cx = Math.floor(p.x / _CONFIG.chunkSize);
        const cz = Math.floor(p.z / _CONFIG.chunkSize);
        if (cx !== this._cx || cz !== this._cz) {
            this._cx = cx;
            this._cz = cz;
            this._Refresh();
        }

        const start = performance.now();
        while (this._pending.length > 0) {
            const next = this._pending.pop();
            this._AddChunk(next.cx, next.cz);
            if (performance.now() - start > _CONFIG.buildBudgetMs) {
                break;
            }
        }

        const f = this._focus ? this._focus() : p;
        this._props.Update(Math.floor(f.x / _CONFIG.chunkSize), Math.floor(f.z / _CONFIG.chunkSize));
    }
}

//App (movimiento de cámara)

    class ProceduralTerrain_Demo extends game.Game {
    constructor() {
        super();
    }

    _OnInitialize() {
        this._controls = this._CreateControls();

        this._entities['_terrain'] = new TerrainChunkManager({
        scene: this._graphics.Scene,
        camera: this._graphics.Camera,
        focus: () => this._controls.target,
        });
    }

    _CreateControls() {
        const controls = new OrbitControls(
            this._graphics._camera, this._graphics._threejs.domElement);
        controls.target.set(0, 60, 0);
        controls.object.position.set(0, 380, 600);
        controls.screenSpacePanning = false;        // el paneo se mueve sobre el suelo
        controls.maxPolarAngle = Math.PI * 0.49;    // no pasar por debajo del horizonte
        controls.minDistance = 50;
        controls.maxDistance = 1200;
        controls.update();

        // El vuelo automatico se pausa mientras el usuario toca/arrastra
        this._interacting = false;
        controls.addEventListener('start', () => { this._interacting = true; });
        controls.addEventListener('end', () => { this._interacting = false; });
        return controls;
    }

    _OnStep(timeInSeconds) {
        // Vuelo automatico hacia adelante: camara y objetivo se mueven juntos
        if (_CONFIG.autoFlySpeed > 0 && !this._interacting) {
        const dir = new THREE.Vector3().subVectors(
            this._controls.target, this._controls.object.position);
        dir.y = 0;
        if (dir.lengthSq() > 1e-6) {
            dir.normalize().multiplyScalar(_CONFIG.autoFlySpeed * timeInSeconds);
            this._controls.object.position.add(dir);
            this._controls.target.add(dir);
        }
        }
        this._controls.update();
    }
    }


    function _Main() {
    _APP = new ProceduralTerrain_Demo();
    }

    _Main();

