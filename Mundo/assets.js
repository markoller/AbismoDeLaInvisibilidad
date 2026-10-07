import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MODELS_PATH} from './catalog.js';

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
        return {parts: parts, baseSize: baseSize};
    }

    class _AssetLibrary {
        constructor(catalog) {
        this._catalog = catalog;
        this._entries = {};
        this._loader = new GLTFLoader();
        this.version = 0;

        for (const cat of catalog) {
            const n = Math.max(1, cat.models.length);
            for (let v = 0; v < n; v++) {
            this._entries[cat.id + '|' + v] = _BuildEntry((_PLACEHOLDERS[cat.placeholder] || _PLACEHOLDERS.piedra)());
            }
        }
        }

        Load() {
        for (const cat of this._catalog) {
            cat.models.forEach((file, v) => {
            const url = MODELS_PATH + file;
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
    }

    return {AssetLibrary: _AssetLibrary};
})();
