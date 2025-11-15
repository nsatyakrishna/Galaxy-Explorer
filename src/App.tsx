import { Suspense, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Loader } from '@react-three/drei';
import galaxies from './data/galaxies';
import { GalaxyScene } from './components/GalaxyScene';
import { GalaxySidebar } from './components/GalaxySidebar';
import './styles/app.css';

export type Galaxy = typeof galaxies[number];

function App() {
  const orderedGalaxies = useMemo(() => galaxies, []);
  const [selectedGalaxyId, setSelectedGalaxyId] = useState(orderedGalaxies[0].id);

  const selectedGalaxy = orderedGalaxies.find((galaxy) => galaxy.id === selectedGalaxyId) ?? orderedGalaxies[0];

  const selectByStep = (direction: 1 | -1) => {
    const currentIndex = orderedGalaxies.findIndex((galaxy) => galaxy.id === selectedGalaxyId);
    const nextIndex = (currentIndex + direction + orderedGalaxies.length) % orderedGalaxies.length;
    setSelectedGalaxyId(orderedGalaxies[nextIndex].id);
  };

  return (
    <div className="app">
      <div className="scene-container">
        <Suspense fallback={null}>
          <Canvas camera={{ position: [0, 30, 80], fov: 50 }}>
            <color attach="background" args={["#050510"]} />
            <GalaxyScene
              galaxies={orderedGalaxies}
              selectedGalaxyId={selectedGalaxy.id}
              onSelectGalaxy={setSelectedGalaxyId}
            />
          </Canvas>
        </Suspense>
        <Loader />
      </div>
      <GalaxySidebar
        galaxies={orderedGalaxies}
        selectedGalaxyId={selectedGalaxy.id}
        onSelectGalaxy={setSelectedGalaxyId}
        onNext={() => selectByStep(1)}
        onPrev={() => selectByStep(-1)}
      />
    </div>
  );
}

export default App;
