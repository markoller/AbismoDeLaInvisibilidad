//import { GLTFLoader } from 'https://unpkg.com/three@0.122.0/examples/jsm/loaders/GLTFLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
//import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import  {AnimationMixer} from 'https://unpkg.com/three@0.121.1/build/three.module.js';
import * as THREE from "three";
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
//import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

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

const vertex_shader = "uniform vec3 viewVector;uniform float c;uniform float p;varying float intensity;void main() {    vec3 vNormal = normalize( normalMatrix * normal );	vec3 vNormel = normalize( normalMatrix * viewVector );	intensity = pow( c - dot(vNormal, vNormel), p );	    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );}"

const fragment_shader = "uniform vec3 glowColor;varying float intensity;void main() {vec3 glow = glowColor * intensity;gl_FragColor = vec4( glow, 1.0 );}"

//A ver si andan los materials bien
var customMaterial = new THREE.ShaderMaterial( 
	{
	    uniforms: 
		{ 
			"c":   { type: "f", value: 0.5 },
			"p":   { type: "f", value: 0.4 },
			glowColor: { type: "c", value: new THREE.Color(0x1722D9) },
			viewVector: { type: "v3", value: camera.position }
		},
		vertexShader:   vertex_shader,
		fragmentShader: fragment_shader,
		side: THREE.FrontSide,
		blending: THREE.AdditiveBlending,
		transparent: true
	}   );

//Cargo el modelo y lo agrego a la escena
const loader = new GLTFLoader();
loader.load('Modelos/pez_abisal_luz.glb', function(gltf) {
    //Aca preparamos el modelo para agregarlo a la escena
    var modelo = gltf.scene;
    modelo.traverse((obj) =>{
        if(obj instanceof THREE.Mesh){
            obj.material = customMaterial.clone();
        }
    })

    scene.add(modelo);
}, undefined, function(error) {
    console.error(error);
});

//Modelo del piso
var piso = new THREE.Mesh(new THREE.PlaneGeometry(1000,1000,10,10), new THREE.MeshStandardMaterial);
piso.rotateX(-Math.PI/2);
piso.receiveShadow = true;
piso.castShadow = true;
scene.add(piso);

//Este es el modelo que va a llevar la textura y el shader normal
loader.load('Modelos/pez_abisal_luz.glb', function(gltf) {
    //Aca preparamos el modelo para agregarlo a la escena
    var modelo = gltf.scene;
    modelo.scale.set(0.99,0.99,0.99);
    modelo.castShadow = true;
    modelo.receiveShadow = true;
    modelo.traverse((obj) =>{
        if(obj instanceof THREE.Mesh){
            //obj.material = new THREE.MeshStandardMaterial;
        }
    })
    scene.add(modelo);
}, undefined, function(error) {
    console.error(error);
});



function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

document.body.appendChild(renderer.domElement);

animate();
