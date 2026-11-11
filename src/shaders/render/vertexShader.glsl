attribute vec2 referenceUV;
attribute float randomHeight;

uniform sampler2D texturePosition;
uniform float uSize;
uniform float uPixelRatio;
uniform float uTime;
uniform float uMaxHeight;
uniform float uTopHeightJitter;
uniform float uColorMode;       // 0: Klasik Beyaz/Monokrom, 1: Gerçekçi Fırtına & Enkaz
uniform float uIntroProgress;   // 0.0 -> 1.0: Alttan yukarıya doğru giriş (oluşum) animasyonu

varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;

void main() {
    vec4 newPosition = texture2D(texturePosition, referenceUV);

    // Her parçacığın kendi rastgele tepe tavanına göre normalize yüksekliği
    float baseMaxY = uMaxHeight * 0.33;
    float particleMaxY = baseMaxY * (0.78 + randomHeight * 0.55 * uTopHeightJitter);
    float h = clamp(newPosition.y / max(0.1, particleMaxY), 0.0, 1.0);

    vec4 modelPosition = modelMatrix * vec4(newPosition.xyz, 1.0);
    vec4 viewPosition = viewMatrix * modelPosition;
    vec4 projectedPosition = projectionMatrix * viewPosition;

    gl_Position = projectedPosition;

    // GİRİŞ ANİMASYONU (INTRO REVEAL): Alttan (h=0) başlayarak yukarıya (h=1) doğru 0'dan kendi boyutuna büyüme
    float revealFront = uIntroProgress * 1.28 - 0.04;
    float introScale = (1.0 - smoothstep(revealFront - 0.24, revealFront, h)) * smoothstep(0.0, 0.04, uIntroProgress);

    float heightSizeFactor = mix(0.85, 1.35, h) * (0.75 + 0.5 * randomHeight);
    gl_PointSize = (1.0 / max(0.1, -viewPosition.z)) * uSize * uPixelRatio * heightSizeFactor * introScale;

    vUv = referenceUV;

    // Yaşam süresi ve her parçacığın kendi rastgele tepesinde yumuşak sönümlenmesi
    float lifeFade = smoothstep(0.0, 0.35, newPosition.w);
    float topFade = 1.0 - smoothstep(0.78, 1.0, h) * 0.75;
    vAlpha = lifeFade * topFade * smoothstep(0.0, 0.15, introScale);

    // Kullanıcının özelleştirdiği renk paleti korundu
    vec3 classicWhite = vec3(mix(0.92, 1.0, randomHeight));
    vec3 debrisDust = vec3(0.9412, 0.4196, 0.1765);
    vec3 funnelVapor = vec3(0.88, 0.93, 1.0);
    vec3 stormCloud = vec3(0.2353, 0.5098, 0.8667);

    vec3 stormColor = mix(debrisDust, funnelVapor, smoothstep(0.0, 0.28, h));
    stormColor = mix(stormColor, stormCloud, smoothstep(0.45, 1.0, h));
    stormColor *= (0.8 + 0.35 * randomHeight);

    vColor = mix(classicWhite, stormColor, uColorMode);
}
