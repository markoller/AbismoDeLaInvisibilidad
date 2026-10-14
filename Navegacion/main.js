import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const escena = new THREE.Scene();
const camara = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const gridHelper = new THREE.GridHelper(100, 100);

const renderer = new THREE.WebGLRenderer({alpha: true});
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

let modeloPez = null;
let adelante = 0;
let atras = 0;

escena.add(gridHelper);

camara.position.z = 5;
camara.position.y = 2;

const controls = new OrbitControls(camara, renderer.domElement);
controls.minDistance = 3;
controls.maxDistance = 10;
controls.enableDamping = true;
controls.dampingFactor = 0.1;
controls.maxPolarAngle = Math.PI / 3;
controls.minPolarAngle = Math.PI / 3;

const loader = new GLTFLoader();
loader.load(
    '../Modelos/pez_abisal.glb',
    function (gltf) {
        modeloPez = gltf.scene;
        escena.add(modeloPez);
    },
    undefined,
    function (error) {
        console.error('Error al cargar el modelo:', error);
    }
);

animacion();
joystick();

function animacion() {
    updatePersonaje();

    if (modeloPez) {
        camara.position.sub(controls.target);
        controls.target.copy(modeloPez.position);
        camara.position.add(controls.target);
    }

    requestAnimationFrame(animacion);
    controls.update();
    renderer.render(escena, camara);
}

function updatePersonaje() {
    if (!modeloPez) return;

    const velocidad = 0.1;
    const direccion = new THREE.Vector3();

    camara.getWorldDirection(direccion);
    direccion.y = 0;
    direccion.normalize();

    if (adelante > 0) {
        modeloPez.position.addScaledVector(direccion, adelante * velocidad);
        modeloPez.lookAt(modeloPez.position.clone().add(direccion));
    }

    if (atras > 0) {
        modeloPez.position.addScaledVector(direccion, -atras * velocidad);
        modeloPez.lookAt(modeloPez.position.clone().sub(direccion));
    }

    modeloPez.updateMatrixWorld();
}

function joystick() {
    const options = {
        zone: document.getElementById("joystickZona"),
        mode: "semi",
        size: 100,
        lockY: true,
        color: "red",
    }

    const joyManager = nipplejs.create(options);

    joyManager.on("move", function(evt, data) {
        const movAdelante = data.vector.y;

        if (movAdelante > 0){
            adelante = Math.abs(movAdelante);
            atras = 0;
        }
        else if (movAdelante < 0 ){
            adelante = 0;
            atras = Math.abs(movAdelante);
        }

        if (data.instance && data.instance.ui) {
            data.instance.ui.el.style.opacity = "0";
        }
    });

    joyManager.on("end", function(evt){
        adelante = 0;
        atras = 0;
    });
}