import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import vertexShader from "./shaders/render/vertexShader.glsl";
import fragmentShader from "./shaders/render/fragmentShader.glsl";
import gpgpuParticlesFragmentShader from "./shaders/gpgpu/particles.glsl";

import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';
import GUI from "lil-gui";

function lerp(a, b, t) {
    return a + (b - a) * t;
}


//? Debug GUI
const gui = new GUI();

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
camera.position.set(0.2409416257918322, 2.428480666771642, 3.0507705574946307);
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
const maxHeight = 10.0;
const minRadius = 0.0;
const maxRadius = 8.0;

for (let i = 0; i < positionSize; i += 4) {
    let randomHeight = Math.random() * 2.0; // y
    const y = Math.random() * maxHeight + randomHeight; // y
    const heightProgress = y / maxHeight;

    // O yükseklikteki DIŞ KABUK (maksimum) yarıçapı
    const outerRadius = (minRadius + (maxRadius - minRadius) * Math.pow(heightProgress, 2.0));

    // 0.0 (tam merkez) ile 1.0 (dış kabuk) arası bir hacim derinliği (inner factor) belirle
    const innerFactor = Math.sqrt(Math.random());

    // Gerçek yarıçap, dış kabuk ile bu derinliğin çarpımıdır
    const radius = outerRadius * innerFactor * 0.65;

    const theta = Math.random() * Math.PI * 2.0;

    let x = Math.cos(theta) * radius;    // x
    let z = Math.sin(theta) * radius;    // z


    positionTexture.image.data[i + 0] = x * 0.3; // x
    positionTexture.image.data[i + 1] = y * 0.3; // y
    positionTexture.image.data[i + 2] = z * 0.3; // z
    positionTexture.image.data[i + 3] = innerFactor; // w

    aRandomHeight[i / 4] = Math.random() * 2.0; // Store the random height for later use
}

//? Create a variable to hold the position texture and set its dependencies
const positionVariable = gpuCompute.addVariable("texturePosition", gpgpuParticlesFragmentShader, positionTexture);
gpuCompute.setVariableDependencies(positionVariable, [positionVariable]);
positionVariable.material.uniforms.time = { value: 0.0 };
positionVariable.material.uniforms.delta = { value: 0.0 };
positionVariable.material.uniforms.uMinRadius = { value: minRadius };
positionVariable.material.uniforms.uMaxRadius = { value: maxRadius };
positionVariable.material.uniforms.uMaxHeight = { value: maxHeight };

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
gui.add(material.uniforms.uSize, "value").min(1).max(20).step(0.01).name("Particle Size");

//? Create a points object to render the particles
const points = new THREE.Points(geometry, material);
points.frustumCulled = false; // Disable frustum culling for the points
scene.add(points);

//? Setup The Controls
const controls = new OrbitControls(camera, canvas);
controls.target.set(-0.09774995317992423, 1.1673510401321705, -1.0607393923537811);
controls.enableDamping = true;

//? Animate
const clock = new THREE.Timer();
const tick = () => {
    //? Controls Update
    controls.dampingFactor = 0.05;
    controls.update();

    //? Animate Objects
    clock.update();
    const elapsedTime = clock.getElapsed();
    let deltaTime = clock.getDelta();
    deltaTime = Math.min(deltaTime, 0.1); // Limit delta time to avoid large jumps

    //? Update the GPU computation
    positionVariable.material.uniforms.time.value = elapsedTime;
    positionVariable.material.uniforms.delta.value = deltaTime;
    gpuCompute.compute();

    // ? Update the particle positions from the GPU computation
    material.uniforms.texturePosition.value = gpuCompute.getCurrentRenderTarget(positionVariable).texture;
    material.uniforms.uTime.value = elapsedTime;
    material.uniforms.uTime.value = deltaTime;

    console.log();

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