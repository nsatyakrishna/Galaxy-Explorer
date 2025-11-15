import { useEffect, useMemo, useRef, useState } from 'react';
import { OrbitControls, Sparkles, Stars, shaderMaterial } from '@react-three/drei';
import { EffectComposer, Bloom, Noise, Vignette } from '@react-three/postprocessing';
import { BlendFunction, KernelSize } from 'postprocessing';
import { ReactThreeFiber, extend, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { GalaxyData } from '../data/galaxies';

type GalaxySceneProps = {
  galaxies: GalaxyData[];
  selectedGalaxyId: string;
  onSelectGalaxy: (galaxyId: string) => void;
};

type GalaxyWithPosition = GalaxyData & {
  position: THREE.Vector3;
  index: number;
  baseTilt: THREE.Euler;
  rotationSpeed: number;
};

const getColorPair = (scheme: string) => {
  const parts = scheme.split(',');
  if (parts.length >= 2) {
    return parts as [string, string];
  }
  return [scheme, '#ffffff'];
};

const GalaxyGlowMaterial = shaderMaterial(
  {
    uColor: new THREE.Color('#ffffff'),
    uStrength: 1
  },
  /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`,
  /* glsl */ `
  varying vec2 vUv;
  uniform vec3 uColor;
  uniform float uStrength;
  void main() {
    vec2 centered = vUv - 0.5;
    float dist = length(centered) * 2.2;
    float falloff = pow(max(1.0 - dist, 0.0), 2.4);
    vec3 color = uColor * (0.6 + falloff * 0.9);
    float alpha = falloff * uStrength;
    gl_FragColor = vec4(color, alpha);
  }
`
);

extend({ GalaxyGlowMaterial });

type GalaxyGlowMaterialInstance = THREE.ShaderMaterial & {
  uniforms: {
    uColor: { value: THREE.Color };
    uStrength: { value: number };
  };
};

const GalaxyDiscMaterial = shaderMaterial(
  {
    uColorA: new THREE.Color('#ffffff'),
    uColorB: new THREE.Color('#88aaff'),
    uTime: 0,
    uIntensity: 1
  },
  /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`,
  /* glsl */ `
  varying vec2 vUv;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform float uTime;
  uniform float uIntensity;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);

    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));

    vec2 u = f * f * (3.0 - 2.0 * f);

    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    mat2 rot = mat2(cos(0.5), -sin(0.5), sin(0.5), cos(0.5));
    for (int i = 0; i < 5; i++) {
      value += amplitude * noise(p);
      p = rot * p * 2.2;
      amplitude *= 0.5;
    }
    return value;
  }

  void main() {
    vec2 centeredUv = vUv - 0.5;
    float radius = length(centeredUv);
    float angle = atan(centeredUv.y, centeredUv.x);
    float swirl = sin(angle * 3.0 - radius * 6.5 + uTime * 0.4);
    float streaks = fbm(centeredUv * 7.5 + swirl);
    float core = smoothstep(0.2, 0.0, radius) * 0.7;
    float falloff = smoothstep(0.98, 0.32, radius);
    float glow = pow(max(0.0, 1.0 - radius * 2.4), 2.4);
    float intensity = (streaks * 0.6 + swirl * 0.15 + core + glow * 0.8) * uIntensity * falloff;

    vec3 color = mix(uColorA, uColorB, clamp(radius * 1.4 + swirl * 0.2, 0.0, 1.0));
    float alpha = clamp(intensity * (1.2 - radius * 0.8), 0.0, 1.0);

    gl_FragColor = vec4(color * (0.4 + intensity * 0.9), alpha);
  }
`
);

extend({ GalaxyDiscMaterial });

type GalaxyDiscMaterialInstance = THREE.ShaderMaterial & {
  uniforms: {
    uColorA: { value: THREE.Color };
    uColorB: { value: THREE.Color };
    uTime: { value: number };
    uIntensity: { value: number };
  };
};

declare global {
  namespace JSX {
    interface IntrinsicElements {
      galaxyGlowMaterial: ReactThreeFiber.Object3DNode<GalaxyGlowMaterialInstance, typeof GalaxyGlowMaterial> & {
        uColor?: THREE.ColorRepresentation;
        uStrength?: number;
      };
      galaxyDiscMaterial: ReactThreeFiber.Object3DNode<GalaxyDiscMaterialInstance, typeof GalaxyDiscMaterial> & {
        uColorA?: THREE.ColorRepresentation;
        uColorB?: THREE.ColorRepresentation;
        uIntensity?: number;
      };
    }
  }
}

export function GalaxyScene({ galaxies, selectedGalaxyId, onSelectGalaxy }: GalaxySceneProps) {
  const { camera } = useThree();
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const targetRef = useRef(new THREE.Vector3());
  const desiredCameraRef = useRef(new THREE.Vector3());
  const [hoveredGalaxy, setHoveredGalaxy] = useState<string | null>(null);

  const galaxiesWithPositions = useMemo<GalaxyWithPosition[]>(() => {
    const radius = 55;
    return galaxies.map((galaxy, index) => {
      const angle = (index / galaxies.length) * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const y = (Math.sin(angle * 2) * 4) / 2;
      const isSombrero = galaxy.id === 'sombrero';
      const tilt = isSombrero
        ? new THREE.Euler(THREE.MathUtils.degToRad(84), THREE.MathUtils.degToRad(-12), THREE.MathUtils.degToRad(4))
        : galaxy.type.includes('Irregular')
          ? new THREE.Euler(THREE.MathUtils.degToRad(18), THREE.MathUtils.degToRad(index * 12), THREE.MathUtils.degToRad(-8))
          : new THREE.Euler(THREE.MathUtils.degToRad(32), THREE.MathUtils.degToRad(index * 8), THREE.MathUtils.degToRad(6));
      const rotationSpeed = isSombrero ? 0.18 : galaxy.type.includes('Elliptical') ? 0.12 : 0.32;
      return {
        ...galaxy,
        position: new THREE.Vector3(x, y, z),
        index,
        baseTilt: tilt,
        rotationSpeed
      };
    });
  }, [galaxies]);

  const selectedGalaxy = galaxiesWithPositions.find((galaxy) => galaxy.id === selectedGalaxyId) ?? galaxiesWithPositions[0];

  useEffect(() => {
    targetRef.current.copy(selectedGalaxy.position);
  }, [selectedGalaxy]);

  useFrame(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    // Camera offset is proportional to galaxy size so each system fills the viewport.
    const sizeScalar = Math.cbrt(selectedGalaxy.sizeLightYears) * 0.05;
    desiredCameraRef.current.copy(selectedGalaxy.position).add(new THREE.Vector3(sizeScalar * 0.6 + 4, sizeScalar * 0.5 + 12, sizeScalar * 1.8 + 25));

    camera.position.lerp(desiredCameraRef.current, 0.08);
    controls.target.lerp(targetRef.current, 0.12);
    controls.update();
  });

  return (
    <>
      <fog attach="fog" args={["#050510", 70, 210]} />
      <ambientLight intensity={0.45} color="#6f7ba5" />
      <hemisphereLight args={["#273d63", "#04030a", 0.35]} />
      <pointLight position={[18, 32, 22]} intensity={1.1} distance={240} decay={2} color="#8fb5ff" />
      <pointLight position={[-36, -24, -34]} intensity={0.7} distance={260} decay={2} color="#ff7fcf" />
      <Stars
        radius={180}
        depth={80}
        factor={5}
        saturation={0}
        fade
        speed={0.45}
      />
      {galaxiesWithPositions.map((galaxy) => {
        const [primaryColor, secondaryColor] = getColorPair(galaxy.colorScheme);
        return (
          <GalaxyPoints
            key={galaxy.id}
            galaxy={galaxy}
            isSelected={galaxy.id === selectedGalaxyId}
            isHovered={hoveredGalaxy === galaxy.id}
            primaryColor={primaryColor}
            secondaryColor={secondaryColor}
            onSelect={() => onSelectGalaxy(galaxy.id)}
            onHover={(value) => setHoveredGalaxy(value ? galaxy.id : null)}
          />
        );
      })}
      <OrbitControls
        ref={controlsRef}
        enablePan={false}
        enableDamping
        dampingFactor={0.06}
        maxDistance={180}
        minDistance={15}
      />
      <EffectComposer enableNormalPass={false}>
        <Bloom
          intensity={1.2}
          kernelSize={KernelSize.HUGE}
          luminanceThreshold={0}
          luminanceSmoothing={0.55}
        />
        <Noise premultiply blendFunction={BlendFunction.SCREEN} opacity={0.04} />
        <Vignette eskil={false} offset={0.22} darkness={0.7} />
      </EffectComposer>
    </>
  );
}

type GalaxyPointsProps = {
  galaxy: GalaxyWithPosition;
  isSelected: boolean;
  isHovered: boolean;
  primaryColor: string;
  secondaryColor: string;
  onSelect: () => void;
  onHover: (hovered: boolean) => void;
};

const createSeededRandom = (seed: number) => {
  let value = seed % 2147483647;
  if (value <= 0) value += 2147483646;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
};

const createStarTexture = () => {
  if (typeof document === 'undefined') return null;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) return null;

  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.85)');
  gradient.addColorStop(0.6, 'rgba(180,200,255,0.45)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');

  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipMapLinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
};

const resolveParticleCount = (type: string) => {
  if (type.includes('Ring')) return 1400;
  if (type.includes('Irregular')) return 1200;
  if (type.includes('Peculiar')) return 1500;
  return 1600;
};

function GalaxyPoints({
  galaxy,
  isSelected,
  isHovered,
  primaryColor,
  secondaryColor,
  onSelect,
  onHover
}: GalaxyPointsProps) {
  const groupRef = useRef<THREE.Group>(null);
  const materialRef = useRef<THREE.PointsMaterial>(null);
  const glowMaterialRef = useRef<GalaxyGlowMaterialInstance | null>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const discMaterialRef = useRef<GalaxyDiscMaterialInstance | null>(null);
  const innerBulgeRef = useRef<THREE.Mesh>(null);
  const seed = useMemo(() => galaxy.index * 123.456 + 42, [galaxy.index]);
  const starTexture = useMemo(() => createStarTexture(), []);
  const isSombrero = galaxy.id === 'sombrero';
  const isRing = galaxy.type.includes('Ring');
  const isIrregular = galaxy.type.includes('Irregular');
  const colorA = useMemo(() => new THREE.Color(primaryColor), [primaryColor]);
  const colorB = useMemo(() => new THREE.Color(secondaryColor), [secondaryColor]);

  useEffect(() => {
    if (groupRef.current) {
      groupRef.current.rotation.set(galaxy.baseTilt.x, galaxy.baseTilt.y, galaxy.baseTilt.z);
    }
  }, [galaxy.baseTilt]);

  const particleData = useMemo(() => {
    const seeded = createSeededRandom(galaxy.index * 97 + 13);
    const count = resolveParticleCount(galaxy.type);
    const radius = Math.cbrt(galaxy.sizeLightYears) * 0.08 + 4.5;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i += 1) {
      let x = 0;
      let y = 0;
      let z = 0;

      const variation = () => (seeded() - 0.5) * radius * 0.22;
      const baseRadius = radius * (0.4 + seeded() * 0.8);

      switch (true) {
        case galaxy.type.includes('Ring'):
          {
            const angle = seeded() * Math.PI * 2;
            x = Math.cos(angle) * baseRadius;
            z = Math.sin(angle) * baseRadius;
            y = variation() * 0.3;
          }
          break;
        case galaxy.type.includes('Irregular'):
          x = (seeded() - 0.5) * radius * 1.6;
          y = (seeded() - 0.5) * radius * 0.9;
          z = (seeded() - 0.5) * radius * 1.6;
          break;
        case galaxy.type.includes('Peculiar'):
          {
            const angle = seeded() * Math.PI * 2;
            const spiralRadius = baseRadius * (0.6 + seeded() * 0.4);
            x = Math.cos(angle) * spiralRadius;
            y = variation();
            z = Math.sin(angle) * spiralRadius;
            if (seeded() > 0.7) {
              y += (seeded() - 0.5) * radius * 0.6;
            }
          }
          break;
        default:
          {
            const armCount = galaxy.type.includes('Grand-Design') ? 4 : 3;
            const starsPerArm = Math.floor(count / armCount);
            const armIndex = i % armCount;
            const armProgress = (i % starsPerArm) / starsPerArm;
            const spiralT = Math.pow(armProgress, 0.82) + seeded() * 0.04;
            const twist = galaxy.type.includes('Grand-Design') ? 5.4 : 4.2;
            const theta = armIndex * ((Math.PI * 2) / armCount) + spiralT * twist;
            const spiralRadius = radius * (0.12 + spiralT * 0.88) * (0.92 + seeded() * 0.08);
            const perpendicular = theta + Math.PI / 2;
            const armSpread = radius * 0.12 * (1 - spiralT) + radius * 0.04;
            const offset = (seeded() - 0.5) * armSpread;
            x = Math.cos(theta) * spiralRadius + Math.cos(perpendicular) * offset;
            z = Math.sin(theta) * spiralRadius + Math.sin(perpendicular) * offset;
            const verticalThickness = radius * 0.04 + (1 - spiralT) * radius * 0.08;
            y = (seeded() - 0.5) * verticalThickness;
            if (spiralRadius < radius * 0.32) {
              y += (0.32 - spiralRadius / radius) * radius * 0.08 * (seeded() - 0.5);
            }
          }
      }

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      const radialMix = Math.min(1, Math.sqrt(x * x + z * z) / (radius * 1.05));
      const bulgeBias = Math.max(0, 1 - radialMix * 1.2);
      const armHighlight = Math.max(0, Math.sin((Math.atan2(z, x) + radialMix * Math.PI) * (galaxy.type.includes('Grand-Design') ? 2.4 : 1.8)));
      const colorBlend = THREE.MathUtils.clamp(radialMix * 0.75 + armHighlight * 0.18 - bulgeBias * 0.25, 0, 1);
      const starColor = colorA.clone().lerp(colorB, colorBlend);
      if (bulgeBias > 0.2) {
        starColor.lerp(new THREE.Color('#ffd6a5'), THREE.MathUtils.clamp(bulgeBias * 0.8, 0, 1));
      }

      colors[i * 3] = starColor.r;
      colors[i * 3 + 1] = starColor.g;
      colors[i * 3 + 2] = starColor.b;
    }

    return { positions, colors, radius, count };
  }, [colorA, colorB, galaxy]);

  const dustData = useMemo(() => {
    const seeded = createSeededRandom(galaxy.index * 131 + 17);
    const dustCount = Math.min(650, Math.floor(resolveParticleCount(galaxy.type) * 0.35));
    const positions = new Float32Array(dustCount * 3);
    const colors = new Float32Array(dustCount * 3);
    const baseRadius = particleData.radius * 1.05;
    const tailColor = colorB.clone();

    for (let i = 0; i < dustCount; i += 1) {
      const angle = seeded() * Math.PI * 2;
      const swirl = seeded() * 0.9 + 0.4;
      const radius = baseRadius * (0.75 + swirl * 0.65);
      const height = (seeded() - 0.5) * baseRadius * 0.18;
      const offset = (seeded() - 0.5) * 0.6;

      positions[i * 3] = Math.cos(angle) * radius * (0.9 + offset * 0.18);
      positions[i * 3 + 1] = height;
      positions[i * 3 + 2] = Math.sin(angle) * radius * (0.9 - offset * 0.14);

      const dimFactor = 0.35 + seeded() * 0.45;
      colors[i * 3] = tailColor.r * dimFactor;
      colors[i * 3 + 1] = tailColor.g * dimFactor;
      colors[i * 3 + 2] = tailColor.b * dimFactor;
    }

    return { positions, colors, count: dustCount };
  }, [colorB, galaxy, particleData.radius]);

  useFrame((state, delta) => {
    if (!groupRef.current || !materialRef.current) return;

    const time = state.clock.getElapsedTime();
    groupRef.current.rotation.order = 'YXZ';
    groupRef.current.rotation.y += galaxy.rotationSpeed * delta;
    groupRef.current.rotation.x = THREE.MathUtils.lerp(
      groupRef.current.rotation.x,
      galaxy.baseTilt.x,
      0.08
    );
    groupRef.current.rotation.z = THREE.MathUtils.lerp(
      groupRef.current.rotation.z,
      galaxy.baseTilt.z,
      0.08
    );
    const twinkle = 0.12 * Math.sin(time * 2.2 + seed);
    materialRef.current.size = THREE.MathUtils.lerp(0.3, 0.55, (Math.sin(time * 1.5 + seed) + 1) / 2);
    materialRef.current.opacity = 0.8 + twinkle;

    const targetScale = isSelected ? 1.18 : isHovered ? 1.08 : 1;
    const currentScale = groupRef.current.scale.x;
    const lerpedScale = THREE.MathUtils.lerp(currentScale, targetScale, 0.08);
    groupRef.current.scale.setScalar(lerpedScale);

    if (ringRef.current) {
      ringRef.current.rotation.z += delta * 0.18;
      const emissive = isSelected ? 0.35 : isHovered ? 0.24 : 0.18;
      (ringRef.current.material as THREE.MeshBasicMaterial).opacity = THREE.MathUtils.lerp(
        (ringRef.current.material as THREE.MeshBasicMaterial).opacity,
        emissive,
        0.08
      );
    }

    if (glowMaterialRef.current) {
      const uniforms = glowMaterialRef.current.uniforms as { uStrength: { value: number } };
      const targetGlow = isSelected ? 1.45 : isHovered ? 1.05 : 0.72;
      uniforms.uStrength.value = THREE.MathUtils.lerp(uniforms.uStrength.value, targetGlow, 0.08);
    }

    if (discMaterialRef.current) {
      const uniforms = discMaterialRef.current.uniforms as {
        uTime: { value: number };
        uIntensity: { value: number };
      };
      uniforms.uTime.value += delta;
      const targetIntensity = isSelected ? 1.4 : isHovered ? 1.05 : 0.8;
      uniforms.uIntensity.value = THREE.MathUtils.lerp(uniforms.uIntensity.value, targetIntensity, 0.1);
    }

    if (innerBulgeRef.current) {
      const bulgeMaterial = innerBulgeRef.current.material as THREE.MeshStandardMaterial;
      const target = isSelected ? 1.1 : isHovered ? 0.9 : 0.65;
      bulgeMaterial.emissiveIntensity = THREE.MathUtils.lerp(bulgeMaterial.emissiveIntensity, target, 0.12);
    }
  });

  return (
    <group
      ref={groupRef}
      position={galaxy.position}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      onPointerOver={(event) => {
        event.stopPropagation();
        onHover(true);
      }}
      onPointerOut={() => onHover(false)}
    >
      <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={6} frustumCulled={false}>
        <circleGeometry args={[particleData.radius * 2.15, 96]} />
        <galaxyGlowMaterial
          ref={(material) => {
            glowMaterialRef.current = material as GalaxyGlowMaterialInstance | null;
          }}
          uColor={colorB}
          uStrength={0.8}
          transparent
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[particleData.radius * 2.05, 96]} />
        <galaxyDiscMaterial
          ref={(material) => {
            discMaterialRef.current = material as GalaxyDiscMaterialInstance | null;
          }}
          uColorA={colorA}
          uColorB={colorB}
          transparent
          depthWrite={false}
        />
      </mesh>
      <mesh ref={innerBulgeRef} position={[0, particleData.radius * 0.05, 0]}>
        <sphereGeometry args={[particleData.radius * (isSombrero ? 0.26 : 0.2), 32, 32]} />
        <meshStandardMaterial
          emissive={new THREE.Color('#ffd9b5')}
          emissiveIntensity={0.7}
          color={new THREE.Color('#f2e7da')}
          roughness={0.4}
          metalness={0}
          transparent
          opacity={0.92}
        />
      </mesh>
      <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[particleData.radius * 0.48, particleData.radius * 1.32, 64, 4]} />
        <meshBasicMaterial
          color={primaryColor}
          transparent
          opacity={0.2}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      {isSombrero && (
        <group rotation={[THREE.MathUtils.degToRad(88), 0, 0]}>
          <mesh>
            <planeGeometry args={[particleData.radius * 1.6, particleData.radius * 0.32]} />
            <meshStandardMaterial color="#0d0c11" opacity={0.7} transparent roughness={0.9} />
          </mesh>
          <mesh>
            <planeGeometry args={[particleData.radius * 2.1, particleData.radius * 0.15]} />
            <meshStandardMaterial color="#201c2a" opacity={0.85} transparent />
          </mesh>
        </group>
      )}
      <points rotation={[0, 0, 0]}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={dustData.count} array={dustData.positions} itemSize={3} />
          <bufferAttribute attach="attributes-color" count={dustData.count} array={dustData.colors} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial
          vertexColors
          size={0.38}
          sizeAttenuation
          transparent
          opacity={0.36}
          depthWrite={false}
          depthTest={true}
          blending={THREE.AdditiveBlending}
          map={starTexture ?? undefined}
          alphaTest={0.02}
        />
      </points>
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={particleData.count} array={particleData.positions} itemSize={3} />
          <bufferAttribute attach="attributes-color" count={particleData.count} array={particleData.colors} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial
          ref={materialRef}
          vertexColors
          size={0.45}
          sizeAttenuation
          transparent
          opacity={0.85}
          depthWrite={false}
          depthTest={true}
          blending={THREE.AdditiveBlending}
          map={starTexture ?? undefined}
          alphaTest={0.05}
        />
      </points>
      <Sparkles
        count={Math.floor(particleData.count * 0.12)}
        color={secondaryColor}
        scale={particleData.radius * 1.2}
        size={isSelected ? 3 : 2.2}
        speed={0.35}
        opacity={0.18}
      />
      {isSelected && (
        <mesh>
          <sphereGeometry args={[particleData.radius * 0.18, 16, 16]} />
          <meshBasicMaterial
            color={secondaryColor}
            transparent
            opacity={0.18}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      )}
      {!isRing && !isIrregular && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={-1}>
          <ringGeometry args={[particleData.radius * 1.4, particleData.radius * 2.4, 64]} />
          <meshBasicMaterial
            color={secondaryColor}
            transparent
            opacity={0.08}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  );
}
