import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MODELS_PATH} from './catalog.js';
import { ModeloFijo } from './cargar-modelo.js';

//Biblioteca de modelos
//Si no hay modelo se reemplaza por un placeholder

export const assets = (function() {

    const _mat = (color) => new THREE.MeshStandardMaterial(
        {color: color, roughness: 0.9, metalness: 0.0, flatShading: true});

    function _mesh(geometry, color, x = 0, y = 0, z = 0) {
        const m = new THREE.Mesh(geometry, _mat(color));
        m.position.set(x, y, z);
        return m;
    }

    const _PLACEHOLDERS = {
        algas: () => {
        const g = new THREE.Group();
        g.add(_mesh(new THREE.ConeGeometry(0.12, 1.0, 5), 0x2f8f4e, 0, 0.5, 0));
        return g;
        },
        piedra: () => {
        const g = new THREE.Group();
        const geo = new THREE.DodecahedronGeometry(0.5, 0);
        geo.scale(1.0, 0.65, 0.85);
        g.add(_mesh(geo, 0x6b6f73));
        return g;
        },
        coral: () => {
        const g = new THREE.Group();
        g.add(_mesh(new THREE.ConeGeometry(0.12, 1.0, 5), '#B73E27', 0, 0.5, 0));
        return g;
        },
        huesos: () => {
        const g = new THREE.Group();
        const rib = new THREE.CapsuleGeometry(0.05, 0.9, 4, 8);
        rib.rotateZ(Math.PI / 2);
        g.add(_mesh(rib, 0xe8e2cf, 0, 0.05, 0));
        for (let i = -2; i <= 2; i++) {
            const b = new THREE.CapsuleGeometry(0.03, 0.35, 4, 8);
            b.rotateX(Math.PI / 2);
            g.add(_mesh(b, 0xe8e2cf, i * 0.18, 0.1, 0));
        }
        return g;
        },
        barco: () => {
        const g = new THREE.Group();
        g.add(_mesh(new THREE.BoxGeometry(1.0, 0.25, 0.32), 0x5a4a3a, 0, 0.125, 0));
        g.add(_mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.6, 6), 0x3b3128, 0.1, 0.5, 0));
        return g;
        },
        selfies: (aspect = 0.75) => {
        const g = new THREE.Group();
        const geo = new THREE.PlaneGeometry(aspect, 1);
        geo.translate(0, 0.5, 0);
        g.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial()));
        return g;
        },
    };

    function _BuildEntry(root) {
        root.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(root);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const baseSize = Math.max(size.x, size.y, size.z) || 1;

        const pivot = new THREE.Matrix4().makeTranslation(-center.x, -box.min.y, -center.z);

        const parts = [];
        root.traverse((o) => {
        if (o.isMesh) {
            parts.push({
            geometry: o.geometry,
            material: o.material,
            localMatrix: new THREE.Matrix4().multiplyMatrices(pivot, o.matrixWorld),
            });
        }
        });
        // Medidas normalizadas (1 = el lado mas grande del modelo), para las colisiones:
        // el modelo queda centrado en x/z sobre el punto de colocacion y apoyado en y = 0.
        return {
        parts: parts, baseSize: baseSize,
        halfX: size.x / 2 / baseSize,
        halfZ: size.z / 2 / baseSize,
        height: size.y / baseSize,
        };
    }

    class _AssetLibrary {
        constructor(catalog) {
        this._catalog = catalog;
        this._entries = {};
        this._loader = new GLTFLoader();
        this._texLoader = new THREE.TextureLoader();
        this._texLoader.setCrossOrigin('anonymous');
        this._imageMats = new Map();     
        this.version = 0;

        for (const cat of catalog) {
            const n = Math.max(1, cat.models.length);
            for (let v = 0; v < n; v++) {
            const make = _PLACEHOLDERS[cat.placeholder] || _PLACEHOLDERS.piedra;
            this._entries[cat.id + '|' + v] = _BuildEntry(make(cat.images ? cat.images.aspect : undefined));
            }
        }
        }

        async Load() {
            for (const cat of this._catalog) {
                cat.models.forEach((file, v) => {
                    const url = MODELS_PATH + file;
                    //var modelo = ModeloFijo;
                    //await modelo.init(url);
                    //this._entries[cat.id + '|' + (v+1)] = _BuildEntry(modelo.modelo_base.scene);
                    //this._entries[cat.id + '|' + v] = _BuildEntry(modelo.modelo_outline.scene.clone());
                    //this.version++;
                    //this.version+=2;
                    //console.log('[assets] cargado', url);
                    this._loader.load(url, (gltf) => {
                    this._entries[cat.id + '|' + v] = _BuildEntry(gltf.scene);
                    this.version++;
                    console.log('[assets] cargado', url);
            }, undefined, () => {
                console.warn('[assets] no se pudo cargar ' + url + ' -> se usa placeholder');
            });
        });
        }
        }

        Get(catId, variant) {
        return this._entries[catId + '|' + variant];
        }

        GetImageMaterial(cat, key, pl) {
        const id = cat.id + '|' + key;
        let mat = this._imageMats.get(id);
        if (!mat) {
            // Material con iluminacion (recibe la luz y la niebla de la escena). El brillo propio
            // (emissive) arranca apagado y se enciende cuando el pez se acerca.
            mat = new THREE.MeshStandardMaterial({
                color: 0x888888, roughness: 1.0, metalness: 0.0, side: THREE.DoubleSide,
            });
            mat.userData = {
                catId: cat.id,
                x: pl.x, z: pl.z, rot: pl.rot,
                half: cat.images.aspect * pl.size / 2,   // semiancho del cuadro
                glow: 0,         // 0..1, brillo actual (suavizado)
                age: 0,          // segundos SEGUIDOS con el pez dentro del radio (se reinicia al alejarse)
                fade: 0,         // 0..1, cuanto fue "consumida" (0 = intacta, 1 = consumida)
                ghost: false,    // true = ya fue consumida del todo: traspasable para siempre
            };
            this._imageMats.set(id, mat);
            this._LoadImage(cat, mat);
        }
        return mat;
        }

        // Una selfie "fantasma" (ya se desvanecio) deja de colisionar
        IsImageGhost(cat, pl) {
        const mat = this._imageMats.get(cat.id + '|' + Math.round(pl.x) + '_' + Math.round(pl.z));
        return !!(mat && mat.userData.ghost);
        }

        // Se llama en cada frame con la posicion del pez:
        //  - brillo suave segun la cercania
        //  - el reloj cuenta SOLO mientras el pez esta dentro del radio; si se aleja, vuelve a 0
        //  - pasados 'lifetime' segundos seguidos la imagen empieza a ser "consumida" (baja su
        //    opacidad); si el pez se va antes de terminar, se recupera
        //  - cuando se consume del todo queda traspasable de forma permanente
        UpdateImages(cat, pos, dt) {
        const C = cat.images;
        const R = C.glowRadius !== undefined ? C.glowRadius : 60;
        const maxGlow = C.glowIntensity !== undefined ? C.glowIntensity : 0.8;
        const base = C.baseGlow || 0;
        const life = C.lifetime !== undefined ? C.lifetime : 30;
        const fadeSec = C.fadeSeconds !== undefined ? C.fadeSeconds : 3;
        const ghostOp = C.ghostOpacity !== undefined ? C.ghostOpacity : 0.25;
        const recoverSec = C.recoverSeconds !== undefined ? C.recoverSeconds : 1.5;
        const k = 1 - Math.exp(-3.0 * dt);       // suavizado del brillo

        for (const mat of this._imageMats.values()) {
            const u = mat.userData;
            if (u.catId !== cat.id) continue;

            // ya consumida: solo se apaga el brillo que quedara
            if (u.ghost) {
            u.glow += (0 - u.glow) * k;
            mat.emissiveIntensity = base + maxGlow * u.glow;
            continue;
            }

            // distancia horizontal del pez al cuadro (un segmento fino de ancho 2*half)
            const dx = pos.x - u.x, dz = pos.z - u.z;
            const cs = Math.cos(u.rot), sn = Math.sin(u.rot);
            const lx = dx * cs - dz * sn;
            const lz = dx * sn + dz * cs;
            const d = Math.hypot(lx - Math.max(-u.half, Math.min(u.half, lx)), lz);
            const near = d <= R;

            if (near) {
            u.age += dt;
            const goal = Math.min(1, Math.max(0, (u.age - life) / fadeSec));
            // si volvio mientras todavia se estaba recuperando, sigue recuperandose hasta alcanzar el objetivo
            u.fade = u.fade > goal ? Math.max(goal, u.fade - dt / recoverSec) : goal;
            } else {
            u.age = 0;                                         // se alejo: el reloj se reinicia
            u.fade = Math.max(0, u.fade - dt / recoverSec);    // y la imagen se recupera
            }

            // brillo: sube suave al acercarse, baja suave al alejarse
            let target = 0;
            if (d < R) {
            const t = 1 - d / R;
            target = t * t * (3 - 2 * t);
            }
            u.glow += (target - u.glow) * k;
            mat.emissiveIntensity = base + maxGlow * u.glow;

            // opacidad segun cuanto fue consumida
            if (u.fade > 0) {
            if (!mat.transparent) {
                mat.transparent = true;
                mat.depthWrite = false;
                mat.needsUpdate = true;           // cambia la variante del shader
            }
            mat.opacity = 1 - (1 - ghostOp) * u.fade;
            } else if (mat.transparent) {
            mat.transparent = false;
            mat.depthWrite = true;
            mat.opacity = 1;
            mat.needsUpdate = true;
            }

            if (u.fade >= 1) {
            u.ghost = true;                           // consumida del todo: ya no colisiona
            }
        }
        }

        async _LoadImage(cat, mat) {
        const aspect = cat.images.aspect;
        try {
            const url = await cat.images.source();
            const tex = await this._texLoader.loadAsync(url);
            tex.colorSpace = THREE.SRGBColorSpace;

            const ia = tex.image.width / tex.image.height;
            if (ia > aspect) {
            tex.repeat.set(aspect / ia, 1);
            tex.offset.set((1 - aspect / ia) / 2, 0);
            } else {
            tex.repeat.set(1, ia / aspect);
            tex.offset.set(0, (1 - ia / aspect) / 2);
            }

            mat.map = tex;
            mat.emissiveMap = tex;                 // el brillo propio usa la misma imagen
            mat.emissive.set(0xffffff);
            mat.emissiveIntensity = cat.images.baseGlow || 0;
            mat.color.set(0xffffff);               // el oscurecimiento lo da la iluminacion de la escena
            mat.needsUpdate = true;
        } catch (e) {
            mat.color.set(0xff00ff);       // magenta = fallo la carga de la imagen
            console.error('[assets] no se pudo cargar la imagen de ' + cat.id, e);
        }
        }
    }

    return {AssetLibrary: _AssetLibrary};
})();