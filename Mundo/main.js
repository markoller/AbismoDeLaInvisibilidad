import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {game} from './game.js';
import {math} from './math.js';
import {noise} from './noise.js';
import {spline} from './spline.js';

import {assets} from './assets.js';
import {scatter} from './scatter.js';
import {ASSET_CATALOG} from './catalog.js';

import {Modelo} from './cargar-modelo.js';

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
    
    skyColour: "#010610",
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

    async _Init() {
        const size = _CONFIG.chunkSize;

        // Perlin Noise
        this._generator = new noise.Noise(_NOISE_PARAMS);
        console.log('Seed del mundo:', _NOISE_PARAMS.seed);

        // Colores
        const _colourLerp = (t, p0, p1) => p0.clone().lerp(p1, t);
        this._colourSpline = new spline.LinearSpline(_colourLerp);
        this._colourSpline.AddPoint(0.00, new THREE.Color("#273238"));  // fondo
        this._colourSpline.AddPoint(0.06, new THREE.Color("#2E3431"));  // sedimento
        this._colourSpline.AddPoint(0.30, new THREE.Color("#253D44"));  // medio
        this._colourSpline.AddPoint(0.55, new THREE.Color("#2F3F3A"));  // roca oscura
        this._colourSpline.AddPoint(0.75, new THREE.Color("#3F4B51"));  // punta más alta

        this._material = new THREE.MeshStandardMaterial({
        color: 0xFFFFFF,
        vertexColors: true,
        roughness: 1.0,
        metalness: 0.0,
        });

        // Niebla: esconde el borde donde aparecen los chunks nuevos
        const far = _CONFIG.viewRadius * size * 0.75;
        this._scene.background = new THREE.Color(_CONFIG.skyColour);
        this._scene.fog = new THREE.Fog(_CONFIG.skyColour, far * 0.03, far * 0.1);
        this._camera.far = far * 1.0;
        this._camera.updateProjectionMatrix();

        this._chunks = {};
        this._pending = [];
        this._cx = null;
        this._cz = null;

        //Assets: biblioteca de modelos y generador de obejtos
        this._library = new assets.AssetLibrary(ASSET_CATALOG);
        await this._library.Load();
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

    HeightAt(x, z) {
        return this._generator.Get(x, z);
    }

    // Saca 'pos' de los assets que colisionan (todos menos los que no tengan 'collide')
    ResolveCollisions(pos, radius) {
        this._props.Collide(pos, radius);
    }

    // Brillo y desvanecimiento de las selfies segun donde esta el pez
    UpdateSelfies(pos, dt) {
        this._props.UpdateSelfies(pos, dt);
    }

    async Update(timeInSeconds) {
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
        //await new Promise(r => setTimeout(r, 2000));

        this._props.Update(Math.floor(f.x / _CONFIG.chunkSize), Math.floor(f.z / _CONFIG.chunkSize));
    }
}

//App (movimiento del pez y sincronización de cámara)

class ProceduralTerrain_Demo extends game.Game {
    constructor() {
        super();
        this._modeloPez = null;
        this._adelante = 0;
        this._teclaAdelante = false;
    }

   async _OnInitialize() {
        this._controls = this._CreateControls();

        this._entities['_terrain'] = new TerrainChunkManager({
            scene: this._graphics.Scene,
            camera: this._graphics.Camera,
            
            focus: () => (this._modeloPez ? this._modeloPez.modelo_base.position : this._controls.target),
        });

        this._InitInput();
        await this._LoadPez();
        this._InitJoystick();
    }

    

_CreateControls() {
    const controls = new OrbitControls(
        this._graphics._camera,
        this._graphics._threejs.domElement
    );

    controls.minDistance = 5;
    controls.maxDistance = 20;
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.maxPolarAngle = Math.PI / 1.5;
    controls.minPolarAngle = Math.PI / 3;

    if (_IS_MOBILE) {
        controls.enablePan = false;
        controls.touches.ONE = THREE.TOUCH.ROTATE;
        controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;
    }

    controls.update();
    return controls;
}



    _InitInput() {
        window.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') this._teclaAdelante = true;
        });

        window.addEventListener('keyup', (e) => {
            if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') this._teclaAdelante = false;
        });
    }

   
    async _LoadPez() {
        const initialHeight = this._entities['_terrain'].HeightAt(0, 0) + 12;
        this._modeloPez = new Modelo();
        var wasd = new Modelo();
        //await this._modeloPez.init('../Modelos/Pez/pez_animado.glb',this._graphics.Scene,this._graphics._camera);
        await wasd.init('../Modelos/Pez/pez_animado.glb',this._graphics.Scene,this._graphics._camera);
        this._modeloPez = wasd.get();
        //console.log(this._modeloPez);
        this._modeloPez.modelo_base.position.set(0, initialHeight, 0);
        this._modeloPez.modelo_outline.position.set(0, initialHeight, 0);
        // La camara arranca detras y arriba del pez (antes quedaba en (75,20,0), dentro del terreno)
        this._controls.target.copy(this._modeloPez.modelo_base.position).add(new THREE.Vector3(0, 3, 0));
        //this._controls.target.copy(this._modeloPez.modelo_outline.position).add(new THREE.Vector3(0, 3, 0));
        this._graphics._camera.position.set(0, initialHeight + 8, 18);
        this._modeloPez.modelo_base.scale.set(20,20,20);
        this._modeloPez.modelo_outline.scale.set(20.01,20.01,20.01);
        /*const loader = new GLTFLoader();
        loader.load(
            '../Modelos/Pez/pez_abisal.glb',   // la carpeta real es Modelos/Pez/
            (gltf) => {
                this._modeloPez = gltf.scene;
                const initialHeight = this._entities['_terrain'].HeightAt(0, 0) + 12;
                this._modeloPez.position.set(0, initialHeight, 0);
                this._graphics.Scene.add(this._modeloPez);

                // La camara arranca detras y arriba del pez (antes quedaba en (75,20,0), dentro del terreno)
                this._controls.target.copy(this._modeloPez.position).add(new THREE.Vector3(0, 3, 0));
                this._graphics._camera.position.set(0, initialHeight + 8, 18);
            },
            undefined,
            (error) => {
                console.error('Error al cargar el modelo:', error);
            }
        );*/

        setTimeout(() => {
            const zonaJoystick = document.getElementById("joystickZona");
            if (zonaJoystick) {
                zonaJoystick.style.transition = "opacity 1s ease";
                zonaJoystick.style.opacity = "0";
            }
        }, 15000);
    }

    _InitJoystick() {
        const zonaEl = document.getElementById("joystickZona");
        if (!zonaEl) return;

        let stickEl = zonaEl.querySelector('.joystick-stick');
        if (!stickEl) {
            stickEl = document.createElement('div');
            stickEl.className = 'joystick-stick';
            zonaEl.appendChild(stickEl);
        }

        let joystickActive = false;
        const maxRadius = 35;

        zonaEl.addEventListener('pointerdown', (e) => {
            joystickActive = true;
            zonaEl.setPointerCapture(e.pointerId); 
            e.stopPropagation();
            e.preventDefault();
            this._updateJoystickPos(e, zonaEl, stickEl, maxRadius);
        });

        zonaEl.addEventListener('pointermove', (e) => {
            if (!joystickActive) return;
            e.stopPropagation();
            e.preventDefault();
            this._updateJoystickPos(e, zonaEl, stickEl, maxRadius);
        });

        const stopJoystick = (e) => {
            if (!joystickActive) return;
            joystickActive = false;
            this._adelante = 0;
            
            stickEl.style.transform = `translate(0px, 0px)`;
            
            if (e) {
                try { zonaEl.releasePointerCapture(e.pointerId); } catch(err) {}
                e.stopPropagation();
                e.preventDefault();
            }
        };

        zonaEl.addEventListener('pointerup', stopJoystick);
        zonaEl.addEventListener('pointercancel', stopJoystick);
    }

    _updateJoystickPos(e, container, stick, maxRadius) {
        const rect = container.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        let deltaX = e.clientX - centerX;
        let deltaY = e.clientY - centerY;

        const distance = Math.hypot(deltaX, deltaY);
        if (distance > maxRadius) {
            deltaX = (deltaX / distance) * maxRadius;
            deltaY = (deltaY / distance) * maxRadius;
        }

        stick.style.transform = `translate(${deltaX}px, ${deltaY}px)`;

        const movAdelante = -deltaY / maxRadius; 
        this._adelante = movAdelante > 0 ? movAdelante : 0;
    }

    _OnStep(timeInSeconds) {
        // 1. Actualizamos el movimiento y la posición del pez y del terreno
        this._UpdatePersonaje(timeInSeconds);

        // (el terreno ya se actualiza en game.js -> _StepEntities; llamarlo aca lo duplicaba)

        // 2. Sincronizamos ÚNICAMENTE el objetivo (target) de la cámara con el pez.
        // Al NO tocar camara.position manualmente, permites que OrbitControls 
        // mantenga la libertad de movimiento que el usuario haga con el mouse/touch.
        if (this._modeloPez && this._controls) {
            //this._modeloPez.update();
            const offsetVertical = new THREE.Vector3(0, 3.0, 0); // Ajusta la altura del foco si lo deseas
            const targetPos = this._modeloPez.modelo_base.position.clone().add(offsetVertical);
            
            // Calculamos cuánto se ha movido el pez desde el frame anterior
            const desplazamiento = targetPos.clone().sub(this._controls.target);

            // Movemos tanto la cámara como el objetivo esa misma distancia (permite que la cámara "arrastre" su posición al avanzar)
            this._controls.target.copy(targetPos);
            this._graphics._camera.position.add(desplazamiento);
        }

        // 3. Actualizamos los controles para aplicar el amortiguamiento (damping) y la interacción del usuario
        this._controls.update();

        // 4. Seguridad anti-subsuelo para la cámara
        const terreno = this._entities['_terrain'];
        if (terreno) {
            const cam = this._graphics._camera.position;
            const piso = terreno.HeightAt(cam.x, cam.z) + 4;
            if (cam.y < piso) {
                cam.y = piso;
            }
        }
    }

    _UpdatePersonaje(dt) {
        if (!this._modeloPez) return;

        const velocidad = 20;
        const direccion = new THREE.Vector3();

        const camara = this._graphics._camera;
        camara.getWorldDirection(direccion);
        direccion.y = 0;
        direccion.normalize();

        const rotacionActual = this._modeloPez.modelo_base.quaternion.clone();
        const objetivoMirada = this._modeloPez.modelo_base.position.clone().add(direccion);
        this._modeloPez.modelo_base.lookAt(objetivoMirada);
        this._modeloPez.modelo_outline.lookAt(objetivoMirada);
        
        const rotacionObjetivo = this._modeloPez.modelo_base.quaternion.clone();
        this._modeloPez.modelo_base.quaternion.copy(rotacionActual);
        this._modeloPez.modelo_outline.quaternion.copy(rotacionActual);
        
        const suavizadoRotacion = 0.1; 
        this._modeloPez.modelo_base.quaternion.slerp(rotacionObjetivo, suavizadoRotacion);
        this._modeloPez.modelo_outline.quaternion.slerp(rotacionObjetivo, suavizadoRotacion);

        
        if (this._adelante > 0 || this._teclaAdelante) {
            const factor = this._adelante > 0 ? this._adelante : 1;
            this._modeloPez.modelo_base.position.addScaledVector(direccion, factor * velocidad * dt);
            this._modeloPez.modelo_outline.position.addScaledVector(direccion, factor * velocidad * dt);
        }

        // Colision con los assets (barco, huesos, selfies, corales, rocas; no algas).
        // El pez es largo y angosto: se prueban dos circulos, uno hacia la cabeza y otro
        // hacia la cola, y cada empuje mueve al pez (y a su contorno) por igual.
        const terreno = this._entities['_terrain'];
        if (terreno) {
            const FISH_RADIUS = 1.8;      // radio de cada circulo
            const FISH_OFFSET = 2.6;      // distancia de cada circulo al centro del pez
            const pb = this._modeloPez.modelo_base.position;
            const po = this._modeloPez.modelo_outline.position;
            const fwd = this._modeloPez.modelo_base.getWorldDirection(new THREE.Vector3());
            fwd.y = 0;
            fwd.normalize();
            for (const side of [1, -1]) {
                const probe = new THREE.Vector3(pb.x + fwd.x * FISH_OFFSET * side, pb.y, pb.z + fwd.z * FISH_OFFSET * side);
                const antesX = probe.x, antesZ = probe.z;
                terreno.ResolveCollisions(probe, FISH_RADIUS);
                pb.x += probe.x - antesX;  pb.z += probe.z - antesZ;
                po.x += probe.x - antesX;  po.z += probe.z - antesZ;
            }
            terreno.UpdateSelfies(pb, dt);
        }

       //distancia del pez con el suelo
        if (terreno) {
            const p = this._modeloPez.modelo_base.position;
            const bajo = terreno.HeightAt(p.x, p.z);
            // mira un poco adelante para subir ANTES de llegar a una loma
            const adelante = terreno.HeightAt(p.x + direccion.x * 15, p.z + direccion.z * 15);
            const deseada = Math.max(bajo, adelante) + 6;           // altura "de nado"
            p.y += (deseada - p.y) * (1 - Math.exp(-3.0 * dt));      // sube Y BAJA suavemente
            if (p.y < bajo + 3) { p.y = bajo + 3; }                  // piso duro
        }
        if (terreno) {
            const p = this._modeloPez.modelo_outline.position;
            const bajo = terreno.HeightAt(p.x, p.z);
            // mira un poco adelante para subir ANTES de llegar a una loma
            const adelante = terreno.HeightAt(p.x + direccion.x * 15, p.z + direccion.z * 15);
            const deseada = Math.max(bajo, adelante) + 6;           // altura "de nado"
            p.y += (deseada - p.y) * (1 - Math.exp(-3.0 * dt));      // sube Y BAJA suavemente
            if (p.y < bajo + 3) { p.y = bajo + 3; }                  // piso duro
        }

        this._modeloPez.modelo_base.updateMatrixWorld();
        this._modeloPez.modelo_base.updateMatrixWorld();
        this._modeloPez.update();
        //this._modeloPez.modelo_outline.quaternion.copy(this._modeloPez.modelo_base.quaternion.clone());
        //this._modeloPez.modelo_outline.position.set(this._modeloPez.modelo_base.position);
        //this._modeloPez.modelo_outline.updateMatrixWorld();
    }
}

function _Main() {
    _APP = new ProceduralTerrain_Demo();
}

_Main();