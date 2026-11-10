attribute vec2 referenceUV;
attribute float aRandomHeight;

uniform sampler2D texturePosition;
uniform float uSize;
uniform float uPixelRatio;
uniform float uTime;

varying vec2 vUv;
varying vec3 vColor;

void main() {
    //? Model Position 
    vec4 newPosition = texture2D(texturePosition, referenceUV);

    vec4 modelPosiiton = modelMatrix * vec4(newPosition.xyz, 1.0);
    vec4 viewPosition = viewMatrix * modelPosiiton;
    vec4 projectedPosition = projectionMatrix * viewPosition;
    
    // Final Position
    gl_Position = projectedPosition;

    // Final Point Size
    gl_PointSize = (1.0 / -viewPosition.z);
    gl_PointSize *= uSize * uPixelRatio;

    // Varyingsc
    vUv = referenceUV;
    vColor = vec3(1.0);
}