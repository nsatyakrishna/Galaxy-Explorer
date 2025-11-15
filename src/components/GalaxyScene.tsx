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

const GalaxyHaloMaterial = shaderMaterial(
  {
    uColor: new THREE.Color('#ffffff'),
    uOpacity: 0.6,
    uVerticalFalloff: 0.6
  },
  /* glsl */ `
  varying vec3 vPosition;
  void main() {
    vPosition = position;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`,
  /* glsl */ `
  varying vec3 vPosition;
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uVerticalFalloff;

  void main() {
    float radial = length(vPosition.xz);
    float fade = smoothstep(1.2, 0.0, radial);
    float vertical = smoothstep(uVerticalFalloff, 0.0, abs(vPosition.y));
    float alpha = clamp(fade * vertical * uOpacity, 0.0, 1.0);
    vec3 color = uColor * (0.45 + fade * 0.75);
    gl_FragColor = vec4(color, alpha);
  }
`,
);

extend({ GalaxyHaloMaterial });

type GalaxyHaloMaterialInstance = THREE.ShaderMaterial & {
  uniforms: {
    uColor: { value: THREE.Color };
    uOpacity: { value: number };
    uVerticalFalloff: { value: number };
  };
};

declare global {
  namespace JSX {
    interface IntrinsicElements {
      galaxyGlowMaterial: ReactThreeFiber.Object3DNode<GalaxyGlowMaterialInstance, typeof GalaxyGlowMaterial> & {
        uColor?: THREE.ColorRepresentation;
        uStrength?: number;
      };
      galaxyHaloMaterial: ReactThreeFiber.Object3DNode<GalaxyHaloMaterialInstance, typeof GalaxyHaloMaterial> & {
        uColor?: THREE.ColorRepresentation;
        uOpacity?: number;
        uVerticalFalloff?: number;
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
  const haloMaterialRef = useRef<GalaxyHaloMaterialInstance | null>(null);
  const outerHaloMaterialRef = useRef<GalaxyHaloMaterialInstance | null>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const innerBulgeRef = useRef<THREE.Mesh>(null);
  const bulgeMaterialRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const bulgePointsMaterialRef = useRef<THREE.PointsMaterial>(null);
  const seed = useMemo(() => galaxy.index * 123.456 + 42, [galaxy.index]);
  const starTexture = useMemo(() => createStarTexture(), []);
  const isSombrero = galaxy.id === 'sombrero';
  const isRing = galaxy.type.includes('Ring');
  const isIrregular = galaxy.type.includes('Irregular');
  const colorA = useMemo(() => new THREE.Color(primaryColor), [primaryColor]);
  const colorB = useMemo(() => new THREE.Color(secondaryColor), [secondaryColor]);
  const haloColor = useMemo(() => colorB.clone().lerp(colorA, 0.25), [colorA, colorB]);
  const outerHaloColor = useMemo(
    () => colorB.clone().lerp(new THREE.Color('#9fb3ff'), 0.5),
    [colorB]
  );

  useEffect(() => {
    if (groupRef.current) {
      groupRef.current.rotation.set(galaxy.baseTilt.x, galaxy.baseTilt.y, galaxy.baseTilt.z);
    }
  }, [galaxy.baseTilt]);

  const particleData = useMemo(() => {
    const seeded = createSeededRandom(galaxy.index * 97 + 13);
    const count = resolveParticleCount(galaxy.type);
    const radius = Math.cbrt(galaxy.sizeLightYears) * 0.085 + 4.6;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i += 1) {
      let x = 0;
      let y = 0;
      let z = 0;
      let inArmDensity = 0.1;

      switch (true) {
        case galaxy.type.includes('Ring'):
          {
            const angle = seeded() * Math.PI * 2;
            const radial = radius * (0.8 + seeded() * 0.4);
            x = Math.cos(angle) * radial;
            z = Math.sin(angle) * radial;
            y = (seeded() - 0.5) * radius * 0.14;
            inArmDensity = 0.45;
          }
          break;
        case galaxy.type.includes('Irregular'):
          x = (seeded() - 0.5) * radius * 1.6;
          y = (seeded() - 0.5) * radius * 0.9;
          z = (seeded() - 0.5) * radius * 1.6;
          inArmDensity = 0.2 + seeded() * 0.25;
          break;
        case galaxy.type.includes('Peculiar'):
          {
            const angle = seeded() * Math.PI * 2;
            const spiralRadius = radius * (0.35 + Math.pow(seeded(), 0.8) * 1.2);
            const warp = (seeded() - 0.5) * 0.5;
            x = Math.cos(angle + warp * 0.4) * spiralRadius;
            z = Math.sin(angle + warp * 0.4) * spiralRadius;
            y = (seeded() - 0.5) * radius * 0.32 + warp * radius * 0.25;
            inArmDensity = 0.35 + seeded() * 0.35;
          }
          break;
        case galaxy.type.includes('Elliptical'):
          {
            const radial = Math.pow(seeded(), 0.7) * radius * 0.9;
            const theta = seeded() * Math.PI * 2;
            const phi = Math.acos(1 - 2 * seeded());
            const sinPhi = Math.sin(phi);
            x = radial * sinPhi * Math.cos(theta);
            y = radial * Math.cos(phi) * 0.6;
            z = radial * sinPhi * Math.sin(theta);
            inArmDensity = 0.25 + seeded() * 0.2;
          }
          break;
        default:
          {
            const armCount = galaxy.type.includes('Grand-Design') ? 2 : 3;
            const t = Math.pow(seeded(), 0.72);
            const radial = radius * (0.16 + t * 0.9);
            const twist = galaxy.type.includes('Grand-Design') ? 5.8 : 4.6;
            const baseAngle = Math.floor(seeded() * armCount) * ((Math.PI * 2) / armCount);
            const theta = baseAngle + t * twist + (seeded() - 0.5) * 0.22;
            const width = radius * (0.02 + (1 - t) * 0.12);
            const offset = (seeded() - 0.5) * width;
            const perpendicular = theta + Math.PI / 2;
            x = Math.cos(theta) * radial + Math.cos(perpendicular) * offset;
            z = Math.sin(theta) * radial + Math.sin(perpendicular) * offset;
            const verticalThickness = radius * (0.02 + (1 - t) * 0.08);
            y = (seeded() - 0.5) * verticalThickness;
            inArmDensity = Math.exp(-(Math.abs(offset) / (width * 0.85)));

            if (seeded() < 0.18) {
              const gapTheta = theta + Math.PI / armCount + (seeded() - 0.5) * 0.28;
              const gapRadius = radial * (0.85 + seeded() * 0.25);
              x = Math.cos(gapTheta) * gapRadius;
              z = Math.sin(gapTheta) * gapRadius;
              y *= 0.35;
              inArmDensity *= 0.4;
            }
          }
      }

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      const planarRadius = Math.sqrt(x * x + z * z);
      const radialMix = Math.min(1, planarRadius / (radius * 1.05));
      const bulgeWeight = Math.pow(Math.max(0, 1 - radialMix), 1.5);
      const starColor = colorA
        .clone()
        .lerp(colorB, radialMix * 0.85 + inArmDensity * 0.1)
        .lerp(new THREE.Color('#ffe2c0'), bulgeWeight * 0.85);

      if (inArmDensity > 0.55) {
        starColor.lerp(new THREE.Color('#a9d8ff'), 0.5 * (inArmDensity - 0.4));
      }

      const brightness = THREE.MathUtils.clamp(0.6 + inArmDensity * 0.6 + bulgeWeight * 0.5, 0.45, 1.55);
      starColor.multiplyScalar(brightness);

      colors[i * 3] = starColor.r;
      colors[i * 3 + 1] = starColor.g;
      colors[i * 3 + 2] = starColor.b;
    }

    return { positions, colors, radius, count };
  }, [colorA, colorB, galaxy]);

  const bulgeData = useMemo(() => {
    const seeded = createSeededRandom(galaxy.index * 211 + 5);
    const count = Math.max(240, Math.floor(resolveParticleCount(galaxy.type) * 0.14));
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const radius = Math.cbrt(galaxy.sizeLightYears) * 0.085 + 4.6;

    for (let i = 0; i < count; i += 1) {
      const r = Math.pow(seeded(), 0.55) * radius * (isSombrero ? 0.42 : 0.32);
      const theta = seeded() * Math.PI * 2;
      const phi = Math.acos(1 - 2 * seeded());
      const sinPhi = Math.sin(phi);
      const cosPhi = Math.cos(phi);
      const x = r * sinPhi * Math.cos(theta);
      const y = r * cosPhi * (isSombrero ? 1.9 : 1.4);
      const z = r * sinPhi * Math.sin(theta);

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      const bulgeColor = new THREE.Color('#ffe8c4').lerp(new THREE.Color('#fff7df'), seeded() * 0.35);
      const highlight = THREE.MathUtils.clamp(1 - r / (radius * 0.42), 0, 1);
      bulgeColor.multiplyScalar(0.8 + highlight * 0.7);

      colors[i * 3] = bulgeColor.r;
      colors[i * 3 + 1] = bulgeColor.g;
      colors[i * 3 + 2] = bulgeColor.b;
    }

    return { positions, colors, count };
  }, [galaxy, isSombrero]);

  const dustData = useMemo(() => {
    const seeded = createSeededRandom(galaxy.index * 131 + 17);
    const dustCount = Math.min(900, Math.floor(resolveParticleCount(galaxy.type) * 0.32));
    const positions = new Float32Array(dustCount * 3);
    const colors = new Float32Array(dustCount * 3);
    const baseRadius = particleData.radius * (isSombrero ? 1.45 : 1.18);
    const tailColor = colorB.clone();

    for (let i = 0; i < dustCount; i += 1) {
      const angle = seeded() * Math.PI * 2;
      const swirl = Math.pow(seeded(), 0.6);
      const radius = baseRadius * (0.6 + swirl * 0.9);
      const height = (seeded() - 0.5) * baseRadius * (isSombrero ? 0.12 : 0.2);
      const asymmetry = (seeded() - 0.5) * 0.4;

      positions[i * 3] = Math.cos(angle) * radius * (1 + asymmetry * 0.12);
      positions[i * 3 + 1] = height + asymmetry * baseRadius * 0.04;
      positions[i * 3 + 2] = Math.sin(angle) * radius * (1 - asymmetry * 0.08);

      const dimFactor = 0.25 + swirl * 0.4;
      colors[i * 3] = tailColor.r * dimFactor;
      colors[i * 3 + 1] = tailColor.g * dimFactor;
      colors[i * 3 + 2] = tailColor.b * (0.8 + swirl * 0.2);
    }

    return { positions, colors, count: dustCount };
  }, [colorB, galaxy, isSombrero, particleData.radius]);

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
    const twinkle = 0.14 * Math.sin(time * 1.8 + seed);
    materialRef.current.size = THREE.MathUtils.lerp(0.28, 0.58, (Math.sin(time * 1.4 + seed) + 1) / 2);
    materialRef.current.opacity = 0.78 + twinkle;

    const targetScale = isSelected ? 1.16 : isHovered ? 1.07 : 1;
    const currentScale = groupRef.current.scale.x;
    const lerpedScale = THREE.MathUtils.lerp(currentScale, targetScale, 0.08);
    groupRef.current.scale.setScalar(lerpedScale);

    if (ringRef.current) {
      ringRef.current.rotation.z += delta * 0.16;
      const emissive = isSelected ? 0.32 : isHovered ? 0.22 : 0.16;
      (ringRef.current.material as THREE.MeshBasicMaterial).opacity = THREE.MathUtils.lerp(
        (ringRef.current.material as THREE.MeshBasicMaterial).opacity,
        emissive,
        0.08
      );
    }

    if (glowMaterialRef.current) {
      const uniforms = glowMaterialRef.current.uniforms as { uStrength: { value: number } };
      const targetGlow = isSelected ? 1.5 : isHovered ? 1.08 : 0.75;
      uniforms.uStrength.value = THREE.MathUtils.lerp(uniforms.uStrength.value, targetGlow, 0.08);
    }

    if (haloMaterialRef.current) {
      const uniforms = haloMaterialRef.current.uniforms as {
        uOpacity: { value: number };
      };
      const targetOpacity = isSelected ? 1.35 : isHovered ? 0.95 : 0.72;
      uniforms.uOpacity.value = THREE.MathUtils.lerp(uniforms.uOpacity.value, targetOpacity, 0.08);
    }

    if (outerHaloMaterialRef.current) {
      const uniforms = outerHaloMaterialRef.current.uniforms as {
        uOpacity: { value: number };
      };
      const targetOpacity = isSelected ? 0.5 : isHovered ? 0.34 : 0.24;
      uniforms.uOpacity.value = THREE.MathUtils.lerp(uniforms.uOpacity.value, targetOpacity, 0.05);
    }

    if (bulgeMaterialRef.current) {
      const target = isSelected ? 1.22 : isHovered ? 0.98 : 0.68;
      bulgeMaterialRef.current.emissiveIntensity = THREE.MathUtils.lerp(
        bulgeMaterialRef.current.emissiveIntensity,
        target,
        0.12
      );
    }

    if (bulgePointsMaterialRef.current) {
      const targetSize = isSelected ? 1.3 : isHovered ? 1.05 : 0.85;
      bulgePointsMaterialRef.current.size = THREE.MathUtils.lerp(
        bulgePointsMaterialRef.current.size,
        targetSize,
        0.1
      );
      bulgePointsMaterialRef.current.opacity = THREE.MathUtils.lerp(
        bulgePointsMaterialRef.current.opacity,
        isSelected ? 1 : 0.82,
        0.1
      );
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
        <circleGeometry args={[particleData.radius * 1.9, 96]} />
        <galaxyGlowMaterial
          ref={(material) => {
            glowMaterialRef.current = material as GalaxyGlowMaterialInstance | null;
          }}
          uColor={colorB}
          uStrength={0.85}
          transparent
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <mesh
        scale={[
          particleData.radius * 2.25,
          particleData.radius * (isSombrero ? 0.26 : 0.34),
          particleData.radius * 2.25
        ]}
        renderOrder={-2}
        frustumCulled={false}
      >
        <sphereGeometry args={[1, 64, 64]} />
        <galaxyHaloMaterial
          ref={(material) => {
            haloMaterialRef.current = material as GalaxyHaloMaterialInstance | null;
          }}
          uColor={haloColor}
          uOpacity={0.8}
          uVerticalFalloff={isSombrero ? 0.18 : 0.45}
          transparent
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <mesh
        scale={[
          particleData.radius * 3.4,
          particleData.radius * (isSombrero ? 0.52 : 0.68),
          particleData.radius * 3.4
        ]}
        renderOrder={-3}
        frustumCulled={false}
      >
        <sphereGeometry args={[1, 48, 48]} />
        <galaxyHaloMaterial
          ref={(material) => {
            outerHaloMaterialRef.current = material as GalaxyHaloMaterialInstance | null;
          }}
          uColor={outerHaloColor}
          uOpacity={0.24}
          uVerticalFalloff={isSombrero ? 0.32 : 0.66}
          transparent
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <mesh ref={innerBulgeRef} position={[0, particleData.radius * 0.04, 0]}>
        <sphereGeometry args={[particleData.radius * (isSombrero ? 0.3 : 0.22), 40, 40]} />
        <meshStandardMaterial
          ref={(material) => {
            bulgeMaterialRef.current = material;
          }}
          emissive={new THREE.Color('#ffd9b5')}
          emissiveIntensity={0.7}
          color={new THREE.Color('#f6ead6')}
          roughness={0.35}
          metalness={0.1}
          transparent
          opacity={0.95}
        />
      </mesh>
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={bulgeData.count} array={bulgeData.positions} itemSize={3} />
          <bufferAttribute attach="attributes-color" count={bulgeData.count} array={bulgeData.colors} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial
          ref={bulgePointsMaterialRef}
          vertexColors
          size={0.95}
          sizeAttenuation
          transparent
          opacity={0.86}
          depthWrite={false}
          depthTest={true}
          blending={THREE.AdditiveBlending}
          map={starTexture ?? undefined}
          alphaTest={0.08}
        />
      </points>
      <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[particleData.radius * 0.42, particleData.radius * 1.28, 72, 6]} />
        <meshBasicMaterial
          color={primaryColor}
          transparent
          opacity={0.18}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      {isSombrero && (
        <group rotation={[THREE.MathUtils.degToRad(88), 0, 0]}>
          <mesh>
            <planeGeometry args={[particleData.radius * 1.65, particleData.radius * 0.34]} />
            <meshStandardMaterial color="#0d0c11" opacity={0.74} transparent roughness={0.95} />
          </mesh>
          <mesh>
            <planeGeometry args={[particleData.radius * 2.2, particleData.radius * 0.16]} />
            <meshStandardMaterial color="#1f1b27" opacity={0.88} transparent />
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
          size={0.34}
          sizeAttenuation
          transparent
          opacity={0.32}
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
          size={0.48}
          sizeAttenuation
          transparent
          opacity={0.88}
          depthWrite={false}
          depthTest={true}
          blending={THREE.AdditiveBlending}
          map={starTexture ?? undefined}
          alphaTest={0.05}
        />
      </points>
      <Sparkles
        count={Math.floor(particleData.count * 0.08)}
        color={secondaryColor}
        scale={particleData.radius * 1.25}
        size={isSelected ? 2.7 : 2}
        speed={0.32}
        opacity={0.16}
      />
      {isSelected && (
        <mesh>
          <sphereGeometry args={[particleData.radius * 0.2, 20, 20]} />
          <meshBasicMaterial
            color={secondaryColor}
            transparent
            opacity={0.2}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      )}
      {!isRing && !isIrregular && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={-1}>
          <ringGeometry args={[particleData.radius * 1.55, particleData.radius * 2.6, 64]} />
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
