import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

let scene, camera, renderer, mixer, clock;
let bodyMesh = null;
let bodyMaterial = null;
let currentBaseAction = null;
const actions = {};

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

// Linear Interpolation (Lerp) States
const visemeTargets = {
    "viseme_sil": 0, "viseme_PP": 0, "viseme_FF": 0, "viseme_TH": 0,
    "viseme_DD": 0, "viseme_kk": 0, "viseme_CH": 0, "viseme_SS": 0,
    "viseme_nn": 0, "viseme_RR": 0, "viseme_aa": 0, "viseme_E": 0,
    "viseme_I": 0, "viseme_O": 0, "viseme_U": 0, "viseme_AA": 0
};

const visemeMouthBlendShapes = {
    "angry_mouth": "Angry",
    "whaa_mouth": "Whaa",
    "omega_mouth": "Omega",
    "wtf_mouth": "WTF",
    "wtf2_mouth": "WTF2",
    "frowning_mouth": "Frown",
}

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

const visemeCurrent = { ...visemeTargets }; 
let mouthLerpRate = 0.4; 

/**
 * 1. TEXTURE CONTROLLER
 */
export function setTexture(url) {
    if (!bodyMaterial) return;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous'); 
    loader.load(url, (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.flipY = false;
        bodyMaterial.map = t;
        bodyMaterial.needsUpdate = true;
    });
}

/**
 * 2. INITIALIZATION ENGINE
 * Accepts assetBase dynamically from index.html
 */
export function initKuti(containerId, assetBase) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // SCENE SETUP
    scene = new THREE.Scene();
    clock = new THREE.Clock();
    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.01, 100);
    camera.position.set(0, 0.1, 1);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 2.5));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(1, 2, 3);
    scene.add(dirLight);

  // MODEL LOADING (Dynamically constructed path)
    const MODEL_PATH = `${assetBase}/kuti_model/Kuti_Model.glb`;
    const loader = new GLTFLoader();
    const statusText = document.getElementById("boot-status");
    
    loader.load(
        MODEL_PATH, 
        // 1. ON LOAD SUCCESS
        (gltf) => {
            const model = gltf.scene;
            scene.add(model);
            
            model.traverse((child) => {
                // Catch any mesh that contains "Kuti" in case Blender split the mesh into pieces
                if (child.isMesh && child.name.includes("Kuti")) {
                    
                    // 1. Identify the specific piece that has the mouth/eye morph targets
                    if (child.morphTargetDictionary) {
                        bodyMesh = child;
                        window.bodyMesh = child; // For debugging
                    }

                    // 2. Handle the Multi-Material Array
                    if (Array.isArray(child.material)) {
                        child.material.forEach((mat) => {
                            // Fix transparent PNG rendering bugs
                            mat.transparent = true;
                            mat.alphaTest = 0.05; 
                            mat.depthWrite = true;

                            // We need to isolate the "Face/Head" material so your 
                            // setTexture() function knows which one to swap emotions on.
                            // (Adjust "head" if your material is named differently in Blender)
                            if (mat.name.toLowerCase().includes("head") || mat.name.toLowerCase().includes("face")) {
                                bodyMaterial = mat;
                            }
                        });
                        
                        // Fallback if we couldn't find the head by name
                        if (!bodyMaterial) bodyMaterial = child.material[0];

                    } else {
                        // Handle standard single materials
                        child.material.transparent = true;
                        child.material.alphaTest = 0.05;
                        child.material.depthWrite = true;
                        
                        if (!bodyMaterial) bodyMaterial = child.material;
                    }
                }
            });

            mixer = new THREE.AnimationMixer(model);
            gltf.animations.forEach(clip => actions[clip.name] = mixer.clipAction(clip));
            if (actions['DefaultFloat']) actions['DefaultFloat'].play();
            
            if (statusText) statusText.style.display = 'none';
            
            animate();
        },
        // 2. ON PROGRESS
        (xhr) => {
            if (statusText) {
                const percent = Math.round((xhr.loaded / xhr.total) * 100);
                if (xhr.total > 0) {
                    statusText.innerText = `// DOWNLOADING_CHASSIS: ${percent}%...`;
                } else {
                    statusText.innerText = `// DOWNLOADING_CHASSIS: ${(xhr.loaded / 1024 / 1024).toFixed(2)} MB...`;
                }
            }
        },
        // 3. ON ERROR
        (error) => {
            console.error("❌ [Kuti Engine Error]: Failed to load .glb model", error);
            if (statusText) {
                statusText.style.color = "#ff4444";
                statusText.innerHTML = `[MODEL_404_ERROR]<br><span style="font-size: 10px; color:#888;">Check browser console (F12) for exact file path failure.</span>`;
            }
        }
    );
    function animate() {
        requestAnimationFrame(animate);
        const delta = clock.getDelta();

        if (bodyMesh && bodyMesh.morphTargetDictionary) {
            const dict = bodyMesh.morphTargetDictionary;
            
            Object.keys(visemeTargets).forEach(key => {
                const idx = dict[key];
                if (idx !== undefined) {
                    visemeCurrent[key] += (visemeTargets[key] - visemeCurrent[key]) * mouthLerpRate;
                    bodyMesh.morphTargetInfluences[idx] = visemeCurrent[key];
                }
            });
        }

        if (mixer) mixer.update(delta);
        renderer.render(scene, camera);
    }

    /**
     * 3. THE MESSAGE BUS
     */
    window.addEventListener("message", (e) => {
        const { type, animation, visemes, rate, url } = e.data;
        if (!type) return;

        switch (type) {
            case "RESET_CAMERA":
                camera.position.set(0, 1, 2);
                // Removed the broken controls logic. If you add OrbitControls later, 
                // you can re-implement this safely.
                break;

            case "SET_ANIMATION":
                if (actions[animation]) {
                    const next = actions[animation];
                    const fade = rate || 0.5;
                    if (currentBaseAction !== next) {
                        next.reset().fadeIn(fade).play();
                        if (currentBaseAction) currentBaseAction.fadeOut(fade);
                        currentBaseAction = next;
                    }
                }
                break;

            case "SET_VISEMES":
                Object.keys(visemeTargets).forEach(k => visemeTargets[k] = 0);
                
                if (visemes) {
                    Object.entries(visemes).forEach(([key, weight]) => {
                        if (visemeTargets[key] !== undefined) {
                            visemeTargets[key] = weight;
                        }
                    });
                }
                if (rate) mouthLerpRate = rate;
                break;
        }
    });
}