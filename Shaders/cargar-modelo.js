import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as THREE from "three";

var modelo_cargado;

export class Modelo{
    modelo_outline;
    modelo_base;
    constructor(){}

    async init(_name,_scene,_camera){
        //this.modelo_outline = null;
        //this.modelo_base = null;

        const vertex_shader = "uniform vec3 viewVector;uniform float c;uniform float p;varying float intensity;void main() {    vec3 vNormal = normalize( normalMatrix * normal );	vec3 vNormel = normalize( normalMatrix * viewVector );	intensity = pow( c - dot(vNormal, vNormel), p );gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );}"
    
        const fragment_shader = "uniform vec3 glowColor;varying float intensity;void main() {vec3 glow = glowColor * intensity;gl_FragColor = vec4( glow, 1.0 );}"
    
        
        //Custom material para base
        var material_base = new THREE.ShaderMaterial( 
        	{
        	    uniforms: 
        		{ 
        			"c":   { type: "f", value: 0.1 },
        			"p":   { type: "f", value: 0.0 },
        			glowColor: { type: "c", value: new THREE.Color(0x1722D9) },
        			viewVector: { type: "v3", value: _camera.position }
        		},
        		vertexShader:   vertex_shader,
        		fragmentShader: fragment_shader,
    		side: THREE.FrontSide,
    		blending: THREE.AdditiveBlending,
    		transparent: true
    	});

        //A ver si andan los materials bien
        var customMaterial = new THREE.ShaderMaterial( 
        	{
                vertexShader: document.getElementById('vertexShader').textContent,
                fragmentShader: document.getElementById('fragmentShader').textContent,
                uniforms: {
                uTime: { value: 0 },
                //uBaseColor: { value: new THREE.Color(0x6fd3fb) },
                uBaseColor: { value: new THREE.Color(0x1722D9) },
            },
    		side: THREE.FrontSide,
    		blending: THREE.AdditiveBlending,
    		transparent: true
    	});
        var mod; 
        //Cargo el modelo y lo agrego a la escena
        const loader = new GLTFLoader();
        var gltf = await loader.loadAsync(_name);
        //Aca preparamos el modelo para agregarlo a la escena
            var modelo = gltf.scene;
            modelo.traverse((obj) =>{
                if(obj instanceof THREE.Mesh){
                    obj.material = customMaterial.clone();
                }
            })

        this.modelo_outline = modelo.clone();
        _scene.add(this.modelo_outline);
        console.log(this.modelo_outline);
    
        //Este es el modelo que va a llevar la textura y el shader normal
        gltf = await loader.loadAsync(_name);
            //Aca preparamos el modelo para agregarlo a la escena
            var modelo = gltf.scene;
            //modelo.scale.set(0.999,0.999,0.999);
            modelo.castShadow = true;
            modelo.receiveShadow = true;
            modelo.traverse((obj) =>{
                if(obj instanceof THREE.Mesh){
                    //obj.material = new THREE.MeshStandardMaterial;
                    //obj.material = material_base;
                }
            })
            //mod = modelo.clone();
        this.modelo_base = modelo.clone();
        _scene.add(this.modelo_base);
        //this.modelo_base = mod;

        //console.log(this);
    }

    update(){

        this.modelo_outline.traverse((obj)=>{
            if(obj instanceof THREE.Mesh){
                obj.material.uniforms.uTime.value = 0.6;
            };
        });
      //if(this.modelo_outline){this.modelo_outline.material.uniforms.uTime.value = Math.random();}
      //console.log(this);
    }

    set_modelo_outline(mod,scene){this.modelo_outline = mod; scene.add(this.modelo_outline);}
    set_modelo_base(mod,scene){this.modelo_base = mod; scene.add(this.modelo_base);}
}
