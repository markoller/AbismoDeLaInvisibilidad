uniform vec3 uBaseColor;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vPosition;

void main() {
    vec3 normal = normalize(vNormal);
    if(!gl_FrontFacing) {
        normal *= -1.0;
    }

    gl_FragColor = vec4(uBaseColor);

    #include <colorspace_fragment>
}
