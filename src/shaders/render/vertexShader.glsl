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

    // Time angle
    float dynamicTime = (uTime * 0.5) + sin(uTime * 0.05) * 2.5; // Adjust the multiplier for speed
    float angle = atan(newPosition.x, newPosition.z);
    float angleOffset = (sin(angle + dynamicTime)) * 0.5 + 0.5; // 2 * PI

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
    vColor = vec3(1.0); // Color based on height offset
}