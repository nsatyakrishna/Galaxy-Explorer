export type GalaxyData = {
  id: string;
  name: string;
  type: string;
  distanceLightYears: number;
  sizeLightYears: number;
  description: string;
  colorScheme: string;
};

const galaxies: GalaxyData[] = [
  {
    id: 'andromeda',
    name: 'Andromeda',
    type: 'Spiral Galaxy',
    distanceLightYears: 2537000,
    sizeLightYears: 220000,
    description:
      'The closest spiral galaxy to the Milky Way, Andromeda is on a slow-motion collision course with us and contains an estimated one trillion stars.',
    colorScheme: '#6dd5ed,#2193b0'
  },
  {
    id: 'sombrero',
    name: 'Sombrero Galaxy',
    type: 'Unbarred Spiral Galaxy',
    distanceLightYears: 32000000,
    sizeLightYears: 50000,
    description:
      'Named for its resemblance to a wide-brimmed hat, the Sombrero Galaxy features a bright nucleus and a prominent dust lane outlining its spiral structure.',
    colorScheme: '#fceabb,#f8b500'
  },
  {
    id: 'triangulum',
    name: 'Triangulum Galaxy',
    type: 'Spiral Galaxy',
    distanceLightYears: 3000000,
    sizeLightYears: 60000,
    description:
      'A graceful spiral with loosely wound arms, Triangulum is a vigorous star-forming galaxy within our Local Group.',
    colorScheme: '#a18cd1,#fbc2eb'
  },
  {
    id: 'centaurus-a',
    name: 'Centaurus A',
    type: 'Peculiar Galaxy',
    distanceLightYears: 12000000,
    sizeLightYears: 60000,
    description:
      'A dramatic merger remnant with a supermassive black hole launching immense radio jets, Centaurus A glows with turbulent energy.',
    colorScheme: '#ff9a9e,#fad0c4'
  },
  {
    id: 'whirlpool',
    name: 'Whirlpool Galaxy',
    type: 'Grand-Design Spiral Galaxy',
    distanceLightYears: 23000000,
    sizeLightYears: 76000,
    description:
      'Famous for its sweeping spiral arms and interaction with a companion galaxy, the Whirlpool showcases textbook spiral structure.',
    colorScheme: '#00c6ff,#0072ff'
  },
  {
    id: 'cartwheel',
    name: 'Cartwheel Galaxy',
    type: 'Ring Galaxy',
    distanceLightYears: 500000000,
    sizeLightYears: 150000,
    description:
      'The Cartwheel was likely shaped by a dramatic collision that sent ripples through its disk, igniting a wave of star formation in a bright outer ring.',
    colorScheme: '#fc5c7d,#6a82fb'
  },
  {
    id: 'large-magellanic-cloud',
    name: 'Large Magellanic Cloud',
    type: 'Irregular Galaxy',
    distanceLightYears: 163000,
    sizeLightYears: 14000,
    description:
      'A satellite of the Milky Way, the Large Magellanic Cloud is rich with nebulae and star-forming regions like the Tarantula Nebula.',
    colorScheme: '#43cea2,#185a9d'
  }
];

export default galaxies;
