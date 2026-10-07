import {math} from './math.js';

export const noise = (function() {

  // PRNG con semilla (mulberry32)
    function _Mulberry32(a) {
        return function() {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    }

    // Perlin Noise 2D 
    class _Perlin {
        constructor(seed) {
        const rand = _Mulberry32(seed);
        const p = new Uint8Array(256);
        for (let i = 0; i < 256; i++) {
            p[i] = i;
        }
        for (let i = 255; i > 0; i--) {
            const j = Math.floor(rand() * (i + 1));
            const t = p[i]; p[i] = p[j]; p[j] = t;
        }
        this._perm = new Uint8Array(512);
        for (let i = 0; i < 512; i++) {
            this._perm[i] = p[i & 255];
        }
        }

        _Grad(hash, x, y) {
        switch (hash & 7) {
            case 0: return  x + y;
            case 1: return -x + y;
            case 2: return  x - y;
            case 3: return -x - y;
            case 4: return  x;
            case 5: return -x;
            case 6: return  y;
            default: return -y;
        }
        }

        // Devuelve un valor aprox. en [-1, 1]
        noise2D(x, y) {
        const xi = Math.floor(x);
        const yi = Math.floor(y);
        const X = xi & 255;
        const Y = yi & 255;
        const xf = x - xi;
        const yf = y - yi;
        const u = math.smootherstep(xf, 0, 1);
        const v = math.smootherstep(yf, 0, 1);

        const p = this._perm;
        const aa = p[p[X] + Y];
        const ab = p[p[X] + Y + 1];
        const ba = p[p[X + 1] + Y];
        const bb = p[p[X + 1] + Y + 1];

        const x1 = math.lerp(u, this._Grad(aa, xf, yf), this._Grad(ba, xf - 1, yf));
        const x2 = math.lerp(u, this._Grad(ab, xf, yf - 1), this._Grad(bb, xf - 1, yf - 1));
        return math.lerp(v, x1, x2) * 0.8;
        }
    }

    // Suma de octavas de Perlin.
    class _NoiseGenerator {
        constructor(params) {
        this._params = params;
        this._perlin = new _Perlin(params.seed);
        }

        Get(x, y) {
        const xs = x / this._params.scale;
        const ys = y / this._params.scale;
        const G = 2.0 ** (-this._params.persistence);
        let amplitude = 1.0;
        let frequency = 1.0;
        let normalization = 0;
        let total = 0;
        for (let o = 0; o < this._params.octaves; o++) {
            const noiseValue = this._perlin.noise2D(
                xs * frequency, ys * frequency) * 0.5 + 0.5;
            total += noiseValue * amplitude;
            normalization += amplitude;
            amplitude *= G;
            frequency *= this._params.lacunarity;
        }
        total /= normalization;
        total = math.sat((total - 0.5) * this._params.contrast + 0.5);
        return Math.pow(
            total, this._params.exponentiation) * this._params.height;
        }
    }

    return {
        Noise: _NoiseGenerator
    }
})();
