import { GalaxyData } from '../data/galaxies';
import '../styles/sidebar.css';

type GalaxySidebarProps = {
  galaxies: GalaxyData[];
  selectedGalaxyId: string;
  onSelectGalaxy: (galaxyId: string) => void;
  onNext: () => void;
  onPrev: () => void;
};

const formatNumber = (value: number) => {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)} M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)} K`;
  }
  return value.toString();
};

export function GalaxySidebar({ galaxies, selectedGalaxyId, onSelectGalaxy, onNext, onPrev }: GalaxySidebarProps) {
  const selectedGalaxy = galaxies.find((galaxy) => galaxy.id === selectedGalaxyId) ?? galaxies[0];

  return (
    <aside className="sidebar">
      <header className="sidebar__header">
        <h1>Galaxy Explorer</h1>
        <p>Browse iconic deep-space wonders and learn their stories.</p>
      </header>

      <nav className="sidebar__navigation">
        <button type="button" onClick={onPrev} className="sidebar__nav-btn" aria-label="Previous galaxy">
          ◀
        </button>
        <button type="button" onClick={onNext} className="sidebar__nav-btn" aria-label="Next galaxy">
          ▶
        </button>
      </nav>

      <section className="sidebar__list" aria-label="Galaxies">
        {galaxies.map((galaxy) => {
          const [primaryColor] = galaxy.colorScheme.split(',');
          const isSelected = galaxy.id === selectedGalaxyId;
          return (
            <button
              key={galaxy.id}
              type="button"
              onClick={() => onSelectGalaxy(galaxy.id)}
              className={`sidebar__list-item ${isSelected ? 'is-selected' : ''}`}
              style={{ borderColor: isSelected ? primaryColor : 'transparent' }}
            >
              <span className="sidebar__list-name">{galaxy.name}</span>
              <span className="sidebar__list-type">{galaxy.type}</span>
            </button>
          );
        })}
      </section>

      <section className="sidebar__details" aria-live="polite">
        <h2>{selectedGalaxy.name}</h2>
        <span className="sidebar__details-type">{selectedGalaxy.type}</span>

        <dl className="sidebar__stats">
          <div>
            <dt>Distance</dt>
            <dd>{formatNumber(selectedGalaxy.distanceLightYears)} light-years</dd>
          </div>
          <div>
            <dt>Diameter</dt>
            <dd>{formatNumber(selectedGalaxy.sizeLightYears)} light-years</dd>
          </div>
        </dl>

        <p className="sidebar__description">{selectedGalaxy.description}</p>
      </section>
    </aside>
  );
}
