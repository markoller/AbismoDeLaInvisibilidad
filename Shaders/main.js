//import { GLTFLoader } from 'https://unpkg.com/three@0.122.0/examples/jsm/loaders/GLTFLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
//import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import  {AnimationMixer} from 'https://unpkg.com/three@0.121.1/build/three.module.js';
import * as THREE from "three";
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
//import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

import {Modelo} from './cargar-modelo.js';

//Renderer de WebGL
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;

//Escena nueva en la que agregar todos los objetos
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

//Cosas de la camara
const camera = new THREE.PerspectiveCamera(90, window.innerWidth / window.innerHeight, 0.01, 1000);
camera.position.set(0, 0, 0.1);
camera.lookAt(new THREE.Vector3());
scene.add(camera);

//Agrego luz para que se vean las coasas
const light = new THREE.AmbientLight(0x242424);
//light.castShadow = true;
scene.add(light);
//const dir = new THREE.DirectionalLight(0x242424, 10);
//scene.add(dir);
const spot = new THREE.SpotLight(0xFAFAFA,1000,1000);
spot.shadow.mapSize.width = 1024;
spot.shadow.mapSize.height = 1024;
spot.shadow.camera.near = 500;
spot.shadow.camera.far = 4000;
spot.shadow.camera.fov = 30;
spot.position.set(-100,100,100);
spot.castShadow = true;
scene.add(spot);

var sunlight = new THREE.DirectionalLight();
sunlight.intensity = 0.25;
sunlight.position.set(100, 100, 100);
scene.add(sunlight);
sunlight.castShadow = true;
sunlight.shadow.camera.top = 200;
sunlight.shadow.camera.bottom = - 200;
sunlight.shadow.camera.left = - 200;
sunlight.shadow.camera.right = 200;
sunlight.shadow.camera.near = 1;
sunlight.shadow.camera.far = 1000;

//Controles basicos tipo Blender
const controls = new OrbitControls(camera, renderer.domElement);
controls.update();

var modelo = new Modelo();
await modelo.init('../Modelos/pez_abisal.glb',scene,camera);

//Modelo del piso
var piso = new THREE.Mesh(new THREE.PlaneGeometry(1000,1000,10,10), new THREE.MeshStandardMaterial);
piso.rotateX(-Math.PI/2);
piso.receiveShadow = true;
piso.castShadow = true;
scene.add(piso);

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
    modelo.update();
    //modelo.modelo_outline.material.uniforms.uTime.value = Math.random();
}

document.body.appendChild(renderer.domElement);

animate();


