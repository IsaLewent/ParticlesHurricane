import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import vertexShader from "./shaders/render/vertexShader.glsl";
import fragmentShader from "./shaders/render/fragmentShader.glsl";
import gpgpuParticlesFragmentShader from "./shaders/gpgpu/particles.glsl";

import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';
import GUI from "lil-gui";
import { mix } from "three/tsl";

function lerp(a, b, t) {
    return a + (b - a) * t;
}

//? Debug GUI
const gui = new GUI({
    closeFolders: true,
});
gui.close();

const tornadoFolder = gui.addFolder("Tornado Settings");
tornadoFolder.close();

//? Canvas
const canvas = document.querySelector("canvas.webgl");

//? Scene
const scene = new THREE.Scene();

//? Sizes
const sizes = {
    width: window.innerWidth,
    height: window.innerHeight,
};

//? Camera
const aspectRatio = sizes.width / sizes.height;
const camera = new THREE.PerspectiveCamera(
    75,
    aspectRatio,
    0.1,
    1000,
);
camera.position.set(0.2409416257918322, 3.028480666771642, 2.5507705574946307);
scene.add(camera);

//? Renderer
const renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: true,
});

renderer.setSize(sizes.width, sizes.height);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.render(scene, camera);

/**
 * GPGPU
 */
//? GPU Setup
const gpgpuSize = 128; // 128x128 = 16384 particles
const gpuCompute = new GPUComputationRenderer(gpgpuSize, gpgpuSize, renderer);

//? Create a texture to hold the particle positions
const positionTexture = gpuCompute.createTexture();
const positionSize = positionTexture.image.data.length;

//? Random Height each particle
const aRandomHeight = new Float32Array(positionSize / 4);

//? Fill the position texture with random values
const maxHeight = 9.5;
const minRadius = 0.4;
const maxRadius = 100.0;
let innerFactor = 1.15; // Inner factor for radius calculation

const uMaxHeight = 10.0;
const uMinRadius = 0.08;
const uMaxRadius = 9.75;

for (let i = 0; i < positionSize; i += 4) {
    let randomHeight = Math.random() * 2.0; // y
    let y = Math.random() * maxHeight + randomHeight; // y
    const heightProgress = y / maxHeight;

    // O yükseklikteki DIŞ KABUK (maksimum) yarıçapı
    const outerRadius = lerp(minRadius, maxRadius, Math.pow(heightProgress, 2.2));

    // 0.0 (tam merkez) ile 1.0 (dış kabuk) arası bir hacim derinliği (inner factor) belirle

    // Gerçek yarıçap, dış kabuk ile bu derinliğin çarpımıdır
    const radius = outerRadius * 0.65;

    const theta = Math.random() * Math.PI * 2.0;

    let x = Math.cos(theta) * radius;    // x
    let z = Math.sin(theta) * radius;    // z

    positionTexture.image.data[i + 0] = x * 0.01; // x
    positionTexture.image.data[i + 1] = y * 0.3; // y
    positionTexture.image.data[i + 2] = z * 0.01; // z
    positionTexture.image.data[i + 3] = Math.random() * 2.0 + 2.0; // w

    aRandomHeight[i / 4] = Math.random(); // Store the random height for later use
}

//? Create a variable to hold the position texture and set its dependencies
const positionVariable = gpuCompute.addVariable("texturePosition", gpgpuParticlesFragmentShader, positionTexture);
gpuCompute.setVariableDependencies(positionVariable, [positionVariable]);
positionVariable.material.uniforms.time = { value: 0.0 };
positionVariable.material.uniforms.delta = { value: 0.0 };
positionVariable.material.uniforms.baseParticlesTexture = { value: positionTexture };
positionVariable.material.uniforms.uMinRadius = { value: uMinRadius };
positionVariable.material.uniforms.uMaxRadius = { value: uMaxRadius };
positionVariable.material.uniforms.uMaxHeight = { value: uMaxHeight };
positionVariable.material.uniforms.innerFactor = { value: innerFactor };
positionVariable.material.uniforms.noiseFreq = { value: 1.125 };
positionVariable.material.uniforms.noiseStrength = { value: 0.21 };
positionVariable.material.uniforms.uRotationSpeed = { value: 0.3 };
positionVariable.material.uniforms.uTimeStrength = { value: 1.0 };

//? GUI
tornadoFolder.add(positionVariable.material.uniforms.uMinRadius, "value").min(0.0).max(5.0).step(0.01).name("Min Radius");
tornadoFolder.add(positionVariable.material.uniforms.uMaxRadius, "value").min(0.0).max(10.0).step(0.01).name("Max Radius");
tornadoFolder.add(positionVariable.material.uniforms.uMaxHeight, "value").min(0.0).max(10.0).step(0.01).name("Max Height");
tornadoFolder.add(positionVariable.material.uniforms.innerFactor, "value").min(0.0).max(4.0).step(0.01).name("Inner Factor");
tornadoFolder.add(positionVariable.material.uniforms.noiseFreq, "value").min(0.1).max(10.0).step(0.01).name("Noise Frequency");
tornadoFolder.add(positionVariable.material.uniforms.noiseStrength, "value").min(0.0).max(1.0).step(0.01).name("Noise Strength");
tornadoFolder.add(positionVariable.material.uniforms.uRotationSpeed, "value").min(0.1).max(10.0).step(0.01).name("Rotation Speed");
tornadoFolder.add(positionVariable.material.uniforms.uTimeStrength, "value").min(0.1).max(10.0).step(0.01).name("Time Strength");

//? Initialize the GPU computation renderer
const err = gpuCompute.init();
if (err !== null) {
    console.error(err);
}

/**
 * Points geometry and material
 */
//? Create a buffer geometry to hold the particle positions and reference UVs
const particleCount = gpgpuSize * gpgpuSize;
const geometry = new THREE.BufferGeometry();
const positions = new Float32Array(particleCount * 3);
const referenceUVs = new Float32Array(particleCount * 3);

//? Fill the positions and reference UVs
for (let i = 0; i < particleCount; i++) {
    let i3 = i * 3;
    let i2 = i * 2;

    // Initial Position
    positions[i3 + 0] = 0; // x
    positions[i3 + 1] = 0; // y
    positions[i3 + 2] = 0; // z

    // Reference UVs
    let x = (i % gpgpuSize) / gpgpuSize; // u
    let y = Math.floor(i / gpgpuSize) / gpgpuSize; // v

    referenceUVs[i2 + 0] = x;
    referenceUVs[i2 + 1] = y;

}

//? Set the attributes for the geometry
geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
geometry.setAttribute("referenceUV", new THREE.BufferAttribute(referenceUVs, 2));
geometry.setAttribute("randomHeight", new THREE.BufferAttribute(aRandomHeight, 1));

//? Create a shader material to render the particles
const material = new THREE.ShaderMaterial({
    vertexShader: vertexShader,
    fragmentShader: fragmentShader,
    uniforms: {
        texturePosition: { value: null },
        uSize: new THREE.Uniform(5.0),
        uTime: { value: null },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
});

//? GUI Debug
gui.add(material.uniforms.uSize, "value").min(1).max(50).step(0.01).name("Particle Size");

//? Create a points object to render the particles
const points = new THREE.Points(geometry, material);
points.frustumCulled = false; // Disable frustum culling for the points
scene.add(points);

//? Setup The Controls
const controls = new OrbitControls(camera, canvas);
controls.target.set(-0.09774995317992423, 1.4673510401321705, -1.0607393923537811);
controls.enableDamping = true;

//? Animate
const clock = new THREE.Timer();
const tick = () => {
    //? Controls Update
    controls.dampingFactor = 0.05;
    controls.update();

    //? Animate Objects
    clock.update();
    let elapsedTime = clock.getElapsed();
    let deltaTime = clock.getDelta();
    deltaTime = Math.min(deltaTime, 0.1); // Limit delta time to avoid large jumps
    elapsedTime = Math.min(elapsedTime, 1000); // Limit elapsed time to avoid large jumps

    //? Update the GPU computation
    positionVariable.material.uniforms.time.value = elapsedTime;
    positionVariable.material.uniforms.delta.value = deltaTime;
    gpuCompute.compute();

    // ? Update the particle positions from the GPU computation
    material.uniforms.texturePosition.value = gpuCompute.getCurrentRenderTarget(positionVariable).texture;
    material.uniforms.uTime.value = elapsedTime;


    //? Render
    renderer.render(scene, camera);
    window.requestAnimationFrame(tick);
};
tick();



//! Resize
window.addEventListener("resize", () => {
    // Update Sizes
    sizes.width = window.innerWidth;
    sizes.height = window.innerHeight;

    // Update Camera
    camera.aspect = sizes.width / sizes.height;
    camera.updateProjectionMatrix();

    // Pixel Ratio
    const pixelRatio = Math.min(window.devicePixelRatio, 2);
    if (material && material.uniforms && material.uniforms.uPixelRatio) {
        material.uniforms.uPixelRatio.value = pixelRatio;
        console.log("Updated uPixelRatio to:", pixelRatio);
    }

    // Update Renderer
    renderer.setSize(sizes.width, sizes.height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});