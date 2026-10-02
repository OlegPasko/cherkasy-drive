// Procedural sky dome, clouds, sun / moon / stars, height haze and the PBR environment, all driven by daylight.js.
//
//   createSky({ scene, renderer, daylight, quality = 'high', cloudCover = 0.35 }) -> sky
//     sky.update(dt, camera)      follow the camera, push daylight into the shader and fog, refresh the env map lazily
//                                 (at once after a sun jump of 6+ deg, a weather change or refreshEnvironment(); the
//                                 running clock's drift and the clouds' motion only every 2 min)
//     sky.refreshEnvironment()    force a new environment map on the next update
//     sky.setQuality('low' | 'medium' | 'high'), sky.setCloudCover(0..1), sky.setHaze({ start, density })
//     sky.mesh, sky.material, sky.fog (Haze), sky.envMap (current PMREM texture), sky.stats { envRefreshes, envMs }
//     sky.dispose()
//   Haze (extends THREE.Fog) – scene.fog replacement. near = clear radius around the eye (m), far = extinction per metre
//     at ground level. installHazeChunks() (runs on import) swaps three's fog chunks for an exponential-height haze with
//     a sun-side glow; every built-in and chunk-based material with fog: true gets it without per-material patching.
//
// The dome is drawn after the opaque pass at the far plane (depth test on, no depth write), so only visible sky pixels
// pay for clouds. The environment map is a PMREM of this very dome, re-rendered only when the sun moved noticeably,
// the weather changed or half a minute passed, never every frame.
import * as THREE from 'three';
import { ATMO } from './daylight.js';

// ---------------------------------------------------------------------------------------------- height haze
const HAZE_BASE = -2.0, HAZE_FALLOFF = 320.0, HAZE_SUN = 0.05;

export class Haze extends THREE.Fog {
  constructor(color = 0xbfd0e0, start = 40, density = 0.00018) {
    super(color, start, density);
    this.isHaze = true;
    this.name = 'Haze';
  }
  get start() { return this.near; } set start(v) { this.near = v; }
  get density() { return this.far; } set density(v) { this.far = v; }
}

let hazeInstalled = false;
export function installHazeChunks() {
  if (hazeInstalled) return;
  hazeInstalled = true;
  const C = THREE.ShaderChunk;
  C.fog_pars_vertex = `
#ifdef USE_FOG
	varying float vFogDepth;
	varying vec3 vFogWorld;
#endif`;
  C.fog_vertex = `
#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
	vFogWorld = ( mvPosition.xyz - viewMatrix[ 3 ].xyz ) * mat3( viewMatrix ); // view -> world without an inverse
#endif`;
  C.fog_pars_fragment = `
#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	varying vec3 vFogWorld;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif`;
  C.fog_fragment = `
#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
		vec3 fogTint = fogColor;
	#else
		// optical depth of an exponential-height haze along the eye ray, skipping the first fogNear metres
		vec3 hzRay = vFogWorld - cameraPosition;
		float hzLen = max( length( hzRay ), 1e-4 );
		float hzRun = max( hzLen - fogNear, 0.0 );
		float hzY0 = cameraPosition.y + hzRay.y * ( 1.0 - hzRun / hzLen );
		float hzA = clamp( hzRay.y * hzRun / hzLen / ${HAZE_FALLOFF.toFixed(1)}, -40.0, 40.0 );
		float hzInt = abs( hzA ) > 1e-3 ? ( 1.0 - exp( - hzA ) ) / hzA : 1.0 - 0.5 * hzA;
		float hzTau = fogFar * exp( - clamp( ( hzY0 - ${HAZE_BASE.toFixed(1)} ) / ${HAZE_FALLOFF.toFixed(1)}, -4.0, 60.0 ) ) * hzRun * hzInt;
		float fogFactor = 1.0 - exp( - hzTau );
		vec3 fogTint = fogColor;
		#if defined( RE_Direct ) && NUM_SUN_LIGHTS > 0
			vec3 hzView = normalize( ( viewMatrix * vec4( hzRay, 0.0 ) ).xyz );
			fogTint += sunLights[ 0 ].color * ( ${HAZE_SUN} * pow( max( dot( hzView, sunLights[ 0 ].direction ), 0.0 ), 8.0 ) );
		#endif
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogTint, fogFactor );
#endif`;
}
installHazeChunks();

// ---------------------------------------------------------------------------------------------- dome shader
const CLOUD_ALT = 1600.0;

const VERT = /* glsl */`
varying vec3 vDir;
void main() {
	vec4 wp = modelMatrix * vec4( position, 1.0 );
	vDir = wp.xyz - cameraPosition;
	gl_Position = projectionMatrix * viewMatrix * wp;
	// pin to the far plane: 0 in a reversed [0,1] buffer, w (ndc 1) otherwise
	#ifdef USE_REVERSED_DEPTH_BUFFER
		gl_Position.z = gl_Position.w * 1e-7;
	#else
		gl_Position.z = gl_Position.w * 0.9999999;
	#endif
}`;

const FRAG = /* glsl */`
uniform vec3 uSunDir, uMoonDir, uSunRad, uTauR, uTauO, uNightSky, uBlueHour, uGround, uOvercastCol, uCloudSun, uCloudAmb, uCamPos;
uniform float uTauM, uMieG, uSunGain, uSunMass, uHaze, uTwilight, uOvercast, uStarVis, uMoonVis, uTime, uCloudCover, uSunDisk;
uniform vec2 uWind;
uniform mat3 uStarRot;
varying vec3 vDir;

float airMass( float s ) {
	s = clamp( s, 0.0, 1.0 );
	return 1.0 / ( s + 0.50572 * pow( degrees( asin( s ) ) + 6.07995, -1.6364 ) );
}

vec3 clearSky( vec3 d ) {
	float up = max( d.y, 0.0 );
	float mu = dot( d, uSunDir );
	float tm = uTauM * ( 1.0 + 2.0 * uHaze );
	float g = uMieG;
	float k = 1.0 + g * g - 2.0 * g * mu;
	float pr = 0.0596831 * ( 1.0 + mu * mu );
	float pm = 0.0795775 * ( 1.0 - g * g ) / ( k * sqrt( k ) );
	vec3 ext = uTauR + uTauO + tm;
	float ms = uSunMass * ( 0.3 + 0.7 * pow( 1.0 - up, 3.0 ) ); // shorter sun path for light scattered up high
	vec3 L = uSunGain * exp( - ext * ms ) * ( uTauR * pr + tm * pm ) / ext * ( 1.0 - exp( - ext * airMass( up ) ) );
	return L + uNightSky * ( 0.6 + 0.4 * up ) + uBlueHour * uTwilight * ( 0.5 + 0.5 * up );
}

float h21( vec2 p ) { return fract( sin( dot( p, vec2( 41.37, 289.13 ) ) ) * 17493.137 ); }
float h31( vec3 p ) { return fract( sin( dot( p, vec3( 17.13, 113.71, 61.29 ) ) ) * 23142.61 ); }

float vnoise( vec2 p ) {
	vec2 i = floor( p ), f = fract( p );
	f = f * f * ( 3.0 - 2.0 * f );
	float a = h21( i ), b = h21( i + vec2( 1.0, 0.0 ) ), c = h21( i + vec2( 0.0, 1.0 ) ), e = h21( i + vec2( 1.0, 1.0 ) );
	return mix( mix( a, b, f.x ), mix( c, e, f.x ), f.y );
}

float fbm( vec2 p ) {
	float v = 0.0, amp = 0.52;
	const mat2 turn = mat2( 1.62, 1.18, -1.18, 1.62 );
	for ( int i = 0; i < CLOUD_OCTAVES; i ++ ) { v += amp * vnoise( p ); p = turn * p + 9.31; amp *= 0.5; }
	return v;
}

vec3 starField( vec3 d ) {
	vec3 p = d * 170.0, c = floor( p ), f = p - c;
	float h = h31( c );
	if ( h > 0.04 ) return vec3( 0.0 );
	vec3 at = 0.15 + 0.7 * vec3( h31( c + 3.1 ), h31( c + 5.7 ), h31( c + 8.3 ) );
	float glow = 1.0 - smoothstep( 0.0, 0.13, length( f - at ) );
	float mag = 0.015 + 0.12 * pow( 1.0 - h / 0.04, 6.0 );
	vec3 tint = mix( vec3( 1.0, 0.86, 0.72 ), vec3( 0.78, 0.86, 1.0 ), h31( c + 1.9 ) );
	return tint * glow * mag;
}

// rgb = lit cloud colour, a = coverage
vec4 cloudLayer( vec3 d, vec3 behind ) {
	if ( d.y < 0.015 || uCloudCover <= 0.001 ) return vec4( 0.0 );
	float t = ( ${CLOUD_ALT.toFixed(1)} - uCamPos.y ) / d.y;
	vec2 p = ( uCamPos.xz + d.xz * t ) * 0.00028 + uWind * uTime;
	float thr = mix( 0.7, 0.2, uCloudCover );
	float dens = smoothstep( thr, thr + 0.28, fbm( p ) );
	if ( dens <= 0.0 ) return vec4( 0.0 );
	#ifdef CLOUD_SELF_SHADOW
		float shade = 1.0 - 0.55 * smoothstep( thr, thr + 0.5, fbm( p + uSunDir.xz * 0.12 ) );
	#else
		float shade = 1.0 - 0.35 * dens;
	#endif
	float silver = 1.0 + 1.4 * pow( max( dot( d, uSunDir ), 0.0 ), 12.0 );
	vec3 col = uCloudSun * shade * silver + uCloudAmb;
	col = mix( col, behind, 1.0 - exp( - t * 0.00005 ) ); // aerial perspective over the long slant
	return vec4( col, dens * smoothstep( 0.015, 0.12, d.y ) );
}

void main() {
	vec3 d = normalize( vDir );
	vec3 dh = normalize( vec3( d.x, max( d.y, 0.0 ), d.z ) );
	vec3 sky = clearSky( dh );
	vec3 horizon = sky;

	if ( uStarVis > 0.0 ) sky += starField( uStarRot * d ) * uStarVis * smoothstep( 0.0, 0.2, d.y );

	float mm = dot( d, uMoonDir );
	if ( uMoonVis > 0.0 && mm > 0.9998 ) {
		vec3 ax = normalize( cross( uMoonDir, vec3( 1e-3, 1.0, 0.0 ) ) ), ay = cross( ax, uMoonDir );
		vec2 q = vec2( dot( d, ax ), dot( d, ay ) ) / 0.0105;
		float r2 = dot( q, q );
		if ( r2 < 1.0 ) {
			vec3 nrm = q.x * ax + q.y * ay - sqrt( 1.0 - r2 ) * uMoonDir; // the face turned to us
			float lit = max( dot( nrm, uSunDir ), 0.0 ) * 0.9 + 0.03; // phase: lit where the sun faces the disk
			float mottle = 0.78 + 0.22 * vnoise( q * 3.0 + 4.0 );
			float edge = 1.0 - smoothstep( 0.85, 1.0, r2 );
			sky = mix( sky, vec3( 1.6, 1.58, 1.5 ) * lit * mottle, edge * uMoonVis );
		}
	}

	float mu = dot( d, uSunDir );
	float disk = smoothstep( 0.99996, 0.999975, mu );
	sky += uSunRad * ( disk * uSunDisk + 0.3 * pow( max( mu, 0.0 ), 4000.0 ) ) * ( 1.0 - uOvercast );

	vec4 cl = cloudLayer( d, horizon );
	sky = mix( sky, cl.rgb, cl.a );

	float below = 1.0 - smoothstep( -0.3, 0.0, d.y );
	sky = mix( sky, uGround, below * 0.55 );
	sky = mix( sky, uOvercastCol * ( 0.8 + 0.35 * max( d.y, 0.0 ) ), uOvercast * 0.85 );

	gl_FragColor = vec4( sky, 1.0 );
	#include <colorspace_fragment>
}`;

const Q = {
  low: { octaves: 3, selfShadow: false, envSize: 64 },
  medium: { octaves: 4, selfShadow: true, envSize: 128 },
  high: { octaves: 5, selfShadow: true, envSize: 128 },
};

export function createSky({ scene, renderer, daylight, quality = 'high', cloudCover = 0.35 } = {}) {
  const S = daylight.state;
  const u = {
    uSunDir: { value: new THREE.Vector3() }, uMoonDir: { value: new THREE.Vector3() },
    uSunRad: { value: new THREE.Vector3() }, uTauR: { value: new THREE.Vector3(...ATMO.tauR) }, uTauO: { value: new THREE.Vector3(...ATMO.tauO) },
    uNightSky: { value: new THREE.Vector3(...ATMO.nightSky) }, uBlueHour: { value: new THREE.Vector3(...ATMO.blueHour) },
    uGround: { value: new THREE.Vector3() }, uOvercastCol: { value: new THREE.Vector3() },
    uCloudSun: { value: new THREE.Vector3() }, uCloudAmb: { value: new THREE.Vector3() }, uCamPos: { value: new THREE.Vector3() },
    uTauM: { value: ATMO.tauM }, uMieG: { value: ATMO.mieG }, uSunGain: { value: 0 }, uSunMass: { value: 1 }, uHaze: { value: 0 }, uTwilight: { value: 0 },
    uOvercast: { value: 0 }, uStarVis: { value: 0 }, uMoonVis: { value: 0 }, uTime: { value: 0 },
    uCloudCover: { value: cloudCover }, uSunDisk: { value: 1.2 },
    uWind: { value: new THREE.Vector2(0.0041, 0.0017) }, uStarRot: { value: new THREE.Matrix3() },
  };
  const material = new THREE.ShaderMaterial({
    name: 'SkyDome', uniforms: u, vertexShader: VERT, fragmentShader: FRAG,
    side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false, toneMapped: false,
    defines: { CLOUD_OCTAVES: 5, CLOUD_SELF_SHADOW: 1 },
  });
  const geo = new THREE.SphereGeometry(10, 48, 24);
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'sky';
  mesh.frustumCulled = false;
  mesh.renderOrder = 1e6;              // after all opaque geometry: only uncovered pixels shade clouds
  mesh.castShadow = mesh.receiveShadow = false;
  mesh.matrixAutoUpdate = true;
  scene.add(mesh);

  const fog = new Haze(0xbfd0e0, 120, 0.0001);
  let baseDensity = 0.0001;
  scene.fog = fog;

  // env capture: the same material on a dome at the origin of a private scene
  const envScene = new THREE.Scene();
  const envMesh = new THREE.Mesh(geo, material);
  envMesh.frustumCulled = false;
  envScene.add(envMesh);
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envTarget = null, envSize = 128, envDirty = true, envClock = 1e9, envAge = 0;
  const ENV_SLOW = 120, ENV_JUMP = Math.cos(6 * Math.PI / 180); // s between drift refreshes; a sun step counted as a jump
  const lastSun = new THREE.Vector3(0, -2, 0);
  let lastOvercast = -1, lastCover = -1;
  const stats = { envRefreshes: 0, envMs: 0 };

  function setQuality(q) {
    const c = Q[q] || Q.high;
    material.defines.CLOUD_OCTAVES = c.octaves;
    if (c.selfShadow) material.defines.CLOUD_SELF_SHADOW = 1; else delete material.defines.CLOUD_SELF_SHADOW;
    material.needsUpdate = true;
    if (envSize !== c.envSize) { envSize = c.envSize; envDirty = true; }
  }
  setQuality(quality);

  const tmp = new THREE.Vector3();
  function pushUniforms(camera) {
    u.uSunDir.value.copy(S.sunDir); u.uMoonDir.value.copy(S.moonDir);
    u.uSunRad.value.set(...S.sunRadiance);
    u.uSunGain.value = S.sunGain; u.uSunMass.value = S.sunMass;
    u.uHaze.value = S.overcast; u.uOvercast.value = S.overcast; u.uTwilight.value = S.twilight;
    u.uStarVis.value = S.starVis;
    u.uMoonVis.value = THREE.MathUtils.smoothstep(S.moonDir.y, -0.02, 0.06) * (1 - S.overcast) * Math.max(0.15, S.night);
    u.uStarRot.value.copy(S.starRot);
    const oc = S.overcastColor; u.uOvercastCol.value.set(oc.r, oc.g, oc.b);
    // ground seen below the horizon: albedo x (direct + sky) irradiance, then mostly haze in the shader
    const irr = S.lightIntensity * Math.max(S.lightDir.y, 0), a = ATMO.groundAlbedo, h = S.horizonColor;
    u.uGround.value.set(a[0] * (irr * S.lightColor.r + h.r * 2), a[1] * (irr * S.lightColor.g + h.g * 2), a[2] * (irr * S.lightColor.b + h.b * 2));
    const k = 1.0 / ATMO.skyGain, moon = (1 - S.overcast) * S.night * 0.035;
    u.uCloudSun.value.set(S.sunRadiance[0] * k + moon * 0.8, S.sunRadiance[1] * k + moon * 0.9, S.sunRadiance[2] * k + moon);
    tmp.set(S.zenithColor.r, S.zenithColor.g, S.zenithColor.b).lerp(u.uOvercastCol.value, 0.3);
    u.uCloudAmb.value.set(h.r, h.g, h.b).add(tmp).multiplyScalar(0.45);
    if (camera) u.uCamPos.value.set(camera.position.x, Math.min(camera.position.y, CLOUD_ALT - 150), camera.position.z);
  }

  function refreshEnv() {
    const t0 = performance.now();
    const next = pmrem.fromScene(envScene, 0, 0.1, 100, { size: envSize });
    scene.environment = next.texture;
    envTarget?.dispose();
    envTarget = next;
    stats.envRefreshes++; stats.envMs = performance.now() - t0;
    lastSun.copy(S.sunDir); lastOvercast = S.overcast; lastCover = u.uCloudCover.value;
    envDirty = false; envAge = 0;
  }

  function update(dt, camera) {
    dt = Math.min(Math.max(dt || 0, 0), 0.25);
    u.uTime.value += dt;
    if (camera) mesh.position.copy(camera.position);
    pushUniforms(camera);
    fog.color.copy(S.fogColor);
    fog.far = baseDensity * (1 + 1.8 * S.overcast);
    scene.environmentIntensity = S.envIntensity;

    envClock += dt; envAge += dt;
    // a jump of the sun (T, the night skip, a preset blend) or a weather change refreshes at once; the running clock's
    // slow drift (0.1 deg/s at the game's day-per-hour) and the clouds' motion only every ENV_SLOW s: a bake is six
    // faces of the cloud shader plus the PMREM blur, a hitch not worth paying every few seconds
    const jump = lastSun.dot(S.sunDir) < ENV_JUMP, moved = lastSun.dot(S.sunDir) < 0.99994; // ~0.6 deg
    const weather = Math.abs(lastOvercast - S.overcast) > 0.03 || Math.abs(lastCover - u.uCloudCover.value) > 0.03;
    if ((envDirty || jump || weather) && envClock > 0.2) { envClock = 0; refreshEnv(); }
    else if ((moved || envAge > ENV_SLOW) && envClock > ENV_SLOW) { envClock = 0; refreshEnv(); }
  }

  return {
    mesh, material, fog, uniforms: u, stats,
    get envMap() { return envTarget?.texture ?? null; },
    update,
    setQuality,
    refreshEnvironment() { envDirty = true; },
    setCloudCover(v) { u.uCloudCover.value = Math.min(1, Math.max(0, v)); },
    setHaze({ start, density } = {}) {
      if (start !== undefined) fog.near = Math.min(400, Math.max(0, start));
      if (density !== undefined) baseDensity = Math.min(0.002, Math.max(0, density));
    },
    dispose() {
      scene.remove(mesh);
      if (scene.fog === fog) scene.fog = null;
      if (scene.environment === envTarget?.texture) scene.environment = null;
      envTarget?.dispose(); pmrem.dispose(); geo.dispose(); material.dispose();
    },
  };
}
