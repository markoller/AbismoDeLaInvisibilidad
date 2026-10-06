import * as THREE from 'three';
import Stats from 'three/addons/libs/stats.module.js';



export const graphics = (function() {

    function _GetImageData(image) {
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;

        const context = canvas.getContext( '2d' );
        context.drawImage(image, 0, 0);

        return context.getImageData(0, 0, image.width, image.height);
    }

    function _GetPixel(imagedata, x, y) {
        const position = (x + imagedata.width * y) * 4;
        const data = imagedata.data;
        return {
            r: data[position],
            g: data[position + 1],
            b: data[position + 2],
            a: data[position + 3]
        };
    }

    class _Graphics {
        constructor(game) {
        }

        Initialize() {
        try {
            this._threejs = new THREE.WebGLRenderer({
                antialias: true,
            });
        } catch (e) {
            console.error(e);
            return false;
        }
        this._threejs.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this._threejs.setSize(window.innerWidth, window.innerHeight);

        const target = document.getElementById('target');
        target.appendChild(this._threejs.domElement);

        this._stats = new Stats();
        target.appendChild(this._stats.dom);

        window.addEventListener('resize', () => {
            this._OnWindowResize();
        }, false);

        const fov = 60;
        const aspect = window.innerWidth / window.innerHeight;
        const near = 1;
        const far = 10000.0;
        this._camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
        this._camera.position.set(75, 20, 0);

        this._scene = new THREE.Scene();
        this._scene.background = new THREE.Color(0xaaaaaa);

        this._CreateLights();

        return true;
        }

        _CreateLights() {
        this._scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x4a4a3a, 0.8));

        const light = new THREE.DirectionalLight(0xffffff, 0.9);
        light.position.set(-300, 500, -200);
        light.castShadow = false;
        this._scene.add(light);
        }

        _OnWindowResize() {
        this._camera.aspect = window.innerWidth / window.innerHeight;
        this._camera.updateProjectionMatrix();
        this._threejs.setSize(window.innerWidth, window.innerHeight);
        }

        get Scene() {
        return this._scene;
        }

        get Camera() {
        return this._camera;
        }

        Render(timeInSeconds) {
        this._threejs.render(this._scene, this._camera);
        this._stats.update();
        }
    }

    return {
        Graphics: _Graphics,
        GetPixel: _GetPixel,
        GetImageData: _GetImageData,
    };
})();
