import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const escena = new THREE.Scene();
const camara = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const gridHelper = new THREE.GridHelper(10, 10);

const renderer = new THREE.WebGLRenderer({alpha: true});
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const geometria = new THREE.BoxGeometry();
const material = new THREE.MeshBasicMaterial({ color: 'rgb(113, 119, 243)' });
const cubo = new THREE.Mesh(geometria, material);

escena.add(cubo);
escena.add(gridHelper);

camara.position.z = 5;
camara.position.y = 2;

const controls = new OrbitControls(camara, renderer.domElement);
controls.minDistance = 3;
controls.maxDistance = 10;
controls.enableDamping = true;
controls.dampingFactor = 0.1;

function animacion() {
    requestAnimationFrame(animacion);
    controls.update();

    renderer.render(escena, camara);
}

animacion();