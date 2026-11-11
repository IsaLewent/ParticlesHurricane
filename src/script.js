import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GPUComputationRenderer } from "three/addons/misc/GPUComputationRenderer.js";
import { Pane } from "tweakpane";
import Stats from "stats.js";
import gsap from "gsap";

import vertexShader from "./shaders/render/vertexShader.glsl";
import fragmentShader from "./shaders/render/fragmentShader.glsl";
import gpgpuParticlesFragmentShader from "./shaders/gpgpu/particles.glsl";

function lerp(a, b, t) {
    return a + (b - a) * t;
}

//? 1. Stats.js FPS Sayacı (Sol Üst Köşe)
const stats = new Stats();
stats.showPanel(0); // 0: fps, 1: ms, 2: mb
stats.dom.style.position = "fixed";
stats.dom.style.top = "12px";
stats.dom.style.left = "12px";
stats.dom.style.zIndex = "100";
document.body.appendChild(stats.dom);

//? 2. Tweakpane Kontrol Paneli
const pane = new Pane({
    title: "Tornado GPGPU Ayarları",
    expanded: false,
});

//? Canvas & Scene
const canvas = document.querySelector("canvas.webgl");
const scene = new THREE.Scene();

const sizes = {
    width: window.innerWidth,
    height: window.innerHeight,
};

//? Camera
const camera = new THREE.PerspectiveCamera(75, sizes.width / sizes.height, 0.1, 1000);
const finalCameraPos = new THREE.Vector3(0.24, 2.65, 3.45);
const finalTargetPos = new THREE.Vector3(0.0, 1.35, 0.0);
camera.position.copy(finalCameraPos);
scene.add(camera);

//? Renderer
const renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: true,
});
renderer.setSize(sizes.width, sizes.height);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

//? Zemin Referans Izgarası
const groundGrid = new THREE.GridHelper(6, 24, 0x334155, 0x1e293b);
groundGrid.visible = false;
groundGrid.position.y = 0.0;
groundGrid.material.transparent = true;
groundGrid.material.opacity = 0.35;
scene.add(groundGrid);

/**
 * GPGPU Kurulumu
 */
const gpgpuSize = 128; // 128x128 = 16.384 parçacık
const gpuCompute = new GPUComputationRenderer(gpgpuSize, gpgpuSize, renderer);

const positionTexture = gpuCompute.createTexture();
const positionSize = positionTexture.image.data.length;
const particleCount = gpgpuSize * gpgpuSize;

const aRandomHeight = new Float32Array(particleCount);

const maxHeight = 9.5;
const minRadius = 0.4;
const maxRadius = 100.0;
const innerFactor = 1.15;

// Kullanıcının özelleştirdiği başlangıç parametreleri korundu
const uMaxHeight = 10.0;
const uMinRadius = 0.08;
const uMaxRadius = 9.75;
const initialInnerHollow = 0.41;
const initialShellThickness = 0.67;

for (let i = 0; i < positionSize; i += 4) {
    const idx = i / 4;
    const rndTop = Math.random();
    const particleMaxH = maxHeight * (0.75 + rndTop * 0.55);
    const y = Math.pow(Math.random(), 1.15) * particleMaxH;
    const heightProgress = Math.min(1.0, y / maxHeight);

    const outerRadius = lerp(minRadius, maxRadius, Math.pow(heightProgress, 2.2));
    const shellDepth = initialInnerHollow + Math.random() * initialShellThickness;
    const radius = outerRadius * shellDepth;
    const theta = Math.random() * Math.PI * 2.0;

    const x = Math.cos(theta) * radius;
    const z = Math.sin(theta) * radius;

    positionTexture.image.data[i + 0] = x * 0.01;
    positionTexture.image.data[i + 1] = y * 0.3;
    positionTexture.image.data[i + 2] = z * 0.01;
    positionTexture.image.data[i + 3] = Math.random() * 2.5 + 1.5; // Yaşam süresi (w)

    aRandomHeight[idx] = rndTop;
}

const positionVariable = gpuCompute.addVariable(
    "texturePosition",
    gpgpuParticlesFragmentShader,
    positionTexture
);
gpuCompute.setVariableDependencies(positionVariable, [positionVariable]);

const uniforms = positionVariable.material.uniforms;
uniforms.time = { value: 0.0 };
uniforms.delta = { value: 0.0 };
uniforms.baseParticlesTexture = { value: positionTexture };
uniforms.uMinRadius = { value: uMinRadius };
uniforms.uMaxRadius = { value: uMaxRadius };
uniforms.uMaxHeight = { value: uMaxHeight };
uniforms.innerFactor = { value: innerFactor };
uniforms.noiseFreq = { value: 1.125 };
uniforms.noiseStrength = { value: 0.05 };
uniforms.uRotationSpeed = { value: 0.48 };
uniforms.uTimeStrength = { value: 1.0 };

// Alt Boru Zemin Gezinme Uniformları (Kullanıcı ayarları korundu)
uniforms.uWanderRadius = { value: 1.23 };
uniforms.uWanderSpeed = { value: 1.21 };
uniforms.uBendPower = { value: 5.0 };
uniforms.uWhipLag = { value: 3.9 };
uniforms.uUpdraftSpeed = { value: 3.6 };
uniforms.uDebrisFlare = { value: 0.35 };
uniforms.uGroundTarget = { value: new THREE.Vector2(0, 0) };
uniforms.uUseMouseTarget = { value: 0.0 };

// Hız, Spawn İvmesi, Tepe Dağılımı ve İç Boşluk Uniformları
uniforms.uTopSlowdown = { value: 0.62 };
uniforms.uRandomSpeedVar = { value: 1.0 };
uniforms.uSpawnBurst = { value: 2.0 };
uniforms.uTopHeightJitter = { value: 0.35 };
uniforms.uInnerHollow = { value: initialInnerHollow };
uniforms.uShellThickness = { value: initialShellThickness };

const err = gpuCompute.init();
if (err !== null) {
    console.error(err);
}

/**
 * Parçacık Geometrisi ve Materyali
 */
const geometry = new THREE.BufferGeometry();
const positions = new Float32Array(particleCount * 3);
const referenceUVs = new Float32Array(particleCount * 2);

for (let i = 0; i < particleCount; i++) {
    const i3 = i * 3;
    const i2 = i * 2;

    positions[i3 + 0] = 0;
    positions[i3 + 1] = 0;
    positions[i3 + 2] = 0;

    referenceUVs[i2 + 0] = (i % gpgpuSize) / gpgpuSize;
    referenceUVs[i2 + 1] = Math.floor(i / gpgpuSize) / gpgpuSize;
}

geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
geometry.setAttribute("referenceUV", new THREE.BufferAttribute(referenceUVs, 2));
geometry.setAttribute("randomHeight", new THREE.BufferAttribute(aRandomHeight, 1));

const material = new THREE.ShaderMaterial({
    vertexShader: vertexShader,
    fragmentShader: fragmentShader,
    uniforms: {
        texturePosition: { value: null },
        uSize: new THREE.Uniform(5.5),
        uTime: { value: 0.0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        uMaxHeight: { value: uMaxHeight },
        uTopHeightJitter: { value: 0.5 },
        uColorMode: { value: 1.0 },
        uIntroProgress: { value: 0.0 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
});

const points = new THREE.Points(geometry, material);
points.frustumCulled = false;
scene.add(points);

//? OrbitControls
const controls = new OrbitControls(camera, canvas);
controls.target.copy(finalTargetPos);
controls.enableDamping = true;

/**
 * GSAP Kamera Eğrisi (Camera Curve Path) ve Alttan Yukarıya Tornado Oluşum Animasyonu
 * Çizimdeki J/L-şekilli yumuşak kamera yörüngesini CatmullRomCurve3 ile tanımlar.
 */
const cameraCurvePoints = [
    new THREE.Vector3(-3.1, 4.85, 0.55),  // 1. Eğrinin sol-üst dikey başlangıç ucu
    new THREE.Vector3(-2.75, 2.55, 1.45), // 2. Dikey kavisli iniş
    new THREE.Vector3(-1.85, 1.05, 2.45), // 3. Çizimdeki yumuşak alt kavis dirseği
    new THREE.Vector3(-0.70, 1.45, 3.20), // 4. Tornadonun tabanından yatay kavisle cepheye dönüş
    finalCameraPos.clone(),               // 5. Nihai kamera konumu (0.24, 2.65, 3.45)
];
const cameraCurve = new THREE.CatmullRomCurve3(cameraCurvePoints, false, "centripetal", 0.5);

// Kameranın bakış hedefi (controls.target) tornadonun alttan yukarıya büyümesiyle senkron yükselir
const targetCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.0, 0.12, 0.0),    // Başlangıçta zemindeki alt boru ucuna odaklanır
    new THREE.Vector3(-0.15, 0.55, 0.0),  // Orta gövde oluşurken takip eder
    new THREE.Vector3(-0.05, 1.05, 0.0),  // Üst huni açılırken yükselir
    finalTargetPos.clone(),               // Nihai merkez (0.0, 1.35, 0.0)
]);

// Kamera Eğrisi Görselleştiricisi (İsteğe bağlı Tweakpane'den açılıp kapatılabilir)
const curveGeometry = new THREE.BufferGeometry().setFromPoints(cameraCurve.getPoints(80));
const curveMaterial = new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.65 });
const cameraCurveLine = new THREE.Line(curveGeometry, curveMaterial);
cameraCurveLine.visible = false;
scene.add(cameraCurveLine);

const introState = {
    progress: 0.0,
    cameraT: 0.0,
    duration: 4.2,
    isPlaying: false,
    showCurvePath: false,
};

let activeTimeline = null;

function playIntroAnimation() {
    if (activeTimeline) {
        activeTimeline.kill();
    }

    introState.isPlaying = true;
    introState.progress = 0.0;
    introState.cameraT = 0.0;
    material.uniforms.uIntroProgress.value = 0.0;

    // OrbitControls'u giriş animasyonu süresince devre dışı bırak (çakışmayı önler)
    controls.enabled = false;

    // Başlangıç kamera ve hedef konumunu eğrinin 0. noktasına yerleştir
    cameraCurve.getPointAt(0.0, camera.position);
    targetCurve.getPointAt(0.0, controls.target);
    camera.lookAt(controls.target);

    activeTimeline = gsap.timeline({
        onComplete: () => {
            introState.isPlaying = false;
            controls.enabled = true;
        },
    });

    // 1. Kamera eğrisi boyunca ultra yumuşak (power2.inOut) hareket
    activeTimeline.to(
        introState,
        {
            cameraT: 1.0,
            duration: introState.duration,
            ease: "power2.inOut",
            onUpdate: () => {
                cameraCurve.getPointAt(introState.cameraT, camera.position);
                targetCurve.getPointAt(introState.cameraT, controls.target);
                camera.lookAt(controls.target);
            },
        },
        0
    );

    // 2. Kamera hareketiyle birebir senkron şekilde tornadonun alttan yukarıya (0 -> kendi boyutu) büyümesi
    activeTimeline.to(
        material.uniforms.uIntroProgress,
        {
            value: 1.0,
            duration: introState.duration * 0.95,
            ease: "sine.inOut",
        },
        0.08
    );
}

// Sayfa açıldığında giriş ve kamera curve animasyonunu otomatik başlat
playIntroAnimation();

/**
 * Tweakpane Klasörleri ve Kontrolleri
 */
const introFolder = pane.addFolder({ title: "0. Giriş & Kamera Curve Animasyonu (GSAP)", expanded: true });
introFolder.addBinding(introState, "duration", { min: 1.5, max: 10.0, step: 0.1, label: "Giriş Süresi (sn)" });
introFolder.addBinding(material.uniforms.uIntroProgress, "value", { min: 0.0, max: 1.0, step: 0.01, label: "Oluşum (Alttan Üste)" });
introFolder.addBinding(introState, "showCurvePath", { label: "Kamera Eğrisini Göster" }).on("change", (ev) => {
    cameraCurveLine.visible = ev.value;
});
introFolder.addButton({ title: "Giriş Animasyonunu Tekrar Oynat" }).on("click", () => {
    playIntroAnimation();
});

const hollowFolder = pane.addFolder({ title: "1. İç Boşluk (Göz) & Tepe Dağılımı", expanded: true });
hollowFolder.addBinding(uniforms.uInnerHollow, "value", { min: 0.0, max: 1.5, step: 0.01, label: "İç Boşluk Çapı" });
hollowFolder.addBinding(uniforms.uShellThickness, "value", { min: 0.05, max: 1.2, step: 0.01, label: "Duvar Kalınlığı" });
hollowFolder.addBinding(uniforms.uTopHeightJitter, "value", { min: 0.0, max: 2.0, step: 0.01, label: "Tepe Rastgeleliği" }).on("change", (ev) => {
    material.uniforms.uTopHeightJitter.value = ev.value;
});

const speedFolder = pane.addFolder({ title: "2. Hız, Yükseklik & Spawn İvmesi", expanded: true });
speedFolder.addBinding(uniforms.uRotationSpeed, "value", { min: 0.05, max: 2.5, step: 0.01, label: "Taban Dönüş Hızı" });
speedFolder.addBinding(uniforms.uTopSlowdown, "value", { min: 0.0, max: 0.92, step: 0.01, label: "Üst Yavaşlama" });
speedFolder.addBinding(uniforms.uRandomSpeedVar, "value", { min: 0.0, max: 1.0, step: 0.01, label: "Rastgele Hız Farkı" });
speedFolder.addBinding(uniforms.uSpawnBurst, "value", { min: 0.0, max: 3.5, step: 0.05, label: "Spawn Patlama Hızı" });
speedFolder.addBinding(uniforms.uUpdraftSpeed, "value", { min: 0.0, max: 4.0, step: 0.05, label: "Yukarı Vakum" });

const groundFolder = pane.addFolder({ title: "3. Alt Boru Zemin Hareketi", expanded: true });
groundFolder.addBinding(uniforms.uWanderRadius, "value", { min: 0.0, max: 1.8, step: 0.01, label: "Zemin Gezinme Çapı" });
groundFolder.addBinding(uniforms.uWanderSpeed, "value", { min: 0.0, max: 3.0, step: 0.01, label: "Gezinme Hızı" });
groundFolder.addBinding(uniforms.uBendPower, "value", { min: 1.0, max: 5.0, step: 0.05, label: "Boru Esneme Üssü" });
groundFolder.addBinding(uniforms.uWhipLag, "value", { min: 0.0, max: 5.0, step: 0.05, label: "Kamçı Gecikmesi" });
groundFolder.addBinding(uniforms.uDebrisFlare, "value", { min: 0.0, max: 2.5, step: 0.05, label: "Zemin Enkaz Eteği" });

const shapeFolder = pane.addFolder({ title: "4. Huni Boyutu & Görünüm", expanded: false });
shapeFolder.addBinding(uniforms.uMinRadius, "value", { min: 0.01, max: 1.5, step: 0.01, label: "Alt Boru Darlığı" });
shapeFolder.addBinding(uniforms.uMaxRadius, "value", { min: 2.0, max: 15.0, step: 0.05, label: "Üst Genişlik" });
shapeFolder.addBinding(uniforms.uMaxHeight, "value", { min: 4.0, max: 15.0, step: 0.1, label: "Yükseklik" });
shapeFolder.addBinding(uniforms.noiseStrength, "value", { min: 0.0, max: 1.0, step: 0.01, label: "Türbülans Gücü" });
shapeFolder.addBinding(material.uniforms.uSize, "value", { min: 1.0, max: 25.0, step: 0.1, label: "Parçacık Boyutu" });

const interactionState = {
    mouseControl: false,
    showGrid: false,
    colorMode: 1,
};

shapeFolder.addBinding(interactionState, "mouseControl", { label: "Fareyle Zeminde Sürükle" }).on("change", (ev) => {
    uniforms.uUseMouseTarget.value = ev.value ? 1.0 : 0.0;
});
shapeFolder.addBinding(interactionState, "showGrid", { label: "Zemin Izgarası" }).on("change", (ev) => {
    groundGrid.visible = ev.value;
});
shapeFolder.addBinding(interactionState, "colorMode", {
    label: "Renk Modu",
    options: {
        "Klasik Beyaz": 0,
        "Atmosferik Fırtına & Toz": 1,
    },
}).on("change", (ev) => {
    material.uniforms.uColorMode.value = ev.value;
});

//? Fare ile Zemin Düzleminde (Y = 0) Alt Boruyu Yönlendirme
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const intersectPoint = new THREE.Vector3();

window.addEventListener("pointermove", (event) => {
    if (!interactionState.mouseControl) return;
    pointer.x = (event.clientX / sizes.width) * 2 - 1;
    pointer.y = -(event.clientY / sizes.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    if (raycaster.ray.intersectPlane(groundPlane, intersectPoint)) {
        uniforms.uGroundTarget.value.set(
            THREE.MathUtils.clamp(intersectPoint.x, -2.2, 2.2),
            THREE.MathUtils.clamp(intersectPoint.z, -2.2, 2.2)
        );
    }
});

//? Animasyon Döngüsü
const clock = new THREE.Clock();
let previousTime = 0;

const tick = () => {
    stats.begin();

    if (!introState.isPlaying) {
        controls.dampingFactor = 0.05;
        controls.update();
    }

    const elapsedTime = clock.getElapsedTime();
    const deltaTime = Math.min(elapsedTime - previousTime, 0.1);
    previousTime = elapsedTime;

    uniforms.time.value = elapsedTime;
    uniforms.delta.value = deltaTime;
    material.uniforms.uMaxHeight.value = uniforms.uMaxHeight.value;

    gpuCompute.compute();

    material.uniforms.texturePosition.value =
        gpuCompute.getCurrentRenderTarget(positionVariable).texture;
    material.uniforms.uTime.value = elapsedTime;

    renderer.render(scene, camera);

    stats.end();
    window.requestAnimationFrame(tick);
};
tick();

//! Ekran Boyutu Değişimi
window.addEventListener("resize", () => {
    sizes.width = window.innerWidth;
    sizes.height = window.innerHeight;

    camera.aspect = sizes.width / sizes.height;
    camera.updateProjectionMatrix();

    const pixelRatio = Math.min(window.devicePixelRatio, 2);
    material.uniforms.uPixelRatio.value = pixelRatio;

    renderer.setSize(sizes.width, sizes.height);
    renderer.setPixelRatio(pixelRatio);
});
