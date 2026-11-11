uniform float time;
uniform float delta;
uniform float uMinRadius;
uniform float uMaxRadius;
uniform float uMaxHeight;
uniform float innerFactor;
uniform float noiseFreq;
uniform float noiseStrength;
uniform float uRotationSpeed;
uniform float uTimeStrength;

uniform sampler2D baseParticlesTexture;

#include "../includes/curlNoise.glsl"

float rand(vec2 co){
    return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
}

vec2 rotate2D(vec2 v, float angle) {
    float s = sin(angle);
    float c = cos(angle);
    return vec2(c * v.x - s * v.y, s * v.x + c * v.y);
}

void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 particle = texture2D(texturePosition, uv);
    vec4 baseParticle = texture2D(baseParticlesTexture, uv);
    vec4 pos = particle;
    
    // Position life cycle management
    pos.a -= 0.02; // 1Increase life cycle
    if (pos.a <= 0.0) {
        pos = baseParticle; // Reset to base particle
    }

    else{
    // 2. DÖNME KUVVETİ (Vortex Rotation) - Aynı kalıyor
    float currentRadius = length(pos.xz - vec2(0.0, 0.0));
    float rotationSpeed = uRotationSpeed / (currentRadius + 0.01) * PI; // Avoid division by zero
    float angle = rotationSpeed * delta;
    pos.xz = rotate2D(pos.xz, angle);
    
    // 3. MERKEZE ÇEKME (Hacimsel Şekil Koruma)
    float heightProgress = pos.y / uMaxHeight;
    float currentOuterRadius = mix(uMinRadius, uMaxRadius, pow(heightProgress, 2.2));
    
    // Hedef yarıçap, dış kabuk ile bu parçacığın kendi derinlik oranının çarpımıdır
    float targetRadius = currentOuterRadius * innerFactor;
    targetRadius = smoothstep(0.02, 1.0, targetRadius); // Hedef yarıçapı sınırla
    vec2 dir = normalize(pos.xz);
    pos.xz = mix(pos.xz, dir * targetRadius, 0.08);

    // 4. TÜRBÜLANS VE KAOS (Aynı kalıyor)
    float noiseFreq = noiseFreq;
    float noiseStrength = noiseStrength * 0.05;
    vec3 noise = curl(pos.xyz * noiseFreq, time * uTimeStrength, 0.5) * noiseStrength;
    float positionMoveStrenght = 1.5 * heightProgress; 
    pos.xyz += noise * positionMoveStrenght;
    }

    // w kanalını bozmadan geri yazıyoruz
    gl_FragColor = pos;
}