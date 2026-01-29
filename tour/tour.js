/**
 * Thalassa Stone Rooms - 3D Virtual Tour
 * Three.js implementation with GLTFLoader + DRACOLoader
 */

// ============================================
// IMPORTS (Three.js via jsDelivr CDN - more reliable)
// ============================================
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/DRACOLoader.js';

// ============================================
// CONFIGURATION
// ============================================

/**
 * TELEPORT SPOTS - Edit these coordinates to match your model
 * Each spot has:
 *   - name: Display label
 *   - position: Camera position {x, y, z}
 *   - target: Look-at target {x, y, z}
 */
const SPOTS = {
    overview: {
        name: 'Overview',
        position: { x: 8, y: 6, z: 8 },
        target: { x: 0, y: 0, z: 0 }
    },
    living: {
        name: 'Living Room',
        position: { x: 2, y: 1.6, z: 2 },
        target: { x: -2, y: 1, z: -1 }
    },
    kitchen: {
        name: 'Kitchen',
        position: { x: -2, y: 1.6, z: 1 },
        target: { x: -4, y: 1, z: -2 }
    },
    bedroom: {
        name: 'Bedroom',
        position: { x: 3, y: 1.6, z: -2 },
        target: { x: 0, y: 1, z: -4 }
    },
    balcony: {
        name: 'Balcony',
        position: { x: -1, y: 2, z: 5 },
        target: { x: -1, y: 1.5, z: 8 }
    },
    bathroom: {
        name: 'Bathroom',
        position: { x: -3, y: 1.6, z: -3 },
        target: { x: -5, y: 1, z: -5 }
    }
};

// Performance config
const CONFIG = {
    maxPixelRatio: 2,
    shadowMapSize: 1024,
    antialias: true
};

// ============================================
// DOM ELEMENTS
// ============================================
const container = document.getElementById('canvasContainer');
const loadingOverlay = document.getElementById('loadingOverlay');
const progressBar = document.getElementById('progressBar');
const loadingPercent = document.getElementById('loadingPercent');
const errorOverlay = document.getElementById('errorOverlay');
const errorMessage = document.getElementById('errorMessage');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const dollhouseBtn = document.getElementById('dollhouseBtn');
const insideBtn = document.getElementById('insideBtn');
const teleportSpots = document.getElementById('teleportSpots');
const controlsHint = document.getElementById('controlsHint');
const hintClose = document.getElementById('hintClose');

// ============================================
// THREE.JS SETUP
// ============================================

let scene, camera, renderer, controls;
let model = null;
let modelBoundingBox = null;
let currentMode = 'dollhouse';
let isAnimating = false;

// Initialize Three.js scene
function initScene() {
    console.log('Initializing Three.js scene...');

    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a);

    // Camera
    camera = new THREE.PerspectiveCamera(
        60,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );
    camera.position.set(10, 8, 10);

    // Renderer
    renderer = new THREE.WebGLRenderer({
        antialias: CONFIG.antialias,
        powerPreference: 'high-performance'
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, CONFIG.maxPixelRatio));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // Controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = true;
    controls.minDistance = 1;
    controls.maxDistance = 50;
    controls.maxPolarAngle = Math.PI * 0.9;
    controls.target.set(0, 0, 0);

    // Lighting
    setupLighting();

    // Start render loop
    animate();

    console.log('Scene initialized successfully');
}

// Setup lighting for scanned/photogrammetry assets
function setupLighting() {
    // Ambient light for overall illumination
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    // Hemisphere light for natural sky/ground gradient
    const hemisphereLight = new THREE.HemisphereLight(
        0xffeedd, // sky color (warm)
        0x444444, // ground color
        0.7
    );
    scene.add(hemisphereLight);

    // Main directional light (sun-like)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
    directionalLight.position.set(5, 10, 5);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = CONFIG.shadowMapSize;
    directionalLight.shadow.mapSize.height = CONFIG.shadowMapSize;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 50;
    directionalLight.shadow.camera.left = -20;
    directionalLight.shadow.camera.right = 20;
    directionalLight.shadow.camera.top = 20;
    directionalLight.shadow.camera.bottom = -20;
    directionalLight.shadow.bias = -0.0001;
    scene.add(directionalLight);

    // Fill light from opposite direction
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
    fillLight.position.set(-5, 5, -5);
    scene.add(fillLight);

    // Additional fill light from front
    const frontLight = new THREE.DirectionalLight(0xffffff, 0.3);
    frontLight.position.set(0, 5, 10);
    scene.add(frontLight);

    // Soft point light for interior feel
    const pointLight = new THREE.PointLight(0xfff5e6, 0.6, 30);
    pointLight.position.set(0, 3, 0);
    scene.add(pointLight);
}

// ============================================
// MODEL LOADING
// ============================================

function loadModel() {
    console.log('Starting model load...');

    // Setup DRACO loader for compressed models
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/');
    dracoLoader.setDecoderConfig({ type: 'js' }); // Use JS decoder for better compatibility

    const loader = new GLTFLoader();
    loader.setDRACOLoader(dracoLoader);

    const modelPath = './my_home.glb';
    console.log('Loading model from:', modelPath);

    loader.load(
        modelPath,
        // Success callback
        (gltf) => {
            console.log('Model loaded successfully!', gltf);
            model = gltf.scene;

            // Enable shadows for all meshes and fix materials
            model.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;

                    // Ensure materials render correctly
                    if (child.material) {
                        child.material.side = THREE.DoubleSide;
                        child.material.needsUpdate = true;
                    }
                }
            });

            // Add model to scene
            scene.add(model);

            // Auto-fit camera to model
            fitCameraToModel();

            // Hide loading overlay
            loadingOverlay.classList.add('hidden');

            console.log('Model added to scene');
        },
        // Progress callback
        (xhr) => {
            if (xhr.lengthComputable) {
                const percentComplete = Math.round((xhr.loaded / xhr.total) * 100);
                progressBar.style.width = percentComplete + '%';
                loadingPercent.textContent = percentComplete + '%';
                console.log('Loading progress:', percentComplete + '%');
            } else {
                // If size unknown, show indeterminate progress
                loadingPercent.textContent = 'Loading...';
                // Animate progress bar for visual feedback
                const currentWidth = parseFloat(progressBar.style.width) || 0;
                if (currentWidth < 90) {
                    progressBar.style.width = (currentWidth + 5) + '%';
                }
            }
        },
        // Error callback
        (error) => {
            console.error('Error loading model:', error);
            showError(`Failed to load 3D model. Error: ${error.message || 'Unknown error'}. Check browser console for details.`);
        }
    );
}

// Show error message
function showError(message) {
    console.error('Showing error:', message);
    loadingOverlay.classList.add('hidden');
    errorMessage.textContent = message;
    errorOverlay.classList.add('visible');
}

// ============================================
// CAMERA UTILITIES
// ============================================

// Auto-fit camera to model bounds
function fitCameraToModel() {
    if (!model) return;

    console.log('Fitting camera to model...');

    // Calculate bounding box
    modelBoundingBox = new THREE.Box3().setFromObject(model);
    const center = modelBoundingBox.getCenter(new THREE.Vector3());
    const size = modelBoundingBox.getSize(new THREE.Vector3());

    console.log('Model bounds - Center:', center, 'Size:', size);

    // Get max dimension
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180);
    let cameraDistance = maxDim / (2 * Math.tan(fov / 2));
    cameraDistance *= 1.5; // Add some padding

    // Set camera position
    camera.position.set(
        center.x + cameraDistance * 0.7,
        center.y + cameraDistance * 0.5,
        center.z + cameraDistance * 0.7
    );

    // Set controls target to model center
    controls.target.copy(center);

    // Update camera near/far based on model size
    const diagonal = Math.sqrt(size.x ** 2 + size.y ** 2 + size.z ** 2);
    camera.near = Math.max(0.01, diagonal * 0.001);
    camera.far = diagonal * 20;
    camera.updateProjectionMatrix();

    // Update controls limits
    controls.minDistance = diagonal * 0.05;
    controls.maxDistance = diagonal * 5;

    // Update SPOTS overview position based on actual model
    SPOTS.overview.position = {
        x: center.x + cameraDistance * 0.7,
        y: center.y + cameraDistance * 0.5,
        z: center.z + cameraDistance * 0.7
    };
    SPOTS.overview.target = { x: center.x, y: center.y, z: center.z };

    controls.update();

    console.log('Camera fitted. Position:', camera.position, 'Target:', controls.target);
}

// Smooth camera transition to a spot
function teleportTo(spotKey) {
    const spot = SPOTS[spotKey];
    if (!spot || isAnimating) return;

    isAnimating = true;

    // Update active button
    document.querySelectorAll('.spot-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.spot === spotKey);
    });

    // Animation parameters
    const duration = 1000; // ms
    const startTime = performance.now();

    const startPos = camera.position.clone();
    const endPos = new THREE.Vector3(spot.position.x, spot.position.y, spot.position.z);

    const startTarget = controls.target.clone();
    const endTarget = new THREE.Vector3(spot.target.x, spot.target.y, spot.target.z);

    function animateCamera(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Ease-in-out cubic
        const eased = progress < 0.5
            ? 4 * progress * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 3) / 2;

        // Interpolate position
        camera.position.lerpVectors(startPos, endPos, eased);

        // Interpolate target
        controls.target.lerpVectors(startTarget, endTarget, eased);

        controls.update();

        if (progress < 1) {
            requestAnimationFrame(animateCamera);
        } else {
            isAnimating = false;
        }
    }

    requestAnimationFrame(animateCamera);
}

// ============================================
// VIEW MODES
// ============================================

function setMode(mode) {
    if (mode === currentMode) return;
    currentMode = mode;

    // Update button states
    dollhouseBtn.classList.toggle('active', mode === 'dollhouse');
    insideBtn.classList.toggle('active', mode === 'inside');

    if (mode === 'dollhouse') {
        // Dollhouse mode: wider view, normal clip planes
        controls.minDistance = modelBoundingBox
            ? modelBoundingBox.getSize(new THREE.Vector3()).length() * 0.1
            : 1;
        controls.maxPolarAngle = Math.PI * 0.9;
        camera.near = 0.1;
        camera.updateProjectionMatrix();

        // Teleport to overview
        teleportTo('overview');
    } else {
        // Inside mode: closer limits, adjusted clip for interior views
        controls.minDistance = 0.1;
        controls.maxPolarAngle = Math.PI * 0.95;
        camera.near = 0.01; // Closer near plane for interior
        camera.updateProjectionMatrix();

        // Teleport to living room as starting point
        teleportTo('living');
    }
}

// ============================================
// FULLSCREEN
// ============================================

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        const elem = document.documentElement;
        if (elem.requestFullscreen) {
            elem.requestFullscreen();
        } else if (elem.webkitRequestFullscreen) {
            elem.webkitRequestFullscreen();
        } else if (elem.msRequestFullscreen) {
            elem.msRequestFullscreen();
        }
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        }
    }
}

// ============================================
// UI SETUP
// ============================================

function setupUI() {
    // Create teleport buttons
    Object.entries(SPOTS).forEach(([key, spot]) => {
        const button = document.createElement('button');
        button.className = 'spot-btn';
        button.dataset.spot = key;
        button.textContent = spot.name;
        button.addEventListener('click', () => teleportTo(key));
        teleportSpots.appendChild(button);
    });

    // Mode buttons
    dollhouseBtn.addEventListener('click', () => setMode('dollhouse'));
    insideBtn.addEventListener('click', () => setMode('inside'));

    // Fullscreen button
    fullscreenBtn.addEventListener('click', toggleFullscreen);

    // Close hint button
    hintClose.addEventListener('click', () => {
        controlsHint.classList.add('hidden');
    });

    // Auto-hide hint after 10 seconds
    setTimeout(() => {
        controlsHint.classList.add('hidden');
    }, 10000);
}

// ============================================
// WINDOW RESIZE
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

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

// ============================================
// INITIALIZE
// ============================================

function init() {
    console.log('Initializing 3D Tour...');
    try {
        initScene();
        setupUI();
        loadModel();
    } catch (error) {
        console.error('Initialization error:', error);
        showError(`Failed to initialize 3D viewer: ${error.message}`);
    }
}

// Start the application
init();
