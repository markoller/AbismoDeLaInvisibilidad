import * as THREE from 'three';
import {PropField} from './propfield.js';

//Crea o destruye objetos

export const scatter = (function() {
    
    const _p = new THREE.Vector3();
    const _q = new THREE.Quaternion();
    const _s = new THREE.Vector3();
    const _m = new THREE.Matrix4();
    const _inst = new THREE.Matrix4();
    const _UP = new THREE.Vector3(0, 1, 0);
    
    class _PropScatter {
        constructor(params) {
        this._scene = params.scene;
        this._library = params.library;
        this._chunkSize = params.chunkSize;
        this._budgetMs = params.budgetMs;
    
        this._cats = params.catalog.map((c) => {
            const dist = (c.drawDistance !== undefined) ? c.drawDistance : Math.max(300, c.size[1] * 40);
            return Object.assign({}, c, {drawRadius: Math.min(params.radius, dist / params.chunkSize)});
        });
    
        this._field = new PropField({
            catalog: params.catalog,
            seed: params.seed,
            heightAt: params.heightAt,
            heightMax: params.heightMax,
        });
    
        // Colisiones: solo las categorias con 'collide' en el catalogo
        this._colCats = this._cats.filter((c) => c.collide);
        this._colReach = 0;
        for (const c of this._colCats) {
            this._colReach = Math.max(this._colReach, c.size[1] * 0.71);
        }
        this._colCache = new Map();

        this._built = new Map();   
        this._tasks = [];
        this._cx = null;
        this._cz = null;
        this._libVersion = 0;
        }
    
        _BuildGroup(rec) {
        const byVariant = new Map();
        for (const pl of rec.placements) {
            let list = byVariant.get(pl.variant);
            if (!list) {
            list = [];
            byVariant.set(pl.variant, list);
            }
            list.push(pl);
        }
    
        const root = new THREE.Group();
        root.matrixAutoUpdate = false;          

        if (rec.cat.images) {
            const entry = this._library.Get(rec.cat.id, 0);
            const part = entry.parts[0];
            for (const pl of rec.placements) {
            const key = Math.round(pl.x) + '_' + Math.round(pl.z);
            const mesh = new THREE.Mesh(part.geometry, this._library.GetImageMaterial(rec.cat, key, pl));
            const s = pl.size / entry.baseSize;
            _p.set(pl.x, pl.y - (rec.cat.sink || 0) * pl.size, pl.z);
            _q.setFromAxisAngle(_UP, pl.rot);
            _s.set(s, s, s);
            _m.compose(_p, _q, _s);
            _inst.multiplyMatrices(_m, part.localMatrix);
            _inst.decompose(mesh.position, mesh.quaternion, mesh.scale);
            root.add(mesh);
            }
            if (root.children.length > 0) {
            this._scene.add(root);
            }
            rec.group = root;
            return;
        }

        for (const [variant, list] of byVariant) {
            const entry = this._library.Get(rec.cat.id, variant);
            for (const part of entry.parts) {
            const mesh = new THREE.InstancedMesh(part.geometry, part.material, list.length);
            mesh.matrixAutoUpdate = false;
            for (let i = 0; i < list.length; i++) {
                const pl = list[i];
                const s = pl.size / entry.baseSize;
                _p.set(pl.x, pl.y - (rec.cat.sink || 0) * pl.size, pl.z);
                _q.setFromAxisAngle(_UP, pl.rot);
                _s.set(s, s, s);
                _m.compose(_p, _q, _s);
                _inst.multiplyMatrices(_m, part.localMatrix);
                mesh.setMatrixAt(i, _inst);
            }
            mesh.instanceMatrix.needsUpdate = true;
            root.add(mesh);
            }
        }
        if (root.children.length > 0) {
            this._scene.add(root);
        }
        rec.group = root;
        }
    
        // Brillo / desvanecimiento de las selfies segun la posicion del pez
        UpdateSelfies(pos, dt) {
        for (const cat of this._cats) {
            if (cat.images) {
            this._library.UpdateImages(cat, pos, dt);
            }
        }
        }

        // Objetos de una categoria en un chunk (cacheado; no depende de lo que este dibujado)
        _NearPlacements(cat, cx, cz) {
        const key = cx + '.' + cz + '.' + cat.id;
        let list = this._colCache.get(key);
        if (!list) {
            if (this._colCache.size > 80) {
            this._colCache.clear();
            }
            list = this._field.GetPlacementsFor(cat.id, cx, cz, this._chunkSize);
            this._colCache.set(key, list);
        }
        return list;
        }

        // Empuja 'pos' (un Vector3) fuera de los objetos que colisionan.
        // El pez es un circulo de radio 'radius' en x/z; cada objeto es una caja orientada
        // (la de su modelo real, rotada como se dibujo). Solo cuenta si el pez esta mas
        // bajo que la parte alta del objeto. Resultado: el pez se desliza al costado.
        Collide(pos, radius) {
        if (this._colCats.length === 0) return;
        const cs = this._chunkSize;
        const reach = radius + this._colReach;
        const bottom = pos.y;

        for (let pass = 0; pass < 2; pass++) {
            let moved = false;
            const cx0 = Math.floor((pos.x - reach) / cs), cx1 = Math.floor((pos.x + reach) / cs);
            const cz0 = Math.floor((pos.z - reach) / cs), cz1 = Math.floor((pos.z + reach) / cs);

            for (const cat of this._colCats) {
            const k = cat.collide.scale !== undefined ? cat.collide.scale : 1;
            const sink = cat.sink || 0;
            for (let cz = cz0; cz <= cz1; cz++) {
                for (let cx = cx0; cx <= cx1; cx++) {
                for (const pl of this._NearPlacements(cat, cx, cz)) {
                    // selfie ya desvanecida: traspasable
                    if (cat.images && this._library.IsImageGhost(cat, pl)) continue;
                    const entry = this._library.Get(cat.id, pl.variant);
                    if (!entry) continue;

                    // altura: si el pez va por encima de la parte alta, pasa
                    const base = pl.y - sink * pl.size;
                    if (bottom >= base + entry.height * pl.size) continue;

                    const hx = entry.halfX * pl.size * k;
                    const hz = entry.halfZ * pl.size * k;
                    const dx = pos.x - pl.x, dz = pos.z - pl.z;
                    const far = Math.hypot(hx, hz) + radius;
                    if (dx * dx + dz * dz >= far * far) continue;

                    // pasar al sistema local del objeto (deshacer su rotacion en Y)
                    const cs_ = Math.cos(pl.rot), sn = Math.sin(pl.rot);
                    const lx = dx * cs_ - dz * sn;
                    const lz = dx * sn + dz * cs_;

                    // punto de la caja mas cercano al pez
                    const nx = Math.max(-hx, Math.min(hx, lx));
                    const nz = Math.max(-hz, Math.min(hz, lz));
                    let vx = lx - nx, vz = lz - nz;
                    const d2 = vx * vx + vz * vz;
                    if (d2 >= radius * radius) continue;

                    let push;
                    if (d2 > 1e-9) {
                    const d = Math.sqrt(d2);
                    push = radius - d;
                    vx /= d; vz /= d;
                    } else {
                    // el centro del pez quedo dentro de la caja: salir por el lado mas corto
                    const px = hx - Math.abs(lx), pz = hz - Math.abs(lz);
                    if (px < pz) { vx = lx >= 0 ? 1 : -1; vz = 0; push = px + radius; }
                    else         { vx = 0; vz = lz >= 0 ? 1 : -1; push = pz + radius; }
                    }

                    // volver el empuje a coordenadas del mundo
                    pos.x += (vx * cs_ + vz * sn) * push;
                    pos.z += (-vx * sn + vz * cs_) * push;
                    moved = true;
                }
                }
            }
            }
            if (!moved) break;
        }
        }

        _DisposeGroup(rec) {
        if (rec.group) {
            this._scene.remove(rec.group);
            
            rec.group.children.forEach((m) => { if (m.dispose) m.dispose(); });
            rec.group = null;
        }
        }
    
        
        _Refresh() {
        for (const [key, rec] of this._built) {
            if (Math.hypot(rec.cx - this._cx, rec.cz - this._cz) > rec.cat.drawRadius + 1.5) {
            this._DisposeGroup(rec);
            this._built.delete(key);
            }
        }
    
        this._tasks = [];
        for (const cat of this._cats) {
            const R = Math.ceil(cat.drawRadius);
            for (let dx = -R; dx <= R; dx++) {
            for (let dz = -R; dz <= R; dz++) {
                const d = Math.hypot(dx, dz);
                if (d > cat.drawRadius) continue;
                const cx = this._cx + dx;
                const cz = this._cz + dz;
                const key = cx + '.' + cz + '.' + cat.id;
                const rec = this._built.get(key);
                if (!rec || !rec.group) {
                this._tasks.push({key: key, cx: cx, cz: cz, cat: cat, d: d});
                }
            }
            }
        }
        this._tasks.sort((a, b) => b.d - a.d);     
        }
    
        Update(cx, cz) {
        if (this._library.version !== this._libVersion) {
            this._libVersion = this._library.version;
            for (const rec of this._built.values()) {
            this._DisposeGroup(rec);
            }
            this._cx = null;
        }
        if (cx !== this._cx || cz !== this._cz) {
            this._cx = cx;
            this._cz = cz;
            this._Refresh();
        }
    
        const start = performance.now();
        while (this._tasks.length > 0) {
            const t = this._tasks.pop();
            let rec = this._built.get(t.key);
            if (!rec) {
            rec = {
                cx: t.cx, cz: t.cz, cat: t.cat, group: null,
                placements: this._field.GetPlacementsFor(t.cat.id, t.cx, t.cz, this._chunkSize),
            };
            this._built.set(t.key, rec);
            }
            this._BuildGroup(rec);
            if (performance.now() - start > this._budgetMs) {
            break;
            }
        }
        }
    }
    
    return {PropScatter: _PropScatter};
})();