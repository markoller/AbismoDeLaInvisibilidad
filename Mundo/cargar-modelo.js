import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as THREE from "three";

const intensidad_luz = 1;

export class Modelo {
    modelo_outline;
    modelo_base;
    luz;
    animaciones_outline;
    nado_outline;
    animaciones_base;
    nado_base;
    clock;
    pos;
    posX;
    posY;
    posZ;

    constructor() {
        this.pos = new THREE.Vector3(0,0,0);
        this.posX = 0;
        this.posY = 0;
        this.posZ = 0;
        this.clock = new THREE.Clock();
    }

    async init(_name, _scene, _camera) {
        const customMaterial = new THREE.ShaderMaterial({
            vertexShader: document.getElementById('vertexShader').textContent,
            fragmentShader: document.getElementById('fragmentShader').textContent,
            uniforms: {
                uTime: { value: 0 },
                uBaseColor: { value: new THREE.Color(0x1722D9) },
            },
            side: THREE.FrontSide,
            blending: THREE.AdditiveBlending,
            transparent: true
        });

        const loader = new GLTFLoader();

        const gltfOutline = await loader.loadAsync(_name);
        const modeloO = gltfOutline.scene;
        
        modeloO.traverse((obj) => {
            if (obj instanceof THREE.Mesh) {
                obj.material = customMaterial.clone();
            }
        });

        this.modelo_outline = modeloO;
        
        this.animaciones_outline = new THREE.AnimationMixer(this.modelo_outline);
        
        if (gltfOutline.animations && gltfOutline.animations.length > 0) {
            this.nado_outline = this.animaciones_outline.clipAction(gltfOutline.animations[0]);
            this.nado_outline.play();
        }
        
        _scene.add(this.modelo_outline);


        const gltfBase = await loader.loadAsync(_name);
        const modeloB = gltfBase.scene;
        modeloB.castShadow = true;
        modeloB.receiveShadow = true;

        this.modelo_base = modeloB;
        this.animaciones_base = new THREE.AnimationMixer(this.modelo_base);

        if (gltfBase.animations && gltfBase.animations.length > 0) {
            this.nado_base = this.animaciones_base.clipAction(gltfBase.animations[0]);
            this.nado_base.play();
        }

        _scene.add(this.modelo_base);
        //console.log(this);

        const gltfLuz = await loader.loadAsync("../Modelos/Pez/luz.glb");
        this.luz = gltfLuz.scene;
        this.luz.traverse((obj) => {
            if (obj.isLight) {
                obj.intensity *= intensidad_luz;
            }
        });
        this.modelo_base.add(this.luz);
    }

    get(){
        return(this);
    }

    update() {
        const delta = this.clock.getDelta();

        //this.modelo_base.position = this.pos;
        //this.modelo_outline.quaternion.copy(this.modelo_base.quaternion.clone());
        //this.modelo_outline.position.set(this.modelo_base.position.clone());


        /*this.modelo_base.position.x = this.posX;
        this.modelo_base.position.y = this.posY;
        this.modelo_base.position.z = this.posZ;

        this.modelo_outline.position.x = this.posX;
        this.modelo_outline.position.y = this.posY;
        this.modelo_outline.position.z = this.posZ;*/

        //this.posZ +=delta*0.65;

        if (this.animaciones_outline) {
            this.animaciones_outline.update(delta*1.7);
        }
        if (this.animaciones_base) {
            this.animaciones_base.update(delta*1.7);
        }

        this.modelo_outline.traverse((obj) => {
            if (obj instanceof THREE.Mesh) {
                obj.material.uniforms.uTime.value = 0.6;
            }
        });
    }
}

export class ModeloFijo {
    modelo_outline;
    modelo_base;
    pos;
    posX;
    posY;
    posZ;

    constructor() {
        this.pos = new THREE.Vector3(0,0,0);
    }

    async init(_name) {
        // Material de Outline adaptado para objetos estáticos (sin blending aditivo extremo)
        const customMaterial = new THREE.MeshBasicMaterial({
            color: 0x1722D9,
            wireframe: false,
            transparent: true,
            opacity: 0.2,
            blending: THREE.NormalBlending // Cambiado a Normal para asegurar visibilidad
        });

        const loader = new GLTFLoader();

        const gltfOutline = await loader.loadAsync(_name);
        const modeloO = gltfOutline.scene;
        
        modeloO.traverse((obj) => {
            if (obj instanceof THREE.Mesh) {
                obj.material = customMaterial.clone();
            }
        });

        this.modelo_outline = modeloO;

        const gltfBase = await loader.loadAsync(_name);
        const modeloB = gltfBase.scene;
        
        modeloB.traverse((obj) => {
            if (obj instanceof THREE.Mesh && obj.material) {
                obj.material = obj.material.clone();
                obj.castShadow = true;
                obj.receiveShadow = true;
            }
        });

        this.modelo_base = modeloB;
    }

    get(){
        return(this);
    }

    update() {
        if (this.modelo_outline) {
            this.modelo_outline.traverse((obj) => {
                if (obj instanceof THREE.Mesh && obj.material.uniforms) {
                    obj.material.uniforms.uTime.value = 0.6;
                }
            });
        }
    }
}