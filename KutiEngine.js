/**
 * KutiEngine.js
 * Project DDAimon - Core 3D Rendering and Animation Engine
 * * This module handles the initialization, rendering, and animation of the 3D character (Kuti)
 * using Three.js. It features a message bus architecture for external control, 
 * dynamic texture swapping, and a linear interpolation (Lerp) algorithm for smooth 
 * morph target (viseme) transitions.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// --- Core Rendering & Animation Globals ---
let scene, camera, renderer, mixer, clock;

// ARRAY: Holds all mesh pieces. This is crucial for models that are exported as 
// multiple disconnected meshes ("shattered") rather than a single contiguous mesh.
let bodyMeshes = []; 

// Reference to the specific material used for the face/head to allow dynamic expression texture swapping.
let bodyMaterial = null; 
let holoMaterial = null;// (Optional) If the model has a separate material for holographic elements, we can target it here.
let eyesMaterial = null; // (Optional) If the eyes are a separate material, we can target it for special effects like glow or color changes.
let gemMaterial = null; // (Optional) If there are gem-like materials that require special shader effects, we can target them here.

// Track the currently playing animation to allow for smooth crossfading.
let currentBaseAction = null;
const actions = {};

// --- Dictionaries & Data Structures ---

// Maps logical animation states to the specific animation clip names found in the .glb file.
const animationLibrary = {
    "Idle": "DefaultFloat",
    "Happy": "HappyFloat",
    "Sad": "SadFloat",
    "AngryEar": "AngryEar",
    "PuzzledEar": "PuzzledEar",
    "ExciteEar": "ExciteEar",
    "DingEar": "DingEar",
    "FanEar": "FanEar",
    "SadEar": "SadEar",
    "TalK1": "TalK1",
    "High Five": "High Five",
    "Surprised": "SurprisedFloat",
    "Thinking": "ThinkingFloat"
};

// Viseme targets represent the desired end-state for speech lip-syncing.
// These match the standard Oculus/Viseme morph target naming conventions.
const visemeTargets = {
    "viseme_sil": 0, "viseme_PP": 0, "viseme_FF": 0, "viseme_TH": 0,
    "viseme_DD": 0, "viseme_kk": 0, "viseme_CH": 0, "viseme_SS": 0,
    "viseme_nn": 0, "viseme_RR": 0, "viseme_AA": 0, "viseme_E": 0,
    "viseme_I": 0, "viseme_O": 0, "viseme_U": 0
};

// Maps logical mouth expressions to model blendshape names.
const visemeMouthBlendShapes = {
    "angry_mouth": "Angry",
    "whaa_mouth": "Whaa",
    "omega_mouth": "Omega",
    "wtf_mouth": "WTF",
    "wtf2_mouth": "WTF2",
    "frowning_mouth": "Frown",
}

// Maps logical eye expressions to model blendshape names.
const visemeEyeBlendShapes = {
    "blink_eyes": "Blink",
    "close_eyes": "Close",
    "angry_eyes": "AngryEyes",
    "smile_eyes": "SmileEyes",
    "howa_eyes": "HowaEyes",
    "bottom_lid_up": "BottomLidUp",
    "jito_eyes": "JitoEyes",
    "ha_eyes": "HaEyes",
    "kiri_eyes": "KiriEyes",
    "wink_a": "WinkA",
    "wink_b": "WinkB",
    "wink_c": "WinkC",
    "wink": "Wink" 
};

// visemeCurrent tracks the actual current weight of the blendshapes during the render loop.
// It is separated from visemeTargets to allow the Lerp algorithm to smoothly transition between values.
const visemeCurrent = { ...visemeTargets }; 
let mouthLerpRate = 0.4; // The speed factor for the Linear Interpolation (0.0 to 1.0)


/**
 * 1. TEXTURE CONTROLLER
 * Dynamically swaps the texture on the head/face material.
 * Used for updating 2D facial expressions mapped onto a 3D surface.
 * * @param {string} url - The URL or base64 data of the new texture.
 */
export function setTexture(url) {
    if (!bodyMaterial) return; // Failsafe if the material hasn't been mapped yet
    
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous'); // Prevents CORS issues when loading external textures
    
    loader.load(url, (t) => {
        // Enforce sRGB color space to prevent textures from looking washed out in WebGL
        t.colorSpace = THREE.SRGBColorSpace;
        // Three.js flips Y by default; disable this if the UVs are mapped top-down
        t.flipY = false; 
        
        bodyMaterial.map = t;
        bodyMaterial.needsUpdate = true; // Flag the material to be recompiled by the GPU
    });
}

/**
 * 2. INITIALIZATION ENGINE
 * Bootstraps the Three.js environment, loads the model, and configures the scene.
 * * @param {string} containerId - The HTML DOM element ID to inject the canvas into.
 * @param {string} assetBase - The base URL path for loading assets dynamically.
 */
export function initKuti(containerId, assetBase) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // --- SCENE SETUP ---
    scene = new THREE.Scene();
    clock = new THREE.Clock(); // Used to calculate delta time for animations
    
    // Configure perspective camera (FOV, Aspect Ratio, Near Clip, Far Clip)
    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.01, 100);
    camera.position.set(0, 0.1, 3);

    // Initialize WebGL Renderer with anti-aliasing for smooth edges and alpha for transparent backgrounds
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    // Cap pixel ratio to 3 to balance high-DPI (Retina) displays with performance
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 3));
    renderer.outputColorSpace = THREE.SRGBColorSpace; // Ensure final output colors are accurate
    container.appendChild(renderer.domElement);

    // --- LIGHTING SETUP ---
    // Hemisphere light provides soft ambient lighting (Sky Color, Ground Color, Intensity)
    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 2.5));
    
    // Directional light acts as a primary light source (like the sun) to create shadows and highlights
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(1, 2, 3);
    scene.add(dirLight);

    // --- MODEL LOADING ---
    const MODEL_PATH = `${assetBase}/kuti_model/Kuti_Model.glb`;
    const loader = new GLTFLoader();
    const statusText = document.getElementById("boot-status");
    
    loader.load(
        MODEL_PATH, 
        
        // 1. ON LOAD SUCCESS CALLBACK
        (gltf) => {
            const model = gltf.scene;
            scene.add(model);
            
            console.log("[System]: Scanning model for actuators...");

            // Recursively parse the model's node tree
            model.traverse((child) => {
                if (child.isMesh) {
                    
                    // Isolate meshes belonging to the character specifically
                    if (child.name.includes("Kuti") || (child.geometry && child.geometry.name.includes("Kuti"))) {
            
                        // If the mesh has morph targets (blendshapes), add it to our active array
                        if (child.morphTargetDictionary) {
                            console.log(`[Actuator Linked]: ${child.name} (Geometry: ${child.geometry.name})`);
                            bodyMeshes.push(child); 
                            window.primaryMesh = child; // Exposed to global scope for debugging via F12 console
                        }

                        // Handle meshes with multiple materials (Material Arrays)
                        if (Array.isArray(child.material)) {
                            child.material.forEach((mat) => {
                                // Fix rendering bugs with transparent PNGs intersecting each other
                                mat.transparent = true;
                                mat.alphaTest = 0.05; // Discards pixels with alpha < 5%, fixing z-sorting artifacts
                                mat.depthWrite = true;

                                // Identify and cache the specific material used for the face
                                // so `setTexture()` knows exactly which material to target later.
                                if (mat.name.toLowerCase().includes("head") || mat.name.toLowerCase().includes("face")) {
                                    bodyMaterial = mat;
                                }
                                if (mat.name.toLowerCase().includes("holo")) {
                                    holoMaterial = mat;
                                }
                                if (mat.name.toLowerCase().includes("eye")) {
                                    eyesMaterial = mat;
                                }
                                if (mat.name.toLowerCase().includes("gem")) {
                                    gemMaterial = mat;
                                }
                            });
                            
                            // Fallback: If no material named "head" or "face" is found, default to the first one
                            if (!bodyMaterial) bodyMaterial = child.material[0];

                        } else {
                            // Handle meshes with a single standard material
                            child.material.transparent = true;
                            child.material.alphaTest = 0.05;
                            child.material.depthWrite = true;
                            
                            if (!bodyMaterial) bodyMaterial = child.material;
                            if (!holoMaterial && child.material.name.toLowerCase().includes("holo")) holoMaterial = child.material;
                            if (!eyesMaterial && child.material.name.toLowerCase().includes("eye")) eyesMaterial = child.material;
                            if (!gemMaterial && child.material.name.toLowerCase().includes("gem")) gemMaterial = child.material;
                        }
                    }
                }
            });

            // --- ANIMATION MIXER SETUP ---
            mixer = new THREE.AnimationMixer(model);
            console.log("[Animation Diagnostics]: Available tracks from Blender:");
            
            // Map the parsed animation clips to our actions dictionary
            gltf.animations.forEach(clip => {
                console.log(` - ${clip.name}`);
                actions[clip.name] = mixer.clipAction(clip);
            });
            
            // Initiate default "Idle" animation
            if (actions['FloatAnim']) {
                actions['FloatAnim'].play();
            } else {
                console.warn("[Warning!]: 'FloatAnim' not found in .glb file.");
            }
            
            // Hide the loading UI once fully booted
            if (statusText) statusText.style.display = 'none';
            
            // Start the render loop
            animate();
        },
        
        // 2. ON PROGRESS CALLBACK
        (xhr) => {
            if (statusText) {
                // Calculate and display downloading progress
                const percent = Math.round((xhr.loaded / xhr.total) * 100);
                if (xhr.total > 0) {
                    statusText.innerText = `// DOWNLOADING_RENDERER: ${percent}%...`;
                } else {
                    // Fallback if total file size is unknown
                    statusText.innerText = `// DOWNLOADING_RENDERER: ${(xhr.loaded / 1024 / 1024).toFixed(2)} MB...`;
                }
            }
        },
        
        // 3. ON ERROR CALLBACK
        (error) => {
            console.error("XXX [Kuti Engine Error]: Failed to load .glb model", error);
            if (statusText) {
                statusText.style.color = "#ff4444";
                statusText.innerHTML = `[MODEL_404_ERROR]<br><span style="font-size: 10px; color:#888;">Check browser console (F12) for exact file path failure.</span>`;
            }
        }
    );

    /**
     * RENDER LOOP
     * Executes every frame (ideally 60fps) to update animations and render the scene.
     * This is for lip-syncing and facial expressions, using a Linear Interpolation (Lerp) algorithm to smoothly transition morph target weights over time.
     */
    function animate() {
        requestAnimationFrame(animate);
        const delta = clock.getDelta(); // Time elapsed since last frame

        // --- LINEAR INTERPOLATION (LERP) ALGORITHM FOR MORPH TARGETS ---
        // Iterate through every valid mesh piece to synchronize their morph targets.
        // This ensures that if the head is separate from the body, they both animate visemes simultaneously.
        bodyMeshes.forEach(mesh => {
            if (mesh.morphTargetDictionary && mesh.morphTargetInfluences) {
                const dict = mesh.morphTargetDictionary;
                
                Object.keys(visemeTargets).forEach(key => {
                    const idx = dict[key];
                    if (idx !== undefined) {
                        // Math: Current = Current + (Target - Current) * Speed
                        // This creates an easing effect where the movement slows down as it approaches the target,
                        // making facial animations (especially speech) look organic rather than robotic.
                        visemeCurrent[key] += (visemeTargets[key] - visemeCurrent[key]) * mouthLerpRate;
                        
                        // Apply the calculated weight to the actual 3D mesh
                        mesh.morphTargetInfluences[idx] = visemeCurrent[key];
                    }
                });
            }
        });

        // Step the skeletal animation mixer forward
        if (mixer) mixer.update(delta);
        
        // Render the finalized frame to the canvas
        renderer.render(scene, camera);
    }
    
    /**
     * 3. THE MESSAGE BUS
     * Listens for postMessage events from the parent window or external components.
     * Acts as the API for driving the 3D engine state externally.
     */
    window.addEventListener("message", (e) => {
        const { type, animation, visemes, rate, audioUrl } = e.data;
        if (!type) return;

        switch (type) {
            // Resets camera to default tracking position
            case "RESET_CAMERA":
                camera.position.set(0, 0.1, 3);
                break;

            // Handles skeletal animation switching with smooth crossfading
            case "SET_ANIMATION":
                if (actions[animation]) {
                    const next = actions[animation];
                    const fade = rate || 0.5; // Default crossfade duration of 0.5s
                    
                    // Only transition if it's a new animation state
                    if (currentBaseAction !== next) {
                        next.reset().fadeIn(fade).play();
                        if (currentBaseAction) currentBaseAction.fadeOut(fade);
                        currentBaseAction = next;
                    }
                }
                break;

            // Updates the target values for the Lip-sync/Facial expression Lerp system
            case "SET_VISEMES":
                // 1. Zero out all current targets to prevent ghosting of previous expressions. 
                Object.keys(visemeTargets).forEach(k => visemeTargets[k] = 0);
                
                // 2. Assign the new target weights
                // Note: The actual movement happens gradually inside the animate() loop via Lerp.
                if (visemes) {
                    Object.entries(visemes).forEach(([key, weight]) => {
                        if (visemeTargets[key] !== undefined) {
                            visemeTargets[key] = weight;
                        }
                    });
                }
                
                // Optionally update the speed of the transition
                if (rate) mouthLerpRate = rate;
                break;
                
            // 🚀 THE NEW AUDIO ENGINE: Grabs the URL from Python and plays it instantly
            case "SPEECH_READY":
                console.log("![Kuti Engine UI]: Received Signal Type: SPEECH_READY");
                
                if (audioUrl) {
                    const voiceAudio = new Audio(audioUrl);
                    
                    voiceAudio.onplay = () => {
                        console.log("🔊 [Kuti Audio]: Broadcasting voice response...");
                        // If you want Kuti to automatically switch to a talking animation when speaking,
                        // you can uncomment the lines below:
                        /*
                        if (actions["TalK1"] && currentBaseAction !== actions["TalK1"]) {
                            actions["TalK1"].reset().fadeIn(0.5).play();
                            if (currentBaseAction) currentBaseAction.fadeOut(0.5);
                            currentBaseAction = actions["TalK1"];
                        }
                        */
                    };
                    
                    // Catch block prevents the whole script from crashing if the browser blocks auto-play
                    voiceAudio.play().catch(err => {
                        console.error("🔇 [Audio Blocked]: The browser prevented playback. Make sure the user clicks something first!", err);
                    });
                }
                break;
        }
    });
}