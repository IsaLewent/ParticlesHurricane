uniform float time;
uniform float delta;
uniform float uMinRadius;
uniform float uMaxRadius;
uniform float uMaxHeight;

#include "../includes/curlNoise.glsl"

float rand(vec2 co){
    return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
}

void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 particle = texture2D(texturePosition, uv);
    vec3 pos = particle.xyz;
    
    // CPU'da kaydettiğimiz derinlik oranını (0.0 merkez, 1.0 dış kabuk) alıyoruz
    float innerFactor = particle.w; 
    
    // 1. YÜKSELME (Updraft)
    // Merkezdeki parçacıklar daha hızlı emilir (örn: merkezde hız 5.0, dışarıda 1.5)
    float upwardSpeed = mix(5.0, 1.5, innerFactor);
    // pos.y += upwardSpeed * delta;

    
    // 2. DÖNME KUVVETİ (Vortex Rotation) - Aynı kalıyor
    float currentRadius = length(pos.xz);
    float rotationSpeed = 2.0 / (currentRadius + 0.5); 
    float angle = rotationSpeed * delta;
    float s = sin(angle);
    float c = cos(angle);
    pos.xz = mat2(c, -s, s, c) * pos.xz; 

    // 3. MERKEZE ÇEKME (Hacimsel Şekil Koruma)
    float heightProgress = pos.y / uMaxHeight;
    float currentOuterRadius = mix(uMinRadius, uMaxRadius, pow(heightProgress, 2.0));
    
    // Hedef yarıçap, dış kabuk ile bu parçacığın kendi derinlik oranının çarpımıdır
    float targetRadius = currentOuterRadius * innerFactor + rand(pos.xz) * 0.1 + 0.1;
    vec2 dir = normalize(pos.xz);
    pos.xz = mix(pos.xz, dir * targetRadius, 0.08); 

    // 4. TÜRBÜLANS VE KAOS (Aynı kalıyor)
    float noiseFreq = 2.5;
    float noiseStrength = 0.5;
    vec3 noise = curl(pos * noiseFreq, time , 0.5) * noiseStrength;
    float positionMoveStrenght = 1.5 * heightProgress; 
    pos += noise * positionMoveStrenght * delta;

    // w kanalını bozmadan geri yazıyoruz
    gl_FragColor = vec4(pos, particle.w);
}