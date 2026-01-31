/**
 * Thalassa Stone Rooms - 3D Virtual Tour
 * Dollhouse + 360° Panorama viewer with hotspot placement
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

// ============================================
// CONFIGURATION
// ============================================

const SPOTS = {
    overview: { name: 'Overview', position: { x: 8, y: 6, z: 8 }, target: { x: 0, y: 0, z: 0 } },
    front:    { name: 'Front', position: { x: 0, y: 8, z: 10 }, target: { x: 0, y: 0, z: 0 } },
    top:      { name: 'Top Down', position: { x: 0, y: 12, z: 0.1 }, target: { x: 0, y: 0, z: 0 } },
    side:     { name: 'Side', position: { x: 10, y: 4, z: 0 }, target: { x: 0, y: 0, z: 0 } }
};

const CONFIG = { maxPixelRatio: 2, shadowMapSize: 1024, antialias: true };

// Default hotspot positions on the dollhouse (fallback)
const DEFAULT_HOTSPOTS = {
    1: { x: 2,  y: 1, z: 1 },       // livingroom
    2: { x: 1,  y: 1, z: 4.5 },     // frontdoor
    3: { x: -0.6,  y: 1, z: 0.3 },  // hallway
    4: { x: -2, y: 1, z: 0.75 },    // kitchen door
    5: { x: -3.3, y: 1, z: 2 },     // kitchen
    6: { x: 1,  y: 1, z: -0.5 },    // bedroom door
    7: { x: 3,  y: 1, z: -3 }       // bedroom
};

// Per-panorama rotation offset (degrees):
// What world-yaw does the CENTER of each 360 photo face?
// Adjust these values so arrows point in the correct direction.
const PANO_NORTH_OFFSET = {
    1: -140,     // livingroom
    2: 75,     // frontdoor
    3: -40,     // hallway
    4: 0,     // kitchen door
    5: 190,     // kitchen
    6: 90,     // bedroom door
    7: 0      // bedroom
};

// Navigation graph: each pano number -> list of connected pano numbers
// frontdoor(2) <-> livingroom(1) <-> hallway(3)
// kitchen door(4) <-> hallway(3) <-> bedroom door(6)
// kitchen(5) <-> kitchen door(4)
// bedroom door(6) <-> bedroom(7)
const PANO_CONNECTIONS = {
    1: [2, 3],       // livingroom  -> frontdoor, hallway
    2: [1],          // frontdoor   -> livingroom
    3: [1, 4, 6],    // hallway     -> livingroom, kitchen door, bedroom door
    4: [3, 5],       // kitchen door-> hallway, kitchen
    5: [4],          // kitchen     -> kitchen door
    6: [3, 7],       // bedroom door-> hallway, bedroom
    7: [6]           // bedroom     -> bedroom door
};

// ============================================
// STATE
// ============================================

let scene, camera, renderer, controls;
let model = null;
let modelBoundingBox = null;
let currentMode = 'dollhouse'; // 'dollhouse' | 'panorama'
let isAnimating = false;

// Panorama state
let panoGraph = [];          // sorted array of { index, file, prev, next }
let currentPanoIndex = -1;
let panoSphere = null;
let panoArrows = [];
let panoYaw = 0, panoPitch = 0;
let panoFov = 60;
let panoPointerDown = false;
let panoPointerX = 0, panoPointerY = 0;
let panoPinchDist = 0;

// Hotspot state
let hotspotPositions = {};   // panoNumber -> {x,y,z}
let hotspotMeshes = [];      // THREE.Mesh[]
// connectionObjects removed - arrows are inside pano view only

// Raycaster
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

// ============================================
// DOM
// ============================================

const container = document.getElementById('canvasContainer');
const loadingOverlay = document.getElementById('loadingOverlay');
const progressBar = document.getElementById('progressBar');
const loadingPercent = document.getElementById('loadingPercent');
const errorOverlay = document.getElementById('errorOverlay');
const errorMessage = document.getElementById('errorMessage');
const fullscreenBtn = document.getElementById('fullscreenBtn');
// Mode toggle removed - dollhouse is map-only, 360 panos are the inside view
const teleportSpots = document.getElementById('teleportSpots');
const controlsHint = document.getElementById('controlsHint');
const hintClose = document.getElementById('hintClose');

// New DOM elements (created in HTML)
const panoOverlay = document.getElementById('panoOverlay');
const panoBackBtn = document.getElementById('panoBackBtn');
const panoLabel = document.getElementById('panoLabel');

// ============================================
// THREE.JS SETUP
// ============================================

function initScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(10, 8, 10);

    renderer = new THREE.WebGLRenderer({ antialias: CONFIG.antialias, powerPreference: 'high-performance' });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, CONFIG.maxPixelRatio));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = true;
    controls.minDistance = 1;
    controls.maxDistance = 50;
    controls.maxPolarAngle = Math.PI * 0.9;
    controls.target.set(0, 0, 0);

    setupLighting();
    animate();
}

function setupLighting() {
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));

    const hemi = new THREE.HemisphereLight(0xffeedd, 0x444444, 0.7);
    scene.add(hemi);

    const dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.position.set(5, 10, 5);
    dir.castShadow = true;
    dir.shadow.mapSize.width = CONFIG.shadowMapSize;
    dir.shadow.mapSize.height = CONFIG.shadowMapSize;
    dir.shadow.camera.near = 0.5;
    dir.shadow.camera.far = 50;
    dir.shadow.camera.left = -20;
    dir.shadow.camera.right = 20;
    dir.shadow.camera.top = 20;
    dir.shadow.camera.bottom = -20;
    dir.shadow.bias = -0.0001;
    scene.add(dir);

    const fill = new THREE.DirectionalLight(0xffffff, 0.4);
    fill.position.set(-5, 5, -5);
    scene.add(fill);

    const front = new THREE.DirectionalLight(0xffffff, 0.3);
    front.position.set(0, 5, 10);
    scene.add(front);

    const point = new THREE.PointLight(0xfff5e6, 0.6, 30);
    point.position.set(0, 3, 0);
    scene.add(point);
}

// ============================================
// MODEL LOADING
// ============================================

function loadModel() {
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/');
    dracoLoader.setDecoderConfig({ type: 'js' });

    const loader = new GLTFLoader();
    loader.setDRACOLoader(dracoLoader);

    loader.load(
        './my_home.glb',
        (gltf) => {
            model = gltf.scene;
            model.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    if (child.material) {
                        // FrontSide: shows exterior walls removed, interior visible
                        child.material.side = THREE.FrontSide;
                        child.material.needsUpdate = true;
                    }
                }
            });
            scene.add(model);
            fitCameraToModel();
            loadingOverlay.classList.add('hidden');

            // Create hotspot visuals after model is loaded
            createHotspotMeshes();
        },
        (xhr) => {
            if (xhr.lengthComputable) {
                const pct = Math.round((xhr.loaded / xhr.total) * 100);
                progressBar.style.width = pct + '%';
                loadingPercent.textContent = pct + '%';
            } else {
                loadingPercent.textContent = 'Loading...';
                const w = parseFloat(progressBar.style.width) || 0;
                if (w < 90) progressBar.style.width = (w + 5) + '%';
            }
        },
        (error) => {
            showError(`Failed to load 3D model. Error: ${error.message || 'Unknown error'}.`);
        }
    );
}

function showError(message) {
    loadingOverlay.classList.add('hidden');
    errorMessage.textContent = message;
    errorOverlay.classList.add('visible');
}

// ============================================
// CAMERA
// ============================================

function fitCameraToModel() {
    if (!model) return;
    modelBoundingBox = new THREE.Box3().setFromObject(model);
    const center = modelBoundingBox.getCenter(new THREE.Vector3());
    const size = modelBoundingBox.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180);
    let dist = (maxDim / (2 * Math.tan(fov / 2))) * 1.5;

    camera.position.set(center.x + dist * 0.7, center.y + dist * 0.5, center.z + dist * 0.7);
    controls.target.copy(center);

    const diag = Math.sqrt(size.x ** 2 + size.y ** 2 + size.z ** 2);
    camera.near = Math.max(0.01, diag * 0.001);
    camera.far = diag * 20;
    camera.updateProjectionMatrix();

    controls.minDistance = diag * 0.05;
    controls.maxDistance = diag * 5;

    SPOTS.overview.position = { x: center.x + dist * 0.7, y: center.y + dist * 0.5, z: center.z + dist * 0.7 };
    SPOTS.overview.target = { x: center.x, y: center.y, z: center.z };
    controls.update();
}

function teleportTo(spotKey) {
    const spot = SPOTS[spotKey];
    if (!spot || isAnimating) return;
    isAnimating = true;

    document.querySelectorAll('.spot-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.spot === spotKey);
    });

    const duration = 1000;
    const startTime = performance.now();
    const startPos = camera.position.clone();
    const endPos = new THREE.Vector3(spot.position.x, spot.position.y, spot.position.z);
    const startTarget = controls.target.clone();
    const endTarget = new THREE.Vector3(spot.target.x, spot.target.y, spot.target.z);

    function animateCamera(t) {
        const elapsed = t - startTime;
        const p = Math.min(elapsed / duration, 1);
        const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
        camera.position.lerpVectors(startPos, endPos, e);
        controls.target.lerpVectors(startTarget, endTarget, e);
        controls.update();
        if (p < 1) requestAnimationFrame(animateCamera);
        else isAnimating = false;
    }
    requestAnimationFrame(animateCamera);
}

// Dollhouse is map-only; inside view uses 360 panoramas

// ============================================
// PANORAMA MANIFEST & GRAPH
// ============================================

function trailingNumber(filename) {
    const m = filename.replace(/\.\w+$/, '').match(/(\d+)$/);
    return m ? parseInt(m[1], 10) : Infinity;
}

async function loadManifest() {
    try {
        const res = await fetch('../360_casa/manifest.json');
        if (!res.ok) throw new Error('manifest fetch failed');
        const data = await res.json();
        const files = data.files || [];
        // Sort by trailing number
        files.sort((a, b) => trailingNumber(a) - trailingNumber(b));
        panoGraph = files.map((file, i) => ({
            index: trailingNumber(file),
            file,
            arrayIdx: i
        }));
        // Set prev/next
        for (let i = 0; i < panoGraph.length; i++) {
            panoGraph[i].prev = panoGraph[(i - 1 + panoGraph.length) % panoGraph.length];
            panoGraph[i].next = panoGraph[(i + 1) % panoGraph.length];
        }
    } catch (err) {
        // silently ignore - pano manifest is optional
    }
}

function getPanoByNumber(num) {
    return panoGraph.find(p => p.index === num) || null;
}

// ============================================
// HOTSPOT POSITIONS (load / save / export)
// ============================================

async function loadHotspotPositions() {
    // 1. Try JSON file
    try {
        const res = await fetch('./hotspots.json');
        if (res.ok) {
            const data = await res.json();
            hotspotPositions = data;
            return;
        }
    } catch (_) { /* ignore */ }

    // 2. Try localStorage
    try {
        const stored = localStorage.getItem('thalassa_hotspots');
        if (stored) {
            hotspotPositions = JSON.parse(stored);
            return;
        }
    } catch (_) { /* ignore */ }

    // 3. Defaults
    hotspotPositions = { ...DEFAULT_HOTSPOTS };
}


// ============================================
// HOTSPOT 3D VISUALS (on dollhouse model)
// ============================================

function createHotspotMeshes() {
    // Remove old hotspots
    hotspotMeshes.forEach(m => {
        m.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        });
        scene.remove(m);
    });
    hotspotMeshes = [];

    // Build hotspot spheres
    for (const pano of panoGraph) {
        const pos = hotspotPositions[pano.index];
        if (!pos) continue;

        const geo = new THREE.SphereGeometry(0.15, 16, 16);
        const mat = new THREE.MeshBasicMaterial({
            color: 0xc9a962,
            transparent: true,
            opacity: 0.85,
            depthTest: false
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(pos.x, pos.y, pos.z);
        mesh.userData.panoIndex = pano.index;
        mesh.renderOrder = 999;
        scene.add(mesh);
        hotspotMeshes.push(mesh);

        // Inner dot
        const innerGeo = new THREE.SphereGeometry(0.07, 12, 12);
        const innerMat = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false });
        const inner = new THREE.Mesh(innerGeo, innerMat);
        inner.renderOrder = 1000;
        mesh.add(inner);

        // Pulsing ring
        const ringGeo = new THREE.RingGeometry(0.18, 0.25, 32);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0xc9a962,
            transparent: true,
            opacity: 0.4,
            side: THREE.DoubleSide,
            depthTest: false
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.renderOrder = 998;
        mesh.add(ring);
        mesh.userData.ring = ring;
        mesh.userData.ringMat = ringMat;
    }

}

// Animate hotspot pulse
function updateHotspots(time) {
    for (const mesh of hotspotMeshes) {
        // Billboard: face camera
        mesh.quaternion.copy(camera.quaternion);
        // Pulse ring
        const ring = mesh.userData.ring;
        if (ring) {
            const s = 1 + 0.3 * Math.sin(time * 0.003 + mesh.userData.panoIndex);
            ring.scale.set(s, s, s);
            mesh.userData.ringMat.opacity = 0.2 + 0.2 * Math.sin(time * 0.003 + mesh.userData.panoIndex);
        }
    }
}

// ============================================
// PANORAMA MODE
// ============================================

const textureLoader = new THREE.TextureLoader();
let currentPanoTexture = null;

// Fade transition state
let panoFading = false;
let panoFadeProgress = 1;

// Save/restore camera state when switching modes
let savedCameraPos = null;
let savedControlsTarget = null;
let savedCameraFov = 60;
let savedCameraNear = 0.1;
let savedCameraFar = 1000;

function enterPanorama(panoNum) {
    const pano = getPanoByNumber(panoNum);
    if (!pano) return;

    currentMode = 'panorama';
    currentPanoIndex = pano.arrayIdx;

    // Save current camera state for restoration
    savedCameraPos = camera.position.clone();
    savedControlsTarget = controls.target.clone();
    savedCameraFov = camera.fov;
    savedCameraNear = camera.near;
    savedCameraFar = camera.far;

    // Reset pano zoom
    panoFov = 60;
    camera.fov = 60;

    // Hide dollhouse UI, show pano UI
    document.querySelector('.tour-ui').classList.add('pano-active');
    panoOverlay.classList.add('visible');
    // Hide the dollhouse model, hotspots and connections
    if (model) model.visible = false;
    hotspotMeshes.forEach(m => m.visible = false);

    // Disable orbit controls
    controls.enabled = false;

    // Move camera to origin for clean pano viewing
    camera.position.set(0, 0, 0);
    camera.near = 0.1;
    camera.far = 1100;
    camera.updateProjectionMatrix();

    // Reset pano look direction
    panoYaw = 0;
    panoPitch = 0;

    // Load texture
    loadPanoTexture(pano);
    updatePanoLabel(pano);
}

function loadPanoTexture(pano) {
    const path = '../360_casa/' + pano.file;

    textureLoader.load(
        path,
        (texture) => {
            // Dispose old
            if (currentPanoTexture) currentPanoTexture.dispose();
            currentPanoTexture = texture;
            texture.colorSpace = THREE.SRGBColorSpace;

            // Create or update sphere at origin
            if (!panoSphere) {
                const geo = new THREE.SphereGeometry(500, 60, 40);
                geo.scale(-1, 1, 1); // inside-out
                const mat = new THREE.MeshBasicMaterial({
                    map: texture,
                    transparent: true,
                    opacity: 0
                });
                panoSphere = new THREE.Mesh(geo, mat);
            } else {
                panoSphere.material.map = texture;
                panoSphere.material.needsUpdate = true;
            }

            if (!panoSphere.parent) scene.add(panoSphere);
            panoSphere.visible = true;
            panoSphere.position.set(0, 0, 0);

            // Start fade-in
            panoFading = true;
            panoFadeProgress = 0;
            panoSphere.material.opacity = 0;

            updatePanoCamera();
            createPanoArrows();
        },
        undefined,
        undefined
    );
}

function exitPanorama() {
    currentMode = 'dollhouse';

    // Hide pano sphere
    if (panoSphere) panoSphere.visible = false;

    // Remove arrows
    removePanoArrows();

    // Restore camera state
    if (savedCameraPos) {
        camera.position.copy(savedCameraPos);
        controls.target.copy(savedControlsTarget);
        camera.fov = savedCameraFov;
        camera.near = savedCameraNear;
        camera.far = savedCameraFar;
        camera.updateProjectionMatrix();
    }

    // Show dollhouse UI
    document.querySelector('.tour-ui').classList.remove('pano-active');
    panoOverlay.classList.remove('visible');

    // Show the dollhouse model, hotspots and connections
    if (model) model.visible = true;
    hotspotMeshes.forEach(m => m.visible = true);

    // Re-enable orbit controls
    controls.enabled = true;
    controls.update();

    // Dispose texture
    if (currentPanoTexture) {
        currentPanoTexture.dispose();
        currentPanoTexture = null;
    }
}

function navigatePano(pano) {
    if (!pano) return;
    currentPanoIndex = pano.arrayIdx;
    panoYaw = 0;
    panoPitch = 0;
    panoFov = 60;
    camera.fov = 60;
    camera.updateProjectionMatrix();
    loadPanoTexture(pano);
    updatePanoLabel(pano);
}

function updatePanoLabel(pano) {
    if (panoLabel) {
        const name = pano.file.replace(/[-_]\d+\.jpe?g$/i, '').replace(/[-_]/g, ' ');
        panoLabel.textContent = name.charAt(0).toUpperCase() + name.slice(1) + ' (' + pano.index + '/' + panoGraph.length + ')';
    }
}

function updatePanoCamera() {
    const phi = THREE.MathUtils.degToRad(90 - panoPitch);
    const theta = THREE.MathUtils.degToRad(panoYaw);

    const target = new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta),
        Math.cos(phi),
        Math.sin(phi) * Math.sin(theta)
    );

    camera.lookAt(target);
}

// ============================================
// PANORAMA ARROWS - Floor circles (VR-style navigation)
// ============================================

function createPanoArrows() {
    removePanoArrows();

    const pano = panoGraph[currentPanoIndex];
    if (!pano) return;

    const currentPos = hotspotPositions[pano.index];
    if (!currentPos) return;

    // Get connections for this pano from the graph
    const connections = PANO_CONNECTIONS[pano.index] || [];

    for (const targetIndex of connections) {
        const targetPano = getPanoByNumber(targetIndex);
        const targetPos = hotspotPositions[targetIndex];
        if (!targetPano || !targetPos) continue;

        // Calculate direction from current to target, adjusted for pano orientation
        const dx = targetPos.x - currentPos.x;
        const dz = targetPos.z - currentPos.z;
        const worldYaw = THREE.MathUtils.radToDeg(Math.atan2(dz, dx));
        const offset = PANO_NORTH_OFFSET[pano.index] || 0;
        const yawDeg = worldYaw - offset;

        const obj = createFloorCircle(
            friendlyName(targetPano.file),
            yawDeg,
            true,
            () => navigatePano(targetPano)
        );
        panoArrows.push(obj);
    }
}

function friendlyName(file) {
    return file.replace(/[-_]\d+\.jpe?g$/i, '').replace(/[-_]/g, ' ');
}

function createFloorCircle(label, yawDeg, isNext, onClick) {
    const group = new THREE.Group();
    group.userData.onClick = onClick;
    group.userData.isArrow = true;

    // Position on the floor, matching camera convention (yaw=0 is +X)
    const theta = THREE.MathUtils.degToRad(yawDeg);
    const r = 25;
    group.position.set(
        r * Math.cos(theta),
        -12,
        r * Math.sin(theta)
    );

    // Flat circle lying on the floor
    // Outer glow ring
    const glowGeo = new THREE.RingGeometry(2.8, 3.6, 48);
    const glowMat = new THREE.MeshBasicMaterial({
        color: 0xc9a962,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
        depthTest: false
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.rotation.x = -Math.PI / 2;
    glow.renderOrder = 97;
    group.add(glow);
    group.userData.glowMat = glowMat;

    // Main ring
    const ringGeo = new THREE.RingGeometry(2.0, 2.8, 48);
    const ringMat = new THREE.MeshBasicMaterial({
        color: 0xc9a962,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide,
        depthTest: false
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = 98;
    group.add(ring);

    // Inner filled circle
    const innerGeo = new THREE.CircleGeometry(2.0, 48);
    const innerMat = new THREE.MeshBasicMaterial({
        color: 0x1a3a4a,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
        depthTest: false
    });
    const inner = new THREE.Mesh(innerGeo, innerMat);
    inner.rotation.x = -Math.PI / 2;
    inner.renderOrder = 99;
    group.add(inner);

    // Chevron arrow pointing outward (away from center = toward target)
    const chevronShape = new THREE.Shape();
    chevronShape.moveTo(-0.6, 1.0);
    chevronShape.lineTo(0.6, 0);
    chevronShape.lineTo(-0.6, -1.0);
    chevronShape.lineTo(-0.2, 0);
    chevronShape.closePath();
    const chevGeo = new THREE.ShapeGeometry(chevronShape);
    const chevMat = new THREE.MeshBasicMaterial({
        color: 0xc9a962,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        depthTest: false
    });
    const chevron = new THREE.Mesh(chevGeo, chevMat);
    chevron.rotation.x = -Math.PI / 2;
    // Rotate the chevron so it points outward from center toward target
    chevron.rotation.z = -(Math.PI / 2 + THREE.MathUtils.degToRad(yawDeg));
    chevron.position.y = 0.05;
    chevron.renderOrder = 100;
    group.add(chevron);

    // Label floating above the circle
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 80;
    const ctx = canvas.getContext('2d');
    // Background pill
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    const pw = ctx.measureText(label).width || 200;
    ctx.arc(40, 40, 36, Math.PI / 2, Math.PI * 1.5);
    ctx.arc(472, 40, 36, -Math.PI / 2, Math.PI / 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '500 30px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 256, 42);

    const labelTex = new THREE.CanvasTexture(canvas);
    const labelMat = new THREE.SpriteMaterial({ map: labelTex, transparent: true, depthTest: false });
    const labelSprite = new THREE.Sprite(labelMat);
    labelSprite.position.set(0, 2.5, 0);
    labelSprite.scale.set(7, 1.1, 1);
    labelSprite.renderOrder = 101;
    group.add(labelSprite);

    scene.add(group);
    return group;
}

// Animate floor circles (pulse glow)
function updatePanoArrowPulse(time) {
    for (const group of panoArrows) {
        if (group.userData.glowMat) {
            const pulse = 0.2 + 0.15 * Math.sin(time * 0.004);
            group.userData.glowMat.opacity = pulse;
        }
    }
}

function removePanoArrows() {
    panoArrows.forEach(obj => {
        obj.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (child.material.map) child.material.map.dispose();
                child.material.dispose();
            }
        });
        scene.remove(obj);
    });
    panoArrows = [];
}

// ============================================
// PANORAMA POINTER CONTROLS (drag to look)
// ============================================

function onPanoPointerDown(e) {
    if (currentMode !== 'panorama') return;
    panoPointerDown = true;
    panoPointerX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
    panoPointerY = e.clientY || (e.touches && e.touches[0].clientY) || 0;
}

function onPanoPointerMove(e) {
    if (currentMode !== 'panorama' || !panoPointerDown) return;
    const x = e.clientX || (e.touches && e.touches[0].clientX) || 0;
    const y = e.clientY || (e.touches && e.touches[0].clientY) || 0;
    const dx = x - panoPointerX;
    const dy = y - panoPointerY;
    panoPointerX = x;
    panoPointerY = y;

    panoYaw -= dx * 0.3;
    panoPitch = Math.max(-85, Math.min(85, panoPitch + dy * 0.3));
    updatePanoCamera();

    // Reposition arrows relative to camera
    repositionPanoArrows();
}

function onPanoPointerUp() {
    panoPointerDown = false;
}

function repositionPanoArrows() {
    const pano = panoGraph[currentPanoIndex];
    if (!pano) return;

    // Arrows stay at fixed world positions relative to initial orientation.
    // As the camera rotates, they naturally appear to move in/out of view.
}

// ============================================
// PANORAMA ZOOM (wheel + pinch)
// ============================================

function onPanoWheel(e) {
    if (currentMode !== 'panorama') return;
    e.preventDefault();
    panoFov += e.deltaY * 0.05;
    panoFov = Math.max(30, Math.min(100, panoFov));
    camera.fov = panoFov;
    camera.updateProjectionMatrix();
}

function getTouchDist(e) {
    const t = e.touches;
    const dx = t[0].clientX - t[1].clientX;
    const dy = t[0].clientY - t[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

// ============================================
// CLICK / TAP HANDLING
// ============================================

function onPointerClick(e) {
    // Get pointer position
    const rect = renderer.domElement.getBoundingClientRect();
    const clientX = e.clientX || (e.changedTouches && e.changedTouches[0].clientX) || 0;
    const clientY = e.clientY || (e.changedTouches && e.changedTouches[0].clientY) || 0;
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);

    if (currentMode === 'panorama') {
        // Check arrow clicks (recursive since arrows are groups with children)
        const hits = raycaster.intersectObjects(panoArrows, true);
        if (hits.length > 0) {
            // Walk up to find the object with the onClick handler
            let obj = hits[0].object;
            while (obj && !obj.userData.onClick) obj = obj.parent;
            if (obj && obj.userData.onClick) obj.userData.onClick();
        }
        return;
    }

    // Dollhouse mode - check hotspot clicks
    const hotHits = raycaster.intersectObjects(hotspotMeshes, true);
    if (hotHits.length > 0) {
        // Walk up to root hotspot mesh
        let obj = hotHits[0].object;
        while (obj.parent && !obj.userData.panoIndex) obj = obj.parent;
        if (obj.userData.panoIndex) {
            enterPanorama(obj.userData.panoIndex);
        }
    }
}

// Distinguish click from drag
let pointerDownTime = 0;
let pointerDownPos = { x: 0, y: 0 };

function onGlobalPointerDown(e) {
    pointerDownTime = Date.now();
    pointerDownPos.x = e.clientX || (e.touches && e.touches[0].clientX) || 0;
    pointerDownPos.y = e.clientY || (e.touches && e.touches[0].clientY) || 0;
    onPanoPointerDown(e);
}

function onGlobalPointerUp(e) {
    onPanoPointerUp();
    const elapsed = Date.now() - pointerDownTime;
    const cx = e.clientX || (e.changedTouches && e.changedTouches[0].clientX) || 0;
    const cy = e.clientY || (e.changedTouches && e.changedTouches[0].clientY) || 0;
    const dist = Math.sqrt((cx - pointerDownPos.x) ** 2 + (cy - pointerDownPos.y) ** 2);
    // Only treat as click if short press and minimal movement
    if (elapsed < 300 && dist < 10) {
        onPointerClick(e);
    }
}

function onGlobalPointerMove(e) {
    onPanoPointerMove(e);
}

function onKeyDown(e) {
    if (e.key === 'Escape' && currentMode === 'panorama') {
        exitPanorama();
    }
}

// ============================================
// FULLSCREEN
// ============================================

function toggleFullscreen() {
    // Check both own document and parent for fullscreen state
    const isFullscreen = document.fullscreenElement || (window.parent !== window && window.parent.document.fullscreenElement);
    if (!isFullscreen) {
        const el = document.documentElement;
        (el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen).call(el);
    } else {
        // Exit from whichever document is fullscreened
        const doc = document.fullscreenElement ? document : window.parent.document;
        (doc.exitFullscreen || doc.webkitExitFullscreen || doc.msExitFullscreen).call(doc);
    }
}

// ============================================
// UI SETUP
// ============================================

function setupUI() {
    // Teleport buttons
    Object.entries(SPOTS).forEach(([key, spot]) => {
        const btn = document.createElement('button');
        btn.className = 'spot-btn';
        btn.dataset.spot = key;
        btn.textContent = spot.name;
        btn.addEventListener('click', () => teleportTo(key));
        teleportSpots.appendChild(btn);
    });

    // Mode toggle removed - no inside GLB navigation

    // Fullscreen
    fullscreenBtn.addEventListener('click', toggleFullscreen);

    // Hint close
    hintClose.addEventListener('click', () => controlsHint.classList.add('hidden'));
    setTimeout(() => controlsHint.classList.add('hidden'), 10000);

    // Pano back button
    if (panoBackBtn) panoBackBtn.addEventListener('click', exitPanorama);

    // Pointer events (unified mouse + touch)
    const canvas = renderer.domElement;
    canvas.addEventListener('pointerdown', onGlobalPointerDown);
    canvas.addEventListener('pointermove', onGlobalPointerMove);
    canvas.addEventListener('pointerup', onGlobalPointerUp);

    // Wheel zoom in pano mode
    canvas.addEventListener('wheel', onPanoWheel, { passive: false });

    // Touch events for mobile pano (pinch-to-zoom + drag-to-look)
    canvas.addEventListener('touchstart', (e) => {
        if (currentMode === 'panorama') {
            e.preventDefault();
            if (e.touches.length === 2) {
                panoPinchDist = getTouchDist(e);
                panoPointerDown = false;
                return;
            }
        }
        onGlobalPointerDown(e);
    }, { passive: false });
    canvas.addEventListener('touchmove', (e) => {
        if (currentMode === 'panorama') {
            e.preventDefault();
            if (e.touches.length === 2) {
                const dist = getTouchDist(e);
                const delta = panoPinchDist - dist;
                panoFov += delta * 0.15;
                panoFov = Math.max(30, Math.min(100, panoFov));
                camera.fov = panoFov;
                camera.updateProjectionMatrix();
                panoPinchDist = dist;
                return;
            }
        }
        onGlobalPointerMove(e);
    }, { passive: false });
    canvas.addEventListener('touchend', (e) => {
        panoPinchDist = 0;
        onGlobalPointerUp(e);
    });

    // Keyboard
    document.addEventListener('keydown', onKeyDown);
}

// ============================================
// RESIZE
// ============================================

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', onWindowResize);

// ============================================
// ANIMATION LOOP
// ============================================

function animate(time) {
    requestAnimationFrame(animate);
    const t = time || 0;

    if (currentMode === 'dollhouse') {
        controls.update();
        updateHotspots(t);
    } else if (currentMode === 'panorama') {
        updatePanoArrowPulse(t);
        // Handle fade transition
        if (panoFading && panoSphere) {
            panoFadeProgress += 0.03;
            if (panoFadeProgress >= 1) {
                panoFadeProgress = 1;
                panoFading = false;
            }
            panoSphere.material.opacity = panoFadeProgress;
        }
    }

    renderer.render(scene, camera);
}

// ============================================
// INIT
// ============================================

function init() {
    try {
        initScene();
        setupUI();

        // Start model loading immediately (don't block on manifest/hotspots)
        loadModel();

        // Load manifest + hotspot positions in background
        Promise.all([loadManifest(), loadHotspotPositions()])
            .then(() => {
                // If model already loaded, recreate hotspot meshes now
                if (model) createHotspotMeshes();
            })
            .catch(() => {});

    } catch (error) {
        showError(`Failed to initialize: ${error.message}`);
    }
}

init();
