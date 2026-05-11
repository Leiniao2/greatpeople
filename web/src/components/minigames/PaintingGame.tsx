import { useState } from 'react'

interface Region {
  id: string
  label: string
  targetColor: string
  // SVG path or shape descriptor
  svgShape: string
}

interface PaintingConfig {
  title: string
  instruction: string
  viewBox: string
  regions: Region[]
  palette: { color: string; name: string }[]
}

const CONFIGS: Record<string, PaintingConfig> = {
  'egyptian-sunset': {
    title: 'Desert at Dusk',
    instruction: 'Paint the Egyptian sunset scene with the correct colors.',
    viewBox: '0 0 280 200',
    regions: [
      { id: 'sky',     label: 'Sky',          targetColor: '#7c3aed', svgShape: '<rect x="0" y="0" width="280" height="100" rx="0"/>' },
      { id: 'sun',     label: 'Setting Sun',  targetColor: '#f59e0b', svgShape: '<circle cx="140" cy="90" r="30"/>' },
      { id: 'pyramid', label: 'Pyramid',       targetColor: '#92400e', svgShape: '<polygon points="140,30 60,160 220,160"/>' },
      { id: 'desert',  label: 'Desert Sand',  targetColor: '#d97706', svgShape: '<rect x="0" y="160" width="280" height="40" rx="0"/>' },
    ],
    palette: [
      { color: '#7c3aed', name: 'Violet' },
      { color: '#f59e0b', name: 'Amber' },
      { color: '#92400e', name: 'Brown' },
      { color: '#d97706', name: 'Sand' },
    ],
  },
  'ocean-voyage': {
    title: 'Ocean Voyage',
    instruction: "Color the ocean scene from Magellan's voyage around the world.",
    viewBox: '0 0 280 200',
    regions: [
      { id: 'sky',  label: 'Sky',     targetColor: '#0ea5e9', svgShape: '<rect x="0" y="0" width="280" height="100"/>' },
      { id: 'sea',  label: 'Sea',     targetColor: '#1e40af', svgShape: '<rect x="0" y="100" width="280" height="100"/>' },
      { id: 'sail', label: 'Sail',    targetColor: '#f8fafc', svgShape: '<polygon points="140,20 115,110 165,110"/>' },
      { id: 'hull', label: 'Hull',    targetColor: '#92400e', svgShape: '<rect x="105" y="110" width="70" height="20" rx="4"/>' },
    ],
    palette: [
      { color: '#0ea5e9', name: 'Sky Blue' },
      { color: '#1e40af', name: 'Deep Blue' },
      { color: '#f8fafc', name: 'White' },
      { color: '#92400e', name: 'Brown' },
    ],
  },
  'spring-garden': {
    title: 'Botanical Garden',
    instruction: "Paint Linnaeus's Uppsala botanical garden with natural colors.",
    viewBox: '0 0 280 200',
    regions: [
      { id: 'sky',    label: 'Sky',           targetColor: '#7dd3fc', svgShape: '<rect x="0" y="0" width="280" height="100"/>' },
      { id: 'grass',  label: 'Grass',         targetColor: '#16a34a', svgShape: '<rect x="0" y="100" width="280" height="100"/>' },
      { id: 'petals', label: 'Flower Petals', targetColor: '#f43f5e', svgShape: '<circle cx="140" cy="95" r="28"/>' },
      { id: 'center', label: 'Flower Center', targetColor: '#fbbf24', svgShape: '<circle cx="140" cy="95" r="12"/>' },
    ],
    palette: [
      { color: '#7dd3fc', name: 'Light Blue' },
      { color: '#16a34a', name: 'Green' },
      { color: '#f43f5e', name: 'Rose' },
      { color: '#fbbf24', name: 'Yellow' },
    ],
  },
  'venetian-palette': {
    title: "Titian's Canvas",
    instruction: "Mix Titian's famous warm palette for a Renaissance portrait.",
    viewBox: '0 0 280 200',
    regions: [
      { id: 'bg',     label: 'Background', targetColor: '#1e1b4b', svgShape: '<rect x="0" y="0" width="280" height="200"/>' },
      { id: 'robe',   label: 'Robe',       targetColor: '#dc2626', svgShape: '<polygon points="140,60 80,200 200,200"/>' },
      { id: 'face',   label: 'Face',       targetColor: '#fcd34d', svgShape: '<ellipse cx="140" cy="60" rx="35" ry="40"/>' },
      { id: 'shadow', label: 'Shadow',     targetColor: '#7f1d1d', svgShape: '<polygon points="140,100 100,200 140,200"/>' },
    ],
    palette: [
      { color: '#1e1b4b', name: 'Indigo' },
      { color: '#dc2626', name: 'Crimson' },
      { color: '#fcd34d', name: 'Gold' },
      { color: '#7f1d1d', name: 'Dark Red' },
    ],
  },
  'japanese-blossom': {
    title: 'Cherry Blossom',
    instruction: "Paint the traditional Japanese cherry blossom scene for Lu Yu's tea garden.",
    viewBox: '0 0 280 200',
    regions: [
      { id: 'sky',      label: 'Sky',         targetColor: '#fce7f3', svgShape: '<rect x="0" y="0" width="280" height="200"/>' },
      { id: 'trunk',    label: 'Tree Trunk',  targetColor: '#44403c', svgShape: '<rect x="125" y="80" width="30" height="120" rx="6"/>' },
      { id: 'blossoms', label: 'Blossoms',    targetColor: '#f9a8d4', svgShape: '<ellipse cx="140" cy="70" rx="80" ry="55"/>' },
      { id: 'ground',   label: 'Ground',      targetColor: '#4ade80', svgShape: '<rect x="0" y="175" width="280" height="25"/>' },
    ],
    palette: [
      { color: '#fce7f3', name: 'Blush' },
      { color: '#44403c', name: 'Dark Brown' },
      { color: '#f9a8d4', name: 'Pink' },
      { color: '#4ade80', name: 'Green' },
    ],
  },
  'night-sky': {
    title: 'Night Sky Navigation',
    instruction: 'Color the night sky as navigators saw it crossing the Pacific.',
    viewBox: '0 0 280 200',
    regions: [
      { id: 'sky',     label: 'Night Sky',    targetColor: '#0f172a', svgShape: '<rect x="0" y="0" width="280" height="150"/>' },
      { id: 'moon',    label: 'Moon',         targetColor: '#e2e8f0', svgShape: '<circle cx="200" cy="50" r="25"/>' },
      { id: 'stars',   label: 'Stars',        targetColor: '#fbbf24', svgShape: '<polygon points="140,30 143,40 154,40 145,47 148,57 140,50 132,57 135,47 126,40 137,40"/>' },
      { id: 'ocean',   label: 'Ocean',        targetColor: '#1e3a5f', svgShape: '<rect x="0" y="150" width="280" height="50"/>' },
    ],
    palette: [
      { color: '#0f172a', name: 'Midnight' },
      { color: '#e2e8f0', name: 'Silver' },
      { color: '#fbbf24', name: 'Gold' },
      { color: '#1e3a5f', name: 'Deep Navy' },
    ],
  },
  'roman-forum': {
    title: 'The Roman Forum',
    instruction: 'Paint the Forum where Cicero gave his great speeches.',
    viewBox: '0 0 280 200',
    regions: [
      { id: 'sky',     label: 'Sky',       targetColor: '#7dd3fc', svgShape: '<rect x="0" y="0" width="280" height="100"/>' },
      { id: 'columns', label: 'Columns',   targetColor: '#e2e8f0', svgShape: '<rect x="50" y="40" width="180" height="120" rx="2"/>' },
      { id: 'ground',  label: 'Pavement',  targetColor: '#a8a29e', svgShape: '<rect x="0" y="160" width="280" height="40"/>' },
      { id: 'shadow',  label: 'Shadows',   targetColor: '#64748b', svgShape: '<polygon points="50,160 80,100 230,100 230,160"/>' },
    ],
    palette: [
      { color: '#7dd3fc', name: 'Sky Blue' },
      { color: '#e2e8f0', name: 'Marble White' },
      { color: '#a8a29e', name: 'Stone' },
      { color: '#64748b', name: 'Slate' },
    ],
  },
  'film-still': {
    title: 'Cinema Composition',
    instruction: "Color Eisenstein's iconic film frame using the rules of montage.",
    viewBox: '0 0 280 200',
    regions: [
      { id: 'bg',      label: 'Background', targetColor: '#1c1917', svgShape: '<rect x="0" y="0" width="280" height="200"/>' },
      { id: 'figure',  label: 'Figure',     targetColor: '#44403c', svgShape: '<ellipse cx="100" cy="100" rx="40" ry="70"/>' },
      { id: 'light',   label: 'Light Beam', targetColor: '#fbbf24', svgShape: '<polygon points="280,60 280,140 150,100"/>' },
      { id: 'ground',  label: 'Ground',     targetColor: '#292524', svgShape: '<rect x="0" y="150" width="280" height="50"/>' },
    ],
    palette: [
      { color: '#1c1917', name: 'Black' },
      { color: '#44403c', name: 'Dark Brown' },
      { color: '#fbbf24', name: 'Yellow' },
      { color: '#292524', name: 'Charcoal' },
    ],
  },
  'mesopotamia': {
    title: "Sargon's Akkad",
    instruction: "Paint the Akkadian empire — ziggurat towers rising above the desert rivers.",
    viewBox: '0 0 280 200',
    regions: [
      { id: 'sky',      label: 'Sky',      targetColor: '#60a5fa', svgShape: '<rect x="0" y="0" width="280" height="80"/>' },
      { id: 'ziggurat', label: 'Ziggurat', targetColor: '#92400e', svgShape: '<polygon points="140,20 90,80 190,80 200,120 80,120 70,160 210,160"/>' },
      { id: 'river',    label: 'River',    targetColor: '#1e40af', svgShape: '<rect x="0" y="160" width="280" height="24"/>' },
      { id: 'desert',   label: 'Desert',   targetColor: '#d97706', svgShape: '<rect x="0" y="80" width="280" height="80"/>' },
    ],
    palette: [
      { color: '#60a5fa', name: 'Sky Blue' },
      { color: '#92400e', name: 'Brick' },
      { color: '#1e40af', name: 'River' },
      { color: '#d97706', name: 'Sand' },
    ],
  },
  'imhotep-temple': {
    title: 'Healing Temple',
    instruction: "Paint Imhotep's healing temple — where medicine and the divine were one.",
    viewBox: '0 0 280 200',
    regions: [
      { id: 'sky',     label: 'Sky',     targetColor: '#7dd3fc', svgShape: '<rect x="0" y="0" width="280" height="90"/>' },
      { id: 'columns', label: 'Columns', targetColor: '#e2e8f0', svgShape: '<rect x="60" y="30" width="30" height="120" rx="4"/><rect x="130" y="30" width="30" height="120" rx="4"/><rect x="200" y="30" width="30" height="120" rx="4"/>' },
      { id: 'herbs',   label: 'Herbs',   targetColor: '#16a34a', svgShape: '<ellipse cx="140" cy="165" rx="60" ry="20"/>' },
      { id: 'floor',   label: 'Floor',   targetColor: '#a8a29e', svgShape: '<rect x="0" y="150" width="280" height="50"/>' },
    ],
    palette: [
      { color: '#7dd3fc', name: 'Sky' },
      { color: '#e2e8f0', name: 'Marble' },
      { color: '#16a34a', name: 'Green' },
      { color: '#a8a29e', name: 'Stone' },
    ],
  },
  'olympia-scene': {
    title: 'Ancient Olympia',
    instruction: "Paint the sacred site of Olympia where Pericles' Greeks competed.",
    viewBox: '0 0 280 200',
    regions: [
      { id: 'sky',     label: 'Sky',     targetColor: '#7dd3fc', svgShape: '<rect x="0" y="0" width="280" height="90"/>' },
      { id: 'hills',   label: 'Hills',   targetColor: '#16a34a', svgShape: '<polygon points="0,90 80,50 160,80 240,45 280,90"/>' },
      { id: 'ground',  label: 'Ground',  targetColor: '#d97706', svgShape: '<rect x="0" y="140" width="280" height="60"/>' },
      { id: 'columns', label: 'Columns', targetColor: '#e2e8f0', svgShape: '<rect x="60" y="90" width="20" height="50" rx="2"/><rect x="130" y="90" width="20" height="50" rx="2"/><rect x="200" y="90" width="20" height="50" rx="2"/>' },
    ],
    palette: [
      { color: '#7dd3fc', name: 'Sky' },
      { color: '#16a34a', name: 'Olive' },
      { color: '#d97706', name: 'Earth' },
      { color: '#e2e8f0', name: 'Marble' },
    ],
  },
  'mulan-forest': {
    title: 'Northern China',
    instruction: "Paint the snow-covered northern landscape Hua Mulan rode through.",
    viewBox: '0 0 280 200',
    regions: [
      { id: 'sky',   label: 'Sky',   targetColor: '#bfdbfe', svgShape: '<rect x="0" y="0" width="280" height="100"/>' },
      { id: 'snow',  label: 'Snow',  targetColor: '#f8fafc', svgShape: '<rect x="0" y="140" width="280" height="60"/>' },
      { id: 'pines', label: 'Pines', targetColor: '#166534', svgShape: '<polygon points="80,100 60,140 100,140"/><polygon points="200,90 175,140 225,140"/>' },
      { id: 'path',  label: 'Path',  targetColor: '#78716c', svgShape: '<rect x="120" y="100" width="40" height="100"/>' },
    ],
    palette: [
      { color: '#bfdbfe', name: 'Winter Sky' },
      { color: '#f8fafc', name: 'Snow' },
      { color: '#166534', name: 'Pine' },
      { color: '#78716c', name: 'Path' },
    ],
  },
  'musashi-dojo': {
    title: "Musashi's Dojo",
    instruction: "Paint the Japanese dojo where Miyamoto Musashi trained in the way of the sword.",
    viewBox: '0 0 280 200',
    regions: [
      { id: 'sky',   label: 'Night Sky', targetColor: '#0f172a', svgShape: '<rect x="0" y="0" width="280" height="80"/>' },
      { id: 'floor', label: 'Wood Floor', targetColor: '#78716c', svgShape: '<rect x="0" y="140" width="280" height="60"/>' },
      { id: 'wall',  label: 'Wall',      targetColor: '#44403c', svgShape: '<rect x="0" y="80" width="280" height="60"/>' },
      { id: 'sword', label: 'Sword',     targetColor: '#e2e8f0', svgShape: '<rect x="132" y="20" width="6" height="160" rx="3"/>' },
    ],
    palette: [
      { color: '#0f172a', name: 'Night' },
      { color: '#78716c', name: 'Wood' },
      { color: '#44403c', name: 'Shadow' },
      { color: '#e2e8f0', name: 'Steel' },
    ],
  },
  'gutenberg-workshop': {
    title: "Gutenberg's Workshop",
    instruction: "Paint the medieval print shop where Gutenberg changed the world.",
    viewBox: '0 0 280 200',
    regions: [
      { id: 'wall',  label: 'Stone Wall', targetColor: '#78716c', svgShape: '<rect x="0" y="0" width="280" height="200"/>' },
      { id: 'press', label: 'Press Wood', targetColor: '#92400e', svgShape: '<rect x="80" y="40" width="120" height="100" rx="4"/>' },
      { id: 'paper', label: 'Paper',      targetColor: '#fef9c3', svgShape: '<rect x="100" y="60" width="80" height="60" rx="2"/>' },
      { id: 'ink',   label: 'Ink Tray',  targetColor: '#1e293b', svgShape: '<rect x="30" y="150" width="60" height="20" rx="4"/>' },
    ],
    palette: [
      { color: '#78716c', name: 'Stone' },
      { color: '#92400e', name: 'Oak' },
      { color: '#fef9c3', name: 'Parchment' },
      { color: '#1e293b', name: 'Ink' },
    ],
  },
  'teresa-chapel': {
    title: "Teresa's Chapel",
    instruction: "Paint the Gothic chapel of Teresa of Ávila — where faith meets mystical light.",
    viewBox: '0 0 280 200',
    regions: [
      { id: 'sky',   label: 'Stained Glass', targetColor: '#7c3aed', svgShape: '<ellipse cx="140" cy="40" rx="50" ry="40"/>' },
      { id: 'stone', label: 'Stone Wall',    targetColor: '#78716c', svgShape: '<rect x="0" y="0" width="280" height="200"/>' },
      { id: 'glow',  label: 'Candle Glow',  targetColor: '#f59e0b', svgShape: '<circle cx="140" cy="130" r="20"/>' },
      { id: 'floor', label: 'Dark Wood',    targetColor: '#44403c', svgShape: '<rect x="0" y="160" width="280" height="40"/>' },
    ],
    palette: [
      { color: '#7c3aed', name: 'Violet Glass' },
      { color: '#78716c', name: 'Stone' },
      { color: '#f59e0b', name: 'Candle' },
      { color: '#44403c', name: 'Dark Wood' },
    ],
  },
  'luther-door': {
    title: "Wittenberg Church",
    instruction: "Paint the Wittenberg church door where Luther nailed his 95 Theses.",
    viewBox: '0 0 280 200',
    regions: [
      { id: 'sky',   label: 'Autumn Sky', targetColor: '#60a5fa', svgShape: '<rect x="0" y="0" width="280" height="80"/>' },
      { id: 'wall',  label: 'Limestone',  targetColor: '#e2e8f0', svgShape: '<rect x="0" y="80" width="280" height="120"/>' },
      { id: 'door',  label: 'Oak Door',   targetColor: '#92400e', svgShape: '<rect x="100" y="60" width="80" height="140" rx="6"/>' },
      { id: 'ground',label: 'Cobblestone',targetColor: '#a8a29e', svgShape: '<rect x="0" y="170" width="280" height="30"/>' },
    ],
    palette: [
      { color: '#60a5fa', name: 'Autumn Sky' },
      { color: '#e2e8f0', name: 'Limestone' },
      { color: '#92400e', name: 'Oak Door' },
      { color: '#a8a29e', name: 'Cobblestone' },
    ],
  },
  'versailles-hall': {
    title: 'Hall of Mirrors',
    instruction: "Paint the Hall of Mirrors at Versailles — Louis XVI's gilded world.",
    viewBox: '0 0 280 200',
    regions: [
      { id: 'ceiling', label: 'Ceiling',      targetColor: '#fbbf24', svgShape: '<rect x="0" y="0" width="280" height="60"/>' },
      { id: 'mirrors', label: 'Mirror Wall',  targetColor: '#e2e8f0', svgShape: '<rect x="0" y="60" width="40" height="100"/><rect x="240" y="60" width="40" height="100"/>' },
      { id: 'floor',   label: 'Parquet',      targetColor: '#d97706', svgShape: '<rect x="0" y="160" width="280" height="40"/>' },
      { id: 'light',   label: 'Sky Light',    targetColor: '#7dd3fc', svgShape: '<rect x="40" y="60" width="200" height="100"/>' },
    ],
    palette: [
      { color: '#fbbf24', name: 'Gold' },
      { color: '#e2e8f0', name: 'Silver Mirror' },
      { color: '#d97706', name: 'Parquet' },
      { color: '#7dd3fc', name: 'Sky Light' },
    ],
  },
  'brahms-vienna': {
    title: 'Vienna Concert Hall',
    instruction: "Paint the Viennese concert hall where Brahms premiered his symphonies.",
    viewBox: '0 0 280 200',
    regions: [
      { id: 'ceiling', label: 'Gilded Ceiling', targetColor: '#92400e', svgShape: '<rect x="0" y="0" width="280" height="60"/>' },
      { id: 'walls',   label: 'Warm Walls',     targetColor: '#d97706', svgShape: '<rect x="0" y="60" width="280" height="80"/>' },
      { id: 'stage',   label: 'Dark Stage',     targetColor: '#1c1917', svgShape: '<rect x="60" y="100" width="160" height="60"/>' },
      { id: 'seats',   label: 'Crimson Seats',  targetColor: '#7f1d1d', svgShape: '<rect x="0" y="140" width="280" height="60"/>' },
    ],
    palette: [
      { color: '#92400e', name: 'Gilded Ceiling' },
      { color: '#d97706', name: 'Warm Wall' },
      { color: '#1c1917', name: 'Dark Stage' },
      { color: '#7f1d1d', name: 'Crimson Seats' },
    ],
  },
  'clara-recital': {
    title: 'Piano Salon',
    instruction: "Paint the elegant salon where Clara Schumann performed before royalty.",
    viewBox: '0 0 280 200',
    regions: [
      { id: 'curtain', label: 'Velvet Curtain', targetColor: '#7c3aed', svgShape: '<rect x="0" y="0" width="60" height="200"/><rect x="220" y="0" width="60" height="200"/>' },
      { id: 'piano',   label: 'Piano',          targetColor: '#1c1917', svgShape: '<rect x="80" y="80" width="120" height="60" rx="8"/>' },
      { id: 'candles', label: 'Candlelight',    targetColor: '#fbbf24', svgShape: '<circle cx="80" cy="60" r="12"/><circle cx="200" cy="60" r="12"/>' },
      { id: 'floor',   label: 'Rosewood Floor', targetColor: '#92400e', svgShape: '<rect x="0" y="160" width="280" height="40"/>' },
    ],
    palette: [
      { color: '#7c3aed', name: 'Velvet' },
      { color: '#1c1917', name: 'Ebony' },
      { color: '#fbbf24', name: 'Candlelight' },
      { color: '#92400e', name: 'Rosewood' },
    ],
  },
  'chanel-atelier': {
    title: "Chanel's Atelier",
    instruction: "Paint the Paris fashion atelier where Chanel revolutionised style.",
    viewBox: '0 0 280 200',
    regions: [
      { id: 'wall',   label: 'White Wall',    targetColor: '#f8fafc', svgShape: '<rect x="0" y="0" width="280" height="200"/>' },
      { id: 'dress',  label: 'Black Dress',   targetColor: '#1c1917', svgShape: '<polygon points="140,30 100,200 180,200"/>' },
      { id: 'mirror', label: 'Silver Mirror', targetColor: '#e2e8f0', svgShape: '<rect x="200" y="20" width="60" height="120" rx="4"/>' },
      { id: 'floor',  label: 'Grey Floor',    targetColor: '#d1d5db', svgShape: '<rect x="0" y="170" width="280" height="30"/>' },
    ],
    palette: [
      { color: '#f8fafc', name: 'White Wall' },
      { color: '#1c1917', name: 'Black Dress' },
      { color: '#e2e8f0', name: 'Silver Mirror' },
      { color: '#d1d5db', name: 'Grey Floor' },
    ],
  },
  'mani-shrine': {
    title: 'Manichaean Temple',
    instruction: "Paint Mani's sacred shrine — where light triumphs over darkness.",
    viewBox: '0 0 280 200',
    regions: [
      { id: 'sky',    label: 'Darkness',     targetColor: '#0f172a', svgShape: '<rect x="0" y="0" width="280" height="200"/>' },
      { id: 'fire',   label: 'Sacred Fire',  targetColor: '#f59e0b', svgShape: '<ellipse cx="140" cy="100" rx="30" ry="50"/>' },
      { id: 'wall',   label: 'Violet Shrine',targetColor: '#7c3aed', svgShape: '<rect x="40" y="60" width="200" height="100" rx="8"/>' },
      { id: 'shadow', label: 'Shadow',       targetColor: '#292524', svgShape: '<rect x="0" y="160" width="280" height="40"/>' },
    ],
    palette: [
      { color: '#0f172a', name: 'Darkness' },
      { color: '#f59e0b', name: 'Sacred Fire' },
      { color: '#7c3aed', name: 'Violet Shrine' },
      { color: '#292524', name: 'Shadow' },
    ],
  },
  'titian-canvas': {
    title: "Titian's Venetian Studio",
    instruction: "Recreate Titian's Venetian palette — the deep indigo backgrounds and crimson robes that made him famous.",
    viewBox: '0 0 280 200',
    regions: [
      { id: 'bg',     label: 'Background', targetColor: '#1e1b4b', svgShape: '<rect x="0" y="0" width="280" height="200"/>' },
      { id: 'robe',   label: 'Crimson Robe',targetColor: '#dc2626', svgShape: '<polygon points="140,60 80,200 200,200"/>' },
      { id: 'skin',   label: 'Golden Skin', targetColor: '#fcd34d', svgShape: '<ellipse cx="140" cy="60" rx="35" ry="40"/>' },
      { id: 'shadow', label: 'Dark Red',    targetColor: '#7f1d1d', svgShape: '<polygon points="140,100 100,200 140,200"/>' },
    ],
    palette: [
      { color: '#1e1b4b', name: 'Indigo Dark' },
      { color: '#dc2626', name: 'Crimson' },
      { color: '#fcd34d', name: 'Gold' },
      { color: '#7f1d1d', name: 'Dark Red' },
    ],
  },
  'new-world-coast': {
    title: 'Caribbean Coast',
    instruction: "Paint the Caribbean coast Columbus sighted — the 'New World' that changed history.",
    viewBox: '0 0 280 200',
    regions: [
      { id: 'sky',    label: 'Tropical Sky',    targetColor: '#60a5fa', svgShape: '<rect x="0" y="0" width="280" height="80"/>' },
      { id: 'sea',    label: 'Caribbean Sea',   targetColor: '#0ea5e9', svgShape: '<rect x="0" y="80" width="280" height="80"/>' },
      { id: 'jungle', label: 'Jungle',          targetColor: '#166534', svgShape: '<polygon points="0,80 0,160 80,80"/><polygon points="280,80 280,160 200,80"/>' },
      { id: 'beach',  label: 'Sandy Beach',     targetColor: '#fbbf24', svgShape: '<ellipse cx="140" cy="160" rx="120" ry="20"/>' },
    ],
    palette: [
      { color: '#60a5fa', name: 'Tropical Sky' },
      { color: '#0ea5e9', name: 'Caribbean Sea' },
      { color: '#166534', name: 'Jungle' },
      { color: '#fbbf24', name: 'Sand' },
    ],
  },
  'shaw-theater': {
    title: "Shaw's Stage",
    instruction: "Paint the Edwardian theater where Shaw's plays challenged convention.",
    viewBox: '0 0 280 200',
    regions: [
      { id: 'curtains',  label: 'Curtains',   targetColor: '#7f1d1d', svgShape: '<rect x="0" y="0" width="70" height="200"/><rect x="210" y="0" width="70" height="200"/>' },
      { id: 'backdrop',  label: 'Backdrop',   targetColor: '#1e1b4b', svgShape: '<rect x="70" y="0" width="140" height="130"/>' },
      { id: 'spotlight', label: 'Spotlight',  targetColor: '#f59e0b', svgShape: '<ellipse cx="140" cy="100" rx="45" ry="35"/>' },
      { id: 'stage',     label: 'Stage',      targetColor: '#44403c', svgShape: '<rect x="70" y="130" width="140" height="70"/>' },
    ],
    palette: [
      { color: '#7f1d1d', name: 'Crimson Curtain' },
      { color: '#1e1b4b', name: 'Night Backdrop' },
      { color: '#f59e0b', name: 'Spotlight' },
      { color: '#44403c', name: 'Oak Stage' },
    ],
  },
  'peck-courtroom': {
    title: "Maycomb Courthouse",
    instruction: "Paint the Alabama courtroom where Atticus Finch stood for justice.",
    viewBox: '0 0 280 200',
    regions: [
      { id: 'paneling', label: 'Wood Paneling', targetColor: '#92400e', svgShape: '<rect x="0" y="0" width="280" height="200"/>' },
      { id: 'windows',  label: 'Windows',       targetColor: '#bfdbfe', svgShape: '<rect x="20" y="20" width="50" height="70" rx="4"/><rect x="210" y="20" width="50" height="70" rx="4"/>' },
      { id: 'desk',     label: "Judge's Bench",  targetColor: '#1c1917', svgShape: '<rect x="60" y="110" width="160" height="40" rx="4"/>' },
      { id: 'floor',    label: 'Stone Floor',   targetColor: '#a8a29e', svgShape: '<rect x="0" y="150" width="280" height="50"/>' },
    ],
    palette: [
      { color: '#92400e', name: 'Oak' },
      { color: '#bfdbfe', name: 'Window Light' },
      { color: '#1c1917', name: 'Dark Wood' },
      { color: '#a8a29e', name: 'Stone' },
    ],
  },
  'isabel-court': {
    title: "Court of Castile",
    instruction: "Paint the Moorish-Gothic palace where Isabel held her royal court.",
    viewBox: '0 0 280 200',
    regions: [
      { id: 'arches', label: 'Golden Arches', targetColor: '#d97706', svgShape: '<rect x="0" y="0" width="280" height="80"/><polygon points="70,80 70,40 110,40 110,80"/><polygon points="140,80 140,40 180,40 180,80"/>' },
      { id: 'walls',  label: 'Stone Walls',   targetColor: '#a8a29e', svgShape: '<rect x="0" y="80" width="280" height="80"/>' },
      { id: 'throne', label: 'Throne',        targetColor: '#dc2626', svgShape: '<polygon points="140,60 115,160 165,160"/>' },
      { id: 'shadow', label: 'Shadows',       targetColor: '#292524', svgShape: '<rect x="0" y="160" width="280" height="40"/>' },
    ],
    palette: [
      { color: '#d97706', name: 'Gold' },
      { color: '#a8a29e', name: 'Stone' },
      { color: '#dc2626', name: 'Crimson' },
      { color: '#292524', name: 'Shadow' },
    ],
  },
  'lisbon-harbor': {
    title: "Lisbon Harbor",
    instruction: "Paint the Tagus estuary as Manuel's caravels set sail for the spice routes.",
    viewBox: '0 0 280 200',
    regions: [
      { id: 'sky',  label: 'Morning Sky', targetColor: '#60a5fa', svgShape: '<rect x="0" y="0" width="280" height="100"/>' },
      { id: 'sea',  label: 'River',       targetColor: '#1e40af', svgShape: '<rect x="0" y="100" width="280" height="100"/>' },
      { id: 'sail', label: 'Sail',        targetColor: '#f8fafc', svgShape: '<polygon points="140,20 115,110 165,110"/>' },
      { id: 'hull', label: 'Hull',        targetColor: '#92400e', svgShape: '<rect x="105" y="110" width="70" height="22" rx="4"/>' },
    ],
    palette: [
      { color: '#60a5fa', name: 'Morning Sky' },
      { color: '#1e40af', name: 'Tagus River' },
      { color: '#f8fafc', name: 'White Sail' },
      { color: '#92400e', name: 'Oak Hull' },
    ],
  },
}

export default function PaintingGame({ configId, onWin }: { configId: string; onWin: () => void }) {
  const config = CONFIGS[configId] ?? CONFIGS['spring-garden']
  const [filled, setFilled] = useState<Record<string, string>>({})
  const [selectedColor, setSelectedColor] = useState<string>(config.palette[0].color)
  const [won, setWon] = useState(false)

  const handleRegionClick = (regionId: string) => {
    if (won) return
    const next = { ...filled, [regionId]: selectedColor }
    setFilled(next)
    const allCorrect = config.regions.every(r => next[r.id] === r.targetColor)
    if (allCorrect) {
      setWon(true)
      setTimeout(onWin, 500)
    }
  }

  const regionColor = (r: Region) => filled[r.id] ?? '#334155'

  const buildSvg = () => {
    const shapes = config.regions.map(r => {
      const color = regionColor(r)
      const target = r.targetColor
      const isFilled = !!filled[r.id]
      const isCorrect = filled[r.id] === target
      const stroke = isFilled ? (isCorrect ? '#34d399' : '#f87171') : '#475569'
      const sw = isFilled ? 2 : 1
      // Inject fill and stroke into the shape
      const shape = r.svgShape.replace(/\/>/, ` fill="${color}" stroke="${stroke}" stroke-width="${sw}" style="cursor:pointer"/>`).replace(/<(\w+)/, `<$1 data-id="${r.id}" `)
      return `<g class="region-${r.id}">${shape}</g>`
    }).join('')
    return `<svg viewBox="${config.viewBox}" xmlns="http://www.w3.org/2000/svg" width="100%" height="200">${shapes}</svg>`
  }

  const allFilled = config.regions.every(r => filled[r.id])
  const correctCount = config.regions.filter(r => filled[r.id] === r.targetColor).length

  return (
    <div className="flex flex-col gap-3 bg-slate-950 rounded-xl p-3">
      <p className="text-amber-400/80 text-[10px] font-bold uppercase tracking-widest">{config.title}</p>
      <p className="text-slate-400 text-xs">{config.instruction}</p>

      {/* Canvas */}
      <div
        className="rounded-xl overflow-hidden border border-white/[0.08] bg-slate-900"
        onClick={(e) => {
          if (won) return
          const target = e.target as SVGElement
          const regionId = target.closest('[data-id]')?.getAttribute('data-id')
          if (regionId) handleRegionClick(regionId)
        }}
        dangerouslySetInnerHTML={{ __html: buildSvg() }}
      />

      {/* Region labels */}
      <div className="flex flex-wrap gap-1.5 justify-center">
        {config.regions.map(r => {
          const isFilled = !!filled[r.id]
          const isCorrect = filled[r.id] === r.targetColor
          return (
            <button
              key={r.id}
              onClick={() => handleRegionClick(r.id)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold border transition-all ${
                isCorrect ? 'border-emerald-500/50 text-emerald-300 bg-emerald-500/10'
                  : isFilled ? 'border-red-500/40 text-red-300 bg-red-500/10'
                  : 'border-slate-600 text-slate-400 bg-slate-800 hover:border-amber-500/40'
              }`}
            >
              <span
                className="inline-block w-2 h-2 rounded-full mr-1"
                style={{ background: regionColor(r) }}
              />
              {r.label}
            </button>
          )
        })}
      </div>

      {/* Palette */}
      <div>
        <p className="text-slate-500 text-[10px] mb-1.5">Select color, then tap a region:</p>
        <div className="flex flex-wrap gap-2">
          {config.palette.map(p => (
            <button
              key={p.color}
              onClick={() => setSelectedColor(p.color)}
              title={p.name}
              className={`w-8 h-8 rounded-lg border-2 transition-all ${
                selectedColor === p.color ? 'border-white scale-110 shadow-lg' : 'border-transparent hover:scale-105'
              }`}
              style={{ background: p.color }}
            />
          ))}
        </div>
        {selectedColor && (
          <p className="text-slate-500 text-[10px] mt-1">
            Selected: <span className="text-white">{config.palette.find(p => p.color === selectedColor)?.name}</span>
          </p>
        )}
      </div>

      {/* Progress */}
      {allFilled && !won && (
        <div className="text-center text-slate-400 text-xs">
          {correctCount} / {config.regions.length} correct
          {correctCount < config.regions.length && ' — try adjusting some colors'}
        </div>
      )}

      {won && (
        <p className="text-center text-emerald-400 font-bold text-sm py-1">Masterpiece complete! 🎨</p>
      )}
    </div>
  )
}
