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

// DIAGNÓSTICO AUDIO v4: permite identificar que llegó la versión nueva.
window.AudioDiagnostics?.log('main.js audio-v4 cargado.');

let _APP = null;

// Configuraciones responsive y del mundo
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


// Chunk de Terreno con soporte para Outline
const _ROCK = new THREE.Color(0x2f3a40);

class TerrainChunk {
    constructor(params) {
        this._params = params;
        this._Init();
    }

    _Init() {
        const {cx, cz, size, segments, generator, colourSpline, maxHeight, material, outlineMaterial} = this._params;
        const step = size / segments;
        const n = segments + 1;        
        const m = segments + 3;        
        const ox = cx * size;
        const oz = cz * size;

        const heights = new Float32Array(m * m);
        for (let j = 0; j < m; j++) {
            for (let i = 0; i < m; i++) {
                heights[j * m + i] = generator.Get(ox + (i - 1) * step, oz + (j - 1) * step);
            }
        }

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

                tmp.copy(colourSpline.Get(h / maxHeight));
                const steep = math.sat((0.8 - ny) / 0.25);
                tmp.lerp(_ROCK, steep);
                colours[idx] = tmp.r;
                colours[idx + 1] = tmp.g;
                colours[idx + 2] = tmp.b;
            }
        }

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

        // Compartir la geometría base para el terreno y su outline
        const geometry = new THREE.BufferGeometry();
        geometry.setIndex(new THREE.BufferAttribute(indices, 1));
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
        geometry.computeBoundingSphere();

        // 1. Mesh Base del Terreno
        this._mesh = new THREE.Mesh(geometry, material);
        this._mesh.position.set(ox, 0, oz);
        this._params.scene.add(this._mesh);

        // 2. Mesh Outline del Terreno
        this._outlineMesh = new THREE.Mesh(geometry, outlineMaterial);
        this._outlineMesh.position.set(ox, 0, oz);
        
        // Aumenta un poco más la escala general o la escala vertical (y)
        this._outlineMesh.scale.set(1.005, 1.005, 1.005); // Probá subiendo de 1.002 a 1.005 o 1.01
    }

    Destroy() {
        this._params.scene.remove(this._mesh);
        this._params.scene.remove(this._outlineMesh);
        this._mesh.geometry.dispose();  // Libera la geometría compartida de ambos
    }
}

class TerrainChunkManager {
    constructor(params) {
        this._scene = params.scene;
        this._camera = params.camera;
        this._focus = params.focus || null;
        this._isReady = false;
        this._Init();
    }

    async _Init() {

        this._material = new THREE.MeshStandardMaterial({
            color: 0xFFFFFF,
            vertexColors: true,
            roughness: 1.0,
            metalness: 0.0,
        });

        // Material de Outline idéntico al de ModeloFijo para el terreno
        this._outlineMaterial = new THREE.MeshBasicMaterial({
            color: 0x1722D9,          // Mismo azul de contorno de tus objetos
            wireframe: false,
            transparent: true,
            opacity: 0.25,            // Opacidad sutil para que no sature la pantalla
            blending: THREE.NormalBlending
        });

        const size = _CONFIG.chunkSize;

        this._generator = new noise.Noise(_NOISE_PARAMS);
        console.log('Seed del mundo:', _NOISE_PARAMS.seed);

        const _colourLerp = (t, p0, p1) => p0.clone().lerp(p1, t);
        this._colourSpline = new spline.LinearSpline(_colourLerp);
        this._colourSpline.AddPoint(0.00, new THREE.Color("#273238"));  
        this._colourSpline.AddPoint(0.06, new THREE.Color("#2E3431"));  
        this._colourSpline.AddPoint(0.30, new THREE.Color("#253D44"));  
        this._colourSpline.AddPoint(0.55, new THREE.Color("#2F3F3A"));  
        this._colourSpline.AddPoint(0.75, new THREE.Color("#3F4B51"));  

        this._material = new THREE.MeshStandardMaterial({
            color: 0xFFFFFF,
            vertexColors: true,
            roughness: 1.0,
            metalness: 0.0,
        });

        const far = _CONFIG.viewRadius * size * 0.75;
        this._scene.background = new THREE.Color(_CONFIG.skyColour);
        this._scene.fog = new THREE.Fog(_CONFIG.skyColour, far * 0.03, far * 0.1);
        this._camera.far = far * 1.0;
        this._camera.updateProjectionMatrix();

        this._chunks = {};
        this._pending = [];
        this._cx = null;
        this._cz = null;

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
            onPropDespawn: () => {
                if (this._onDespawnCallback) {
                    this._onDespawnCallback();
                }
            }
        });

        this._isReady = true; 
        console.log(this._props);
    }

    _Key(x, z) {
        return x + '.' + z;
    }

    // <-- MÉTODO _Refresh RESTAURADO AQUÍ ADENTRO
    _Refresh() {
        const R = _CONFIG.viewRadius;

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
            outlineMaterial: this._outlineMaterial, // <-- Añadido aquí
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
        if (!this._generator) return 0;
        return this._generator.Get(x, z);
    }

    ResolveCollisions(pos, radius) {
        if (!this._isReady || !this._props) return;
        this._props.Collide(pos, radius);
    }

    UpdateSelfies(pos, dt) {
        if (!this._isReady || !this._props) return;
        this._props.UpdateSelfies(pos, dt);
    }

    async Update(timeInSeconds) {
        if (!this._isReady) return;

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

    GetImageSpeedFactor(pos, slowRadius) {
        if (!this._isReady || !this._props) return 1.0;
        return this._props.GetImageSpeedFactor(pos, slowRadius);
    }

    SetDespawnCallback(callback) {
        this._onDespawnCallback = callback;
    }
}

class ProceduralTerrain_Demo extends game.Game {
    constructor() {
        super();
        this._modeloPez = null;
        this._adelante = 0;
        this._girar = 0;

        this._teclaAdelante = false;
        this._teclaIzquierda = false;
        this._teclaDerecha = false;

        this._anguloY = 0;
        this._isUserInteracting = false;

        this._velocidadNormal = 25;    
        this._velocidadLenta = 8;     
        this._velocidadActual = 25;
        this._speedFactor = 1.0;
    }

    async _OnInitialize() {
        this._controls = this._CreateControls();

        this.AudioIniciar();

        this._entities['_terrain'] = new TerrainChunkManager({
            scene: this._graphics.Scene,
            camera: this._graphics.Camera,
            focus: () => (this._modeloPez ? this._modeloPez.modelo_base.position : this._controls.target),
        });

        const terreno = this._entities['_terrain'];
        if (terreno && terreno.SetDespawnCallback) {
            terreno.SetDespawnCallback(() => {
                if (this._audioDesaparece && this._audioDesaparece.buffer) {
                    if (this._audioDesaparece.isPlaying) this._audioDesaparece.stop();
                    this._audioDesaparece.play();
                }
            });
        }

        this._InitInput();
        await this._LoadPez();
        this._InitJoystick();
    }

    _CreateControls() {
        const controls = new OrbitControls(
            this._graphics._camera,
            this._graphics._threejs.domElement
        );

        controls.enableZoom = false;
        controls.minDistance = 5;
        controls.maxDistance = 20;
        controls.enableDamping = true;
        controls.dampingFactor = 0.1;
        controls.maxPolarAngle = Math.PI / 1.5;
        controls.minPolarAngle = Math.PI / 3;

        if (_IS_MOBILE) {
            controls.enablePan = false;
            controls.touches.ONE = THREE.TOUCH.ROTATE;
            controls.touches.TWO = THREE.TOUCH.ROTATE;
        }

        controls.addEventListener('start', () => {
            this._isUserInteracting = true;
        });
        controls.addEventListener('end', () => {
            this._isUserInteracting = false;
        });

        controls.update();
        return controls;
    }

    _InitInput() {
        if (!_IS_MOBILE) {
            window.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') this._teclaAdelante = true;
                if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') this._teclaIzquierda = true;
                if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') this._teclaDerecha = true;
            });

            window.addEventListener('keyup', (e) => {
                if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') this._teclaAdelante = false;
                if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') this._teclaIzquierda = false;
                if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') this._teclaDerecha = false;
            });
        }
    }

    async _LoadPez() {
        const terreno = this._entities['_terrain'];
        
        // Esperar a que el TerrainChunkManager termine de cargar los assets
        while (!terreno._isReady) {
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        const initialHeight = terreno.HeightAt(0, 0) + 12; // <-- Declarada correctamente acá
        const wasd = new Modelo();
        await wasd.init('../Modelos/Pez/pez_animado.glb', this._graphics.Scene, this._graphics._camera);
        
        this._modeloPez = wasd.get();
        this._modeloPez.modelo_base.position.set(0, initialHeight, 0);
        this._modeloPez.modelo_outline.position.set(0, initialHeight, 0);
        
        this._anguloY = this._modeloPez.modelo_base.rotation.y;

    this._controls.target.copy(this._modeloPez.modelo_base.position).add(new THREE.Vector3(0, 3, 0));
    this._graphics._camera.position.set(0, initialHeight + 8, 18);
    
    const escalaPez = _IS_MOBILE ? 14 : 18;
    const escalaOutline = escalaPez + 0.01;

    this._modeloPez.modelo_base.scale.set(escalaPez, escalaPez, escalaPez);
    this._modeloPez.modelo_outline.scale.set(escalaOutline, escalaOutline, escalaOutline);
}

    _InitJoystick() {
        const zonaEl = document.getElementById("joystickZona");
        if (!zonaEl) return;

        const checkMobileAndToggle = () => {
            const isMobileCurrent = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 600;
            
            if (!isMobileCurrent) {
                zonaEl.style.display = "none";
                return;
            }
            
            zonaEl.style.display = "flex";
        };

        checkMobileAndToggle();

        window.addEventListener('resize', checkMobileAndToggle);

        let stickEl = zonaEl.querySelector('.joystick-stick');
        if (!stickEl) {
            stickEl = document.createElement('div');
            stickEl.className = 'joystick-stick';
            zonaEl.appendChild(stickEl);
        }

        let joystickActive = false;
        const maxRadius = 35;

        zonaEl.addEventListener('pointerdown', (e) => {
            // CAMBIO AUDIO iOS v4: activar desde el gesto real del joystick,
            // antes de cancelar sus eventos, sin depender del panel de pruebas.
            this._habilitarAudio?.(e);
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
            this._girar = 0;
            
            stickEl.style.transform = `translate(0px, 0px)`;
            
            if (e) {
                try { zonaEl.releasePointerCapture(e.pointerId); } catch(err) {}
                e.stopPropagation();
                e.preventDefault();
            }
        };

        zonaEl.addEventListener('pointerup', stopJoystick);
        zonaEl.addEventListener('pointercancel', stopJoystick);

        setTimeout(() => {
            if (zonaEl) {
                zonaEl.style.transition = "opacity 1s ease";
                zonaEl.style.opacity = "0";
            }
        }, 15000);
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

        const movGiro = deltaX / maxRadius;
        this._girar = Math.abs(movGiro) > 0.1 ? movGiro : 0;
    }

    _OnStep(timeInSeconds) {
        this._UpdatePersonaje(timeInSeconds);

        if (this._modeloPez && this._controls) {
            const offsetVertical = new THREE.Vector3(0, 3.0, 0);
            const targetPos = this._modeloPez.modelo_base.position.clone().add(offsetVertical);
            const desplazamiento = targetPos.clone().sub(this._controls.target);

            this._controls.target.copy(targetPos);
            this._graphics._camera.position.add(desplazamiento);

           const pezMoviendose = _IS_MOBILE 
                ? (this._adelante > 0 || Math.abs(this._girar) > 0) 
                : (this._teclaAdelante || this._teclaIzquierda || this._teclaDerecha);

            if (!this._isUserInteracting && pezMoviendose) {
                const direccionPez = new THREE.Vector3(0, 0, 1).applyQuaternion(this._modeloPez.modelo_base.quaternion);
                direccionPez.y = 0;
                direccionPez.normalize();

                const distanciaCamara = 18;
                const alturaCamara = 6;
                const posIdeal = targetPos.clone().sub(direccionPez.multiplyScalar(distanciaCamara));
                posIdeal.y = targetPos.y + alturaCamara;

                this._graphics._camera.position.lerp(posIdeal, 4.0 * timeInSeconds);
            }
        }

        this._controls.update();

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

        const pb = this._modeloPez.modelo_base.position;
        const terreno = this._entities['_terrain'];
        let factorProximidad = 1.0;
        if (terreno && terreno.GetImageSpeedFactor) {
            const radioFrenado = 80; 
            factorProximidad = terreno.GetImageSpeedFactor(pb, radioFrenado);
        }

        const estaCercaAhora = factorProximidad < 0.99; 

        if (estaCercaAhora && !this._estabaCerca) {
            if (this._audioProximidad.buffer && !this._audioProximidad.isPlaying) {
                this._audioProximidad.play();

            }
        }
        
        this._estabaCerca = estaCercaAhora;

        if (estaCercaAhora && !this._estabaCerca) {
            if (this._audioProximidad.buffer && !this._audioProximidad.isPlaying) {
                this._audioProximidad.play();

            }
        }
        
        this._estabaCerca = estaCercaAhora;

        const velocidadObjetivo = THREE.MathUtils.lerp(this._velocidadLenta, this._velocidadNormal, factorProximidad);

        const velocidadSuavizado = 15.0; 
        this._velocidadActual += (velocidadObjetivo - this._velocidadActual) * (1 - Math.exp(-velocidadSuavizado * dt));

        let turnInput = 0;
        if (_IS_MOBILE) {
            turnInput = this._girar;
        } else {
            if (this._teclaIzquierda) turnInput -= 1;
            if (this._teclaDerecha) turnInput += 1;
        }

        if (turnInput !== 0) {
            const velocidadGiro = 3.0; 
            this._anguloY -= turnInput * velocidadGiro * dt;
        }

        const rotacionObjetivo = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this._anguloY + Math.PI);
        this._modeloPez.modelo_base.quaternion.slerp(rotacionObjetivo, 10.0 * dt);
        this._modeloPez.modelo_outline.quaternion.slerp(rotacionObjetivo, 10.0 * dt);

        const direccion = new THREE.Vector3(0, 0, 1).applyQuaternion(this._modeloPez.modelo_base.quaternion);
        direccion.y = 0;
        direccion.normalize();
        
        const activo = _IS_MOBILE ? (this._adelante > 0) : this._teclaAdelante;

        if (activo) {
            const factor = _IS_MOBILE ? this._adelante : 1;
            this._modeloPez.modelo_base.position.addScaledVector(direccion, factor * this._velocidadActual * dt);
            this._modeloPez.modelo_outline.position.addScaledVector(direccion, factor * this._velocidadActual * dt);
        }

        if (terreno) {
            const FISH_RADIUS = 1.8;      
            const FISH_OFFSET = 2.6;      
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

        if (terreno) {
            const p = this._modeloPez.modelo_base.position;
            const bajo = terreno.HeightAt(p.x, p.z);
            const adelanteSuelo = terreno.HeightAt(p.x + direccion.x * 15, p.z + direccion.z * 15);
            const deseada = Math.max(bajo, adelanteSuelo) + 6;        
            p.y += (deseada - p.y) * (1 - Math.exp(-3.0 * dt));      
            if (p.y < bajo + 3) { p.y = bajo + 3; }                
        }
        if (terreno) {
            const p = this._modeloPez.modelo_outline.position;
            const bajo = terreno.HeightAt(p.x, p.z);
            const adelanteSuelo = terreno.HeightAt(p.x + direccion.x * 15, p.z + direccion.z * 15);
            const deseada = Math.max(bajo, adelanteSuelo) + 6;        
            p.y += (deseada - p.y) * (1 - Math.exp(-3.0 * dt));      
            if (p.y < bajo + 3) { p.y = bajo + 3; }                
        }

        this._modeloPez.modelo_base.updateMatrixWorld();
        this._modeloPez.modelo_outline.updateMatrixWorld();
        this._modeloPez.update();

        
    }

    AudioIniciar() {
        const diagnostico = window.AudioDiagnostics;
        diagnostico?.log('AudioIniciar() ejecutado. Creando contexto…');

        // CAMBIO AUDIO iOS v3: con AudioSession "auto", Safari puede tratar
        // Web Audio como sonido ambiente y respetar el modo silencio del iPhone,
        // aunque el contexto esté running y haya señal. Declarar "playback"
        // solicita reproducción multimedia, también para el tono de prueba.
        // Se configura antes de crear el contexto y nuevamente en cada gesto.
        // Esta categoría puede pausar la reproducción de otras aplicaciones.
        const configurarSesionAudio = () => {
            try {
                const sesion = navigator.audioSession;
                if (sesion && sesion.type !== 'playback') {
                    sesion.type = 'playback';
                    diagnostico?.log(`AudioSession solicitada: playback; actual: ${sesion.type}.`);
                }
            } catch (error) {
                diagnostico?.log(`No se pudo configurar AudioSession: ${error.message}`);
                console.warn('No se pudo configurar la sesión de reproducción.', error);
            }
        };
        configurarSesionAudio();

        const listener = new THREE.AudioListener();
        this._graphics._camera.add(listener);
        const contexto = listener.context;

        // CAMBIO AUDIO iOS v4: iniciar una muestra silenciosa dentro del gesto
        // ayuda a activar Web Audio en Safari. No emite un pitido ni crea otro
        // contexto; es independiente de los WAV y de la consola de diagnóstico.
        const muestraSilenciosa = contexto.createBuffer(1, 1, contexto.sampleRate);
        let activadoDesdeGesto = false;
        let fuenteActivacion = null;

        this._audioAmbiente = new THREE.Audio(listener);
        this._audioProximidad = new THREE.Audio(listener);
        this._audioDesaparece = new THREE.Audio(listener);

        // CAMBIO AUDIO MÓVIL: iniciar el ambiente solo cuando estén listos
        // tanto el archivo como el contexto, sin duplicar la reproducción.
        const iniciarAmbiente = () => {
            if (contexto.state === 'running' &&
                this._audioAmbiente.buffer && !this._audioAmbiente.isPlaying) {
                this._audioAmbiente.play();
                diagnostico?.log('Ambiente programado para reproducción.');
            }
        };

        const habilitarAudio = (evento) => {
            diagnostico?.gesture(evento);
            configurarSesionAudio();
            if (contexto.state === 'closed') {
                diagnostico?.log('El contexto está cerrado. Recargá la página para reintentarlo.');
                return;
            }
            if (contexto.state === 'running' && activadoDesdeGesto) {
                iniciarAmbiente();
                return;
            }

            // start() debe ejecutarse en la misma pila del touchstart/pointerdown,
            // antes de cualquier promesa y de preventDefault() del joystick.
            // Si un gesto no bastó, el siguiente reemplaza la fuente pendiente.
            try {
                if (fuenteActivacion) {
                    const anterior = fuenteActivacion;
                    fuenteActivacion = null;
                    try { anterior.stop(); } catch (error) {
                        // Puede no haber llegado a iniciarse en el intento anterior.
                    }
                    anterior.disconnect();
                }
                const fuente = contexto.createBufferSource();
                fuenteActivacion = fuente;
                fuente.buffer = muestraSilenciosa;
                fuente.connect(listener.getInput());
                fuente.onended = () => {
                    fuente.disconnect();
                    if (fuenteActivacion !== fuente) return;
                    fuenteActivacion = null;
                    activadoDesdeGesto = contexto.state === 'running';
                    diagnostico?.log(`Muestra de activación finalizada desde ${evento?.type || 'gesto'}; contexto ${contexto.state}.`);
                    iniciarAmbiente();
                };
                fuente.start(0);
            } catch (error) {
                diagnostico?.log(`Falló la muestra de activación: ${error.message}`);
                console.warn('No se pudo iniciar la muestra de activación de audio.', error);
            }

            // CAMBIO AUDIO MÓVIL: resume() se llama directamente desde el
            // toque/clic, antes de esperar promesas, para habilitar Web Audio.
            const terminarIntento = diagnostico?.beginResume();
            // Se devuelve la promesa para que el botón de prueba espere el resultado.
            return contexto.resume().then(() => {
                terminarIntento?.();
                iniciarAmbiente();
            }).catch((error) => {
                terminarIntento?.(error);
                console.warn('No se pudo habilitar el audio; se reintentará en el próximo toque.', error);
            });
        };

        // CAMBIO AUDIO iOS v4: escuchar también el INICIO del contacto.
        // Safari puede no aceptar touchend después de un arrastre como clic.
        // La captura se ejecuta antes del joystick y de los controles de cámara.
        // No se cancelan eventos ni se modifica la navegación.
        // Se mantienen los eventos para reintentar si Safari interrumpe el audio
        // al bloquear el teléfono o al volver desde otra pestaña.
        this._habilitarAudio = habilitarAudio;
        for (const evento of ['touchstart', 'pointerdown', 'mousedown', 'pointerup', 'touchend', 'click', 'keydown']) {
            window.addEventListener(evento, habilitarAudio, {capture: true, passive: true});
        }
        contexto.addEventListener('statechange', () => {
            if (contexto.state !== 'running') activadoDesdeGesto = false;
            iniciarAmbiente();
        });

        // DIAGNÓSTICO AUDIO v4: el panel observa el mismo contexto y sonidos.
        diagnostico?.attach({
            context: contexto,
            listener,
            sounds: {
                Ambiente: this._audioAmbiente,
                Spawn: this._audioProximidad,
                Despawn: this._audioDesaparece,
            },
            unlock: habilitarAudio,
        });

        const audioLoader = new THREE.AudioLoader();
        const progreso = (nombre) => (evento) => {
            const detalle = evento.total > 0
                ? `${Math.round(evento.loaded / evento.total * 100)}%`
                : `${Math.round(evento.loaded / 1024)} KB`;
            diagnostico?.file(nombre, `descargando ${detalle}; falta decodificar`);
        };
        const listo = (nombre, buffer) => {
            diagnostico?.file(nombre, `listo; ${buffer.duration.toFixed(1)} s, ${buffer.numberOfChannels} canales`);
        };
        const fallo = (nombre) => (error) => {
            const detalle = error?.message || `error de red/decodificación (${error?.type || 'sin detalle'})`;
            diagnostico?.file(nombre, `ERROR: ${detalle}`);
            diagnostico?.log(`Falló ${nombre}: ${detalle}`);
            console.error(`No se pudo cargar ${nombre}.`, error);
        };
        diagnostico?.file('Ambiente.wav', 'descargando');
        audioLoader.load('../Sonidos/Ambiente.wav', (buffer) => {
            this._audioAmbiente.setBuffer(buffer);
            this._audioAmbiente.setLoop(true);
            this._audioAmbiente.setVolume(0.8);
            listo('Ambiente.wav', buffer);
            iniciarAmbiente();
        }, progreso('Ambiente.wav'), fallo('Ambiente.wav'));

        diagnostico?.file('SpawnFotos.wav', 'descargando');
        audioLoader.load('../Sonidos/SpawnFotos.wav', (buffer) => {
            this._audioProximidad.setBuffer(buffer);
            this._audioProximidad.setVolume(0.8);
            listo('SpawnFotos.wav', buffer);
        }, progreso('SpawnFotos.wav'), fallo('SpawnFotos.wav'));

        diagnostico?.file('DespawnFotos.wav', 'descargando');
        audioLoader.load('../Sonidos/DespawnFotos.wav', (buffer) => {
            this._audioDesaparece.setBuffer(buffer);
            this._audioDesaparece.setVolume(0.8);
            listo('DespawnFotos.wav', buffer);
        }, progreso('DespawnFotos.wav'), fallo('DespawnFotos.wav'));

        this._estabaCerca = false;
    }

}

function _Main() {
    _APP = new ProceduralTerrain_Demo();
}

_Main();
