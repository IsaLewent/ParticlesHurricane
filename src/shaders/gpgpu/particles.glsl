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

// Alt boru (yoğuşma hunisi) zemin gezinme parametreleri
uniform float uWanderRadius;      // Alt ucun zeminde gezinme yarıçapı
uniform float uWanderSpeed;       // Zeminde gezinme hızı
uniform float uBendPower;         // Borunun aşağıdan yukarıya esneme/bükülme keskinliği
uniform float uWhipLag;           // Yükseklikle artan faz gecikmesi (kamçı/yılan kıvrımı etkisi)
uniform float uUpdraftSpeed;      // Yukarı doğru helisel vakum/çekiş hızı
uniform float uDebrisFlare;       // Zemine değen uçta oluşan toz/enkaz eteği genişlemesi
uniform vec2 uGroundTarget;       // Fare ile kontrol edilen zemin hedef noktası
uniform float uUseMouseTarget;    // 0.0 = Otomatik gezinme, 1.0 = Fare takibi

// Yeni eklenen Hız, Spawn İvmesi, Tepe Yükseklik Dağılımı ve İç Boşluk Uniformları
uniform float uTopSlowdown;       // Yukarı çıktıkça dönüş hızının yavaşlama oranı (0.0 - 0.95)
uniform float uRandomSpeedVar;    // Parçacıklar arası rastgele hız çeşitliliği (0.0 - 1.0)
uniform float uSpawnBurst;        // Yeniden doğuşta (spawn) ani fırlama/hız ivmesi
uniform float uTopHeightJitter;   // En tepedeki düzlüğü kıran rastgele yükseklik dağılımı
uniform float uInnerHollow;       // Tornadonun iç boşluk (göz) yarıçap çarpanı
uniform float uShellThickness;    // Tornado duvarının et kalınlığı

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

/**
 * Dinamik Hortum Omurgası C(h, t)
 * h = 0.0 (zemin / alt boru ucu) -> h = 1.0 (bulut tabanı / üst huni)
 */
vec2 getSpineCenter(float h, float t) {
    float wt = t * uWanderSpeed;

    // 1. Zemindeki alt boru ucunun (touchdown point) Lissajous + harmonik gezinme yörüngesi
    vec2 autoGroundPos = vec2(
        sin(wt * 0.83) * 0.65 + cos(wt * 1.47 + 1.2) * 0.35,
        cos(wt * 0.67 + 0.5) * 0.65 + sin(wt * 1.23 + 2.4) * 0.35
    ) * uWanderRadius;

    vec2 groundTip = mix(autoGroundPos, uGroundTarget, uUseMouseTarget);

    // 2. Aşağıdan yukarıya doğru azalan etki katsayısı: (1 - h)^uBendPower
    float bottomWeight = pow(clamp(1.0 - h, 0.0, 1.0), uBendPower);

    // 3. Faz gecikmeli kamçı/halat dalgası (Phase-Delayed Whip Wave)
    float delayedPhase = wt - h * uWhipLag;
    vec2 whipWave = vec2(
        sin(delayedPhase * 1.35 + 0.8),
        cos(delayedPhase * 1.15 + 2.1)
    ) * (uWanderRadius * 0.38) * sin(h * PI) * (1.0 - h * 0.55);

    // 4. Üst bulut tabanının çok hafif salınımı
    vec2 cloudSway = vec2(
        sin(wt * 0.25 + 1.7),
        cos(wt * 0.21 + 0.4)
    ) * (uWanderRadius * 0.12) * h * h;

    return groundTip * bottomWeight + whipWave + cloudSway;
}

void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 particle = texture2D(texturePosition, uv);
    vec4 baseParticle = texture2D(baseParticlesTexture, uv);
    vec4 pos = particle;

    // Her parçacık için sabit rastgele tohumlar
    float rndSpeed = rand(uv + vec2(0.13, 0.71));
    float rndTop   = rand(uv + vec2(0.57, 0.29));
    float rndShell = rand(uv + vec2(0.83, 0.41));

    // TEPE DÜZLÜĞÜNÜ KIRAN RASTGELE TAVAN YÜKSEKLİĞİ:
    // Her parçacığın ulaşabileceği maksimum tepe yüksekliği birbirinden farklıdır
    float baseMaxY = uMaxHeight * 0.33;
    float crownWave = sin(rndTop * 6.2831 + time * 0.8) * 0.25;
    float particleMaxY = baseMaxY * (0.78 + (rndTop * 0.55 + crownWave * 0.2) * uTopHeightJitter);

    // Parçacık ömrü azaltımı (rastgele hız çarpanıyla uyumlu)
    pos.a -= (0.010 + delta * 0.22) * mix(0.8, 1.25, rndSpeed);

    if (pos.a <= 0.0 || pos.y > particleMaxY) {
        pos = baseParticle;
        // Yeniden doğarken parçacığa rastgele bir başlangıç yüksekliği ver (alt ve orta bölgelerde yoğunlaşsın)
        float spawnRatio = pow(rand(uv + vec2(fract(time * 0.37), 0.19)), 1.4);
        pos.y = spawnRatio * particleMaxY * 0.85;
        float spawnH = clamp(pos.y / max(0.1, baseMaxY), 0.0, 1.0);

        // Doğrudan iç boşluğun (uInnerHollow) dışındaki kabukta ve omurga üzerinde doğur
        float funnelAtSpawn = mix(uMinRadius * 0.35, uMaxRadius * 0.14, pow(spawnH, 2.25));
        float shellAtSpawn = uInnerHollow + rndShell * uShellThickness;
        float spawnRadius = max(0.02, funnelAtSpawn * innerFactor * shellAtSpawn);
        float spawnTheta = rand(uv + vec2(time * 0.11, 0.63)) * PI * 2.0;

        pos.xz = getSpineCenter(spawnH, time) + vec2(cos(spawnTheta), sin(spawnTheta)) * spawnRadius;
        pos.a = baseParticle.a;
    } else {
        // 1. YÜKSEKLİK ORANI VE DİNAMİK OMURGA MERKEZİ
        float h = clamp(pos.y / max(0.1, baseMaxY), 0.0, 1.25);
        float clampedH = clamp(h, 0.0, 1.0);
        vec2 prevSpine = getSpineCenter(clampedH, time - delta);
        vec2 currSpine = getSpineCenter(clampedH, time);

        // Omurga yer değiştirdikçe parçacığı omurga ile birlikte taşı (Advection)
        pos.xz += (currSpine - prevSpine);

        // Parçacığın o yükseklikteki omurga merkezine göre yerel konumu
        vec2 localXZ = pos.xz - currSpine;

        // 2. SPAWN İVMESİ + RASTGELE HIZ + YÜKSEKLİĞE GÖRE YAVAŞLAYAN DÖNÜŞ HIZI
        // Parçacık yeni doğduğunda (pos.a, baseParticle.a'ya yakınken) ani bir spawn hız patlaması alır
        float lifeProgress = clamp(pos.a / max(0.1, baseParticle.a), 0.0, 1.0);
        float spawnPulse = pow(smoothstep(0.65, 1.0, lifeProgress), 2.0) * uSpawnBurst;
        // Ayrıca yaşamı boyunca zaman zaman kısa mikro-ivmeler (gust) alır
        float microGust = pow(max(0.0, sin(time * 2.5 + rndSpeed * 25.0)), 6.0) * (uSpawnBurst * 0.45);
        float burstMultiplier = 1.0 + spawnPulse + microGust;

        // Her parçacığın bireysel rastgele hız çarpanı
        float randomSpeedFactor = mix(1.0, 0.45 + rndSpeed * 1.25, uRandomSpeedVar);

        // Yukarıdaki parçacıklar aşağıdaki parçacıklara göre daha yavaş döner
        float heightSpeedFactor = mix(1.0, 1.0 - clamp(uTopSlowdown, 0.0, 0.95), pow(clampedH, 0.75));

        float currentRadius = length(localXZ);
        float baseAngularVel = (uRotationSpeed / (currentRadius + 0.045)) * PI;
        float angle = baseAngularVel * heightSpeedFactor * randomSpeedFactor * burstMultiplier * delta;
        localXZ = rotate2D(localXZ, angle);

        // 3. İÇ BOŞLUK (HOLLOW CORE) VE HUNİ DUVARI KORUMA
        float funnelShape = mix(uMinRadius * 0.35, uMaxRadius * 0.14, pow(clampedH, 2.25));
        float groundSkirt = pow(1.0 - smoothstep(0.0, 0.14, clampedH), 2.2) * uDebrisFlare * 0.18;

        // İç boşluk (uInnerHollow) ve duvar kalınlığı (uShellThickness) ile hedef kabuk yarıçapı
        float particleShell = uInnerHollow + rndShell * uShellThickness;
        float baseRingRadius = (funnelShape + groundSkirt) * innerFactor;
        float minInnerRadius = max(0.01, baseRingRadius * uInnerHollow);
        float targetRadius = max(0.015, baseRingRadius * particleShell);

        vec2 dir = normalize(localXZ + vec2(0.0001));
        float pullStrength = mix(0.20, 0.08, clampedH);
        localXZ = mix(localXZ, dir * targetRadius, pullStrength);

        // Türbülans parçacığı iç boşluğa (göz içine) iterse dışarı, iç duvara geri it
        if (length(localXZ) < minInnerRadius) {
            localXZ = mix(localXZ, dir * minInnerRadius, 0.45);
        }

        pos.xz = currSpine + localXZ;

        // 4. YUKARI VAKUM (Helisel Updraft - hem yüksekliğe hem rastgele hıza hem de spawn ivmesine duyarlı)
        float updraft = uUpdraftSpeed * heightSpeedFactor * randomSpeedFactor * (1.0 + spawnPulse * 0.5) * delta * 0.25;
        pos.y += updraft;

        // 5. TÜRBÜLANS VE TEPE DALGALANMASI (Curl Noise)
        vec3 noise = curl(
            vec3(localXZ.x, pos.y, localXZ.y) * noiseFreq,
            time * uTimeStrength,
            0.5
        ) * (noiseStrength * 0.05);

        // Tepede düz kesilmeyi önlemek için üst kısımda dikey (Y) türbülansı güçlendiriyoruz
        float turbulenceMask = mix(0.18, 1.5, pow(clampedH, 1.4));
        noise.y *= mix(1.0, 1.0 + uTopHeightJitter * 1.8, smoothstep(0.65, 1.0, clampedH));
        pos.xyz += noise * turbulenceMask;
    }

    gl_FragColor = pos;
}
