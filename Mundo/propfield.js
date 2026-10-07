import {noise} from './noise.js';

//Colocación de objetos

function _Hash(x, z, seed, salt) {
    let h = (seed ^ Math.imul(salt + 1, 0x9e3779b1)) | 0;
    h = Math.imul(h ^ x, 0x85ebca6b); h ^= h >>> 13;
    h = Math.imul(h ^ z, 0xc2b2ae35); h ^= h >>> 16;
    h = Math.imul(h, 0x27d4eb2d); h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
}

function _Key(ix, iz) {
    return (ix + 1048576) * 2097152 + (iz + 1048576);
}

export class PropField {
    constructor(params) {
        this._seed = params.seed | 0;
        this._heightAt = params.heightAt;
        this._heightMax = params.heightMax;
    
        const byId = {};
        this._cats = params.catalog.map((c, i) => {
        const cat = Object.assign({}, c, {
            index: i,
            salt: i * 16,
            variants: Math.max(1, (c.models || []).length),
            _valid: new Map(),
            _acc: new Map(),
            _avoid: [],
        });
        if (c.patch) {
            cat._patch = new noise.Noise({
            octaves: 3, persistence: 1.0, lacunarity: 2.0, exponentiation: 1.0,
            contrast: 2.2, height: 1.0, scale: c.patch.scale, seed: this._seed + 101 * (i + 1),
            });
        }
        byId[c.id] = cat;
        return cat;
        });
    
        this._byId = byId;
    
        for (const cat of this._cats) {
        for (const id in (cat.avoid || {})) {
            const other = byId[id];
            if (!other || other.index >= cat.index) {
            throw new Error(`catalog: '${cat.id}' solo puede evitar categorias anteriores ('${id}' no lo es)`);
            }
            cat._avoid.push({cat: other, margin: cat.avoid[id]});
        }
        }
    }
    
    _Valid(cat, ix, iz) {
        const key = _Key(ix, iz);
        let v = cat._valid.get(key);
        if (v !== undefined) {
        return v;
        }
        v = this._MakeCandidate(cat, ix, iz);
        cat._valid.set(key, v);
        return v;
    }
    
    _MakeCandidate(cat, ix, iz) {
        const s = this._seed;
        const sp = cat.spacing;
        const salt = cat.salt;
        const x = (ix + _Hash(ix, iz, s, salt + 1)) * sp;
        const z = (iz + _Hash(ix, iz, s, salt + 2)) * sp;
    
        let p = cat.density;
        if (cat._patch) {
        const st = cat.patch.strength;
        p *= (1 - st) + st * 2 * cat._patch.Get(x, z);
        }
        if (_Hash(ix, iz, s, salt + 3) >= p) {
        return null;
        }
    
        const size = cat.size[0] + (cat.size[1] - cat.size[0]) * _Hash(ix, iz, s, salt + 4);
    
        // Reglas del terreno
        const y = this._heightAt(x, z);
        const hn = y / this._heightMax;
        if (hn < cat.heightRange[0] || hn > cat.heightRange[1]) {
        return null;
        }
        if (cat.maxSlope !== undefined) {
        const d = 2.0;
        const sx = (this._heightAt(x + d, z) - y) / d;
        const sz = (this._heightAt(x, z + d) - y) / d;
        if (Math.hypot(sx, sz) > cat.maxSlope) {
            return null;
        }
        }
        if (cat.flat !== undefined) {
        const r = size * 0.4;
        const hs = [this._heightAt(x + r, z), this._heightAt(x - r, z),
                    this._heightAt(x, z + r), this._heightAt(x, z - r), y];
        if (Math.max(...hs) - Math.min(...hs) > size * cat.flat) {
            return null;
        }
        }
    
        return {
        x: x, y: y, z: z, size: size,
        prio: _Hash(ix, iz, s, salt + 5),
        rot: _Hash(ix, iz, s, salt + 6) * Math.PI * 2,
        variant: Math.floor(_Hash(ix, iz, s, salt + 7) * cat.variants),
        };
    }
    
    // Competencia con vecinos
    _Accepted(cat, ix, iz) {
        const key = _Key(ix, iz);
        let r = cat._acc.get(key);
        if (r !== undefined) {
        return r;
        }
        const me = this._Valid(cat, ix, iz);
        r = null;
        if (me) {
        r = me;
        const sp2 = cat.spacing * cat.spacing;
    
        // 1) misma categoria: gana la mayor prioridad dentro de 'spacing'
        for (let dz = -1; dz <= 1 && r; dz++) {
            for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dz === 0) continue;
            const o = this._Valid(cat, ix + dx, iz + dz);
            if (o && o.prio > me.prio) {
                const ddx = o.x - me.x, ddz = o.z - me.z;
                if (ddx * ddx + ddz * ddz < sp2) {
                r = null;
                break;
                }
            }
            }
        }
    
        // 2) categorias anteriores: margen libre entre bordes (usa los tamaños)
        for (let a = 0; a < cat._avoid.length && r; a++) {
            const oc = cat._avoid[a].cat;
            const margin = cat._avoid[a].margin;
            const os = oc.spacing;
            const reach = margin + (oc.size[1] + me.size) * 0.5;
            const jx0 = Math.floor((me.x - reach) / os), jx1 = Math.floor((me.x + reach) / os);
            const jz0 = Math.floor((me.z - reach) / os), jz1 = Math.floor((me.z + reach) / os);
            for (let jz = jz0; jz <= jz1 && r; jz++) {
            for (let jx = jx0; jx <= jx1; jx++) {
                const o = this._Accepted(oc, jx, jz);
                if (o) {
                const need = margin + (o.size + me.size) * 0.5;
                const ddx = o.x - me.x, ddz = o.z - me.z;
                if (ddx * ddx + ddz * ddz < need * need) {
                    r = null;
                    break;
                }
                }
            }
            }
        }
        }
        cat._acc.set(key, r);
        return r;
    }
    
    _TrimCaches() {                            
        for (const cat of this._cats) {
        if (cat._valid.size > 60000) cat._valid.clear();
        if (cat._acc.size > 60000) cat._acc.clear();
        }
    }
    
    _CategoryPlacements(cat, x0, z0, x1, z1, out) {
        const sp = cat.spacing;
        for (let iz = Math.floor(z0 / sp); iz <= Math.floor(z1 / sp); iz++) {
        for (let ix = Math.floor(x0 / sp); ix <= Math.floor(x1 / sp); ix++) {
            const p = this._Accepted(cat, ix, iz);
            if (p && p.x >= x0 && p.x < x1 && p.z >= z0 && p.z < z1) {
            out.push({cat: cat.id, x: p.x, y: p.y, z: p.z, size: p.size, rot: p.rot, variant: p.variant});
            }
        }
        }
    }
    
    GetPlacementsFor(catId, cx, cz, chunkSize) {
        this._TrimCaches();
        const x0 = cx * chunkSize, z0 = cz * chunkSize;
        const out = [];
        this._CategoryPlacements(this._byId[catId], x0, z0, x0 + chunkSize, z0 + chunkSize, out);
        return out;
    }
    
    GetPlacements(cx, cz, chunkSize) {
        this._TrimCaches();
        const x0 = cx * chunkSize, z0 = cz * chunkSize;
        const out = [];
        for (const cat of this._cats) {
        this._CategoryPlacements(cat, x0, z0, x0 + chunkSize, z0 + chunkSize, out);
        }
        return out;
    }
}