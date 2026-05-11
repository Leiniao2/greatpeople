import { useState } from 'react'

interface GeometryConfig {
  title: string
  question: string
  svg: string
  options: string[]
  answer: number
  explanation: string
}

const CONFIGS: Record<string, GeometryConfig> = {
  'triangle-sum': {
    title: 'Angles in a Triangle',
    question: 'The angles of any triangle always sum to 180°. What is the missing angle?',
    svg: `<svg viewBox="0 0 200 160" xmlns="http://www.w3.org/2000/svg">
      <polygon points="100,10 20,150 180,150" fill="none" stroke="#f59e0b" stroke-width="2"/>
      <text x="95" y="35" fill="#94a3b8" font-size="13" text-anchor="middle">70°</text>
      <text x="30" y="145" fill="#94a3b8" font-size="13" text-anchor="middle">60°</text>
      <text x="160" y="145" fill="#f59e0b" font-size="15" text-anchor="middle" font-weight="bold">?°</text>
    </svg>`,
    options: ['40°', '50°', '60°', '70°'],
    answer: 1,
    explanation: '70° + 60° + x = 180° → x = 50°. Angles in any triangle always add to 180°.',
  },
  'pythagorean': {
    title: 'The Pythagorean Theorem',
    question: 'In a right triangle with legs 3 and 4, what is the length of the hypotenuse?',
    svg: `<svg viewBox="0 0 200 160" xmlns="http://www.w3.org/2000/svg">
      <polygon points="20,140 20,30 170,140" fill="none" stroke="#f59e0b" stroke-width="2"/>
      <rect x="20" y="127" width="13" height="13" fill="none" stroke="#f59e0b" stroke-width="1.5"/>
      <text x="10" y="90" fill="#94a3b8" font-size="14" text-anchor="middle">3</text>
      <text x="95" y="155" fill="#94a3b8" font-size="14" text-anchor="middle">4</text>
      <text x="110" y="80" fill="#f59e0b" font-size="15" text-anchor="middle" font-weight="bold">?</text>
    </svg>`,
    options: ['√7', '5', '6', '7'],
    answer: 1,
    explanation: 'a² + b² = c² → 3² + 4² = 9 + 16 = 25 → c = 5. This 3-4-5 triple is the oldest known right triangle.',
  },
  'parallel-lines': {
    title: 'Alternate Interior Angles',
    question: 'When a transversal crosses parallel lines, alternate interior angles are equal. Find x.',
    svg: `<svg viewBox="0 0 200 160" xmlns="http://www.w3.org/2000/svg">
      <line x1="20" y1="50" x2="180" y2="50" stroke="#64748b" stroke-width="2"/>
      <line x1="20" y1="120" x2="180" y2="120" stroke="#64748b" stroke-width="2"/>
      <line x1="50" y1="10" x2="150" y2="160" stroke="#f59e0b" stroke-width="2"/>
      <text x="95" y="45" fill="#94a3b8" font-size="13">65°</text>
      <text x="80" y="138" fill="#f59e0b" font-size="15" font-weight="bold">x°</text>
      <text x="25" y="45" fill="#64748b" font-size="10">∥</text>
      <text x="25" y="118" fill="#64748b" font-size="10">∥</text>
    </svg>`,
    options: ['45°', '65°', '115°', '125°'],
    answer: 1,
    explanation: 'Alternate interior angles are equal when lines are parallel. x = 65°.',
  },
  'pentagon-interior': {
    title: 'Interior Angles of a Pentagon',
    question: 'What is the interior angle of a regular pentagon?',
    svg: `<svg viewBox="0 0 200 180" xmlns="http://www.w3.org/2000/svg">
      <polygon points="100,15 182,72 151,160 49,160 18,72" fill="none" stroke="#f59e0b" stroke-width="2"/>
      <text x="100" y="100" fill="#f59e0b" font-size="16" text-anchor="middle" font-weight="bold">?°</text>
      <text x="100" y="118" fill="#64748b" font-size="10" text-anchor="middle">regular</text>
    </svg>`,
    options: ['90°', '100°', '108°', '120°'],
    answer: 2,
    explanation: 'Sum of interior angles = (5-2) × 180° = 540°. Each angle = 540° ÷ 5 = 108°.',
  },
  'hexagon-interior': {
    title: 'Interior Angles of a Hexagon',
    question: 'A honeycomb is made of regular hexagons. What is the interior angle?',
    svg: `<svg viewBox="0 0 200 180" xmlns="http://www.w3.org/2000/svg">
      <polygon points="100,15 168,55 168,125 100,165 32,125 32,55" fill="none" stroke="#f59e0b" stroke-width="2"/>
      <text x="100" y="98" fill="#f59e0b" font-size="16" text-anchor="middle" font-weight="bold">?°</text>
      <text x="100" y="116" fill="#64748b" font-size="10" text-anchor="middle">regular</text>
    </svg>`,
    options: ['100°', '110°', '120°', '135°'],
    answer: 2,
    explanation: 'Sum of interior angles = (6-2) × 180° = 720°. Each angle = 720° ÷ 6 = 120°. That\'s why hexagons tile perfectly!',
  },
  'circle-circumference': {
    title: 'Circumference of a Circle',
    question: 'A circular track has a radius of 7 metres. What is its circumference? (Use π ≈ 22/7)',
    svg: `<svg viewBox="0 0 200 180" xmlns="http://www.w3.org/2000/svg">
      <circle cx="100" cy="90" r="70" fill="none" stroke="#f59e0b" stroke-width="2"/>
      <line x1="100" y1="90" x2="170" y2="90" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="4"/>
      <text x="135" y="83" fill="#94a3b8" font-size="13">r = 7</text>
      <text x="100" y="96" fill="#f59e0b" font-size="13" text-anchor="middle" font-weight="bold">C = ?</text>
    </svg>`,
    options: ['22 m', '44 m', '49 m', '154 m'],
    answer: 1,
    explanation: 'C = 2πr = 2 × (22/7) × 7 = 44 metres. Circumference is the distance around a circle.',
  },
  'sphere-surface': {
    title: 'Surface Area of a Sphere',
    question: 'The Earth has radius ≈ 6,371 km. Which formula gives its surface area?',
    svg: `<svg viewBox="0 0 200 180" xmlns="http://www.w3.org/2000/svg">
      <circle cx="100" cy="90" r="70" fill="none" stroke="#f59e0b" stroke-width="2"/>
      <ellipse cx="100" cy="90" rx="70" ry="20" fill="none" stroke="#64748b" stroke-width="1.5" stroke-dasharray="4"/>
      <line x1="100" y1="90" x2="170" y2="90" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="4"/>
      <text x="130" y="83" fill="#94a3b8" font-size="12">r</text>
      <text x="100" y="165" fill="#64748b" font-size="11" text-anchor="middle">globe</text>
    </svg>`,
    options: ['πr²', '2πr²', '4πr²', '(4/3)πr³'],
    answer: 2,
    explanation: 'Surface area of a sphere = 4πr². Volume = (4/3)πr³. Magellan\'s route covered roughly half the globe\'s surface.',
  },
  'golden-ratio': {
    title: 'The Golden Ratio',
    question: 'The golden ratio φ appears in nature and art. Which value is closest?',
    svg: `<svg viewBox="0 0 200 140" xmlns="http://www.w3.org/2000/svg">
      <rect x="15" y="20" width="170" height="105" fill="none" stroke="#f59e0b" stroke-width="2"/>
      <rect x="15" y="20" width="105" height="105" fill="none" stroke="#64748b" stroke-width="1.5" stroke-dasharray="3"/>
      <path d="M 15,125 Q 120,20 120,125" fill="none" stroke="#94a3b8" stroke-width="1.5"/>
      <text x="155" y="78" fill="#f59e0b" font-size="20" text-anchor="middle" font-weight="bold">φ</text>
    </svg>`,
    options: ['1.414', '1.618', '2.718', '3.141'],
    answer: 1,
    explanation: 'φ = (1+√5)/2 ≈ 1.618. Renaissance artists used the golden ratio in composition. It appears in spirals, pentagons, and plant growth.',
  },
  'right-triangle-angle': {
    title: 'Missing Angle in a Right Triangle',
    question: 'A right triangle has one angle of 37°. What is the third angle?',
    svg: `<svg viewBox="0 0 200 160" xmlns="http://www.w3.org/2000/svg">
      <polygon points="20,140 20,20 170,140" fill="none" stroke="#f59e0b" stroke-width="2"/>
      <rect x="20" y="127" width="13" height="13" fill="none" stroke="#f59e0b" stroke-width="1.5"/>
      <text x="10" y="30" fill="#94a3b8" font-size="13">37°</text>
      <text x="140" y="155" fill="#f59e0b" font-size="15" text-anchor="middle" font-weight="bold">?°</text>
      <text x="14" y="85" fill="#64748b" font-size="11">90°</text>
    </svg>`,
    options: ['47°', '53°', '63°', '73°'],
    answer: 1,
    explanation: '37° + 90° + x = 180° → x = 53°. The right angle accounts for 90° of the triangle\'s 180°.',
  },
  'volume-pyramid': {
    title: 'Volume of a Pyramid',
    question: 'Khufu\'s pyramid is roughly 230m base × 147m height. Volume = (1/3)×base²×h ≈ ?',
    svg: `<svg viewBox="0 0 200 180" xmlns="http://www.w3.org/2000/svg">
      <polygon points="100,15 175,140 25,140" fill="none" stroke="#f59e0b" stroke-width="2"/>
      <line x1="100" y1="15" x2="100" y2="140" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="4"/>
      <line x1="25" y1="140" x2="175" y2="140" stroke="#64748b" stroke-width="2"/>
      <text x="110" y="85" fill="#94a3b8" font-size="12">h=147m</text>
      <text x="100" y="158" fill="#94a3b8" font-size="11" text-anchor="middle">base = 230m</text>
      <text x="100" y="175" fill="#f59e0b" font-size="12" text-anchor="middle" font-weight="bold">V = ?</text>
    </svg>`,
    options: ['~1.3 million m³', '~2.6 million m³', '~5.2 million m³', '~7.8 million m³'],
    answer: 1,
    explanation: 'V = (1/3) × 230² × 147 ≈ 2.59 million m³. That\'s enough stone to build a wall 1m thick around France.',
  },
  'anaxagoras-shadow': {
    title: 'Measuring the Sun',
    question: "Anaxagoras estimated the sun's size using shadows. If a shadow 10m long is cast by a 2m post, the sun's angle is approximately:",
    svg: `<svg viewBox="0 0 200 160" xmlns="http://www.w3.org/2000/svg">
    <circle cx="30" cy="20" r="18" fill="none" stroke="#f59e0b" stroke-width="2"/>
    <text x="30" y="24" fill="#f59e0b" font-size="10" text-anchor="middle">☀</text>
    <line x1="80" y1="140" x2="80" y2="120" stroke="#94a3b8" stroke-width="2"/>
    <text x="68" y="130" fill="#94a3b8" font-size="11">2m</text>
    <line x1="80" y1="140" x2="180" y2="140" stroke="#64748b" stroke-width="2"/>
    <text x="130" y="155" fill="#94a3b8" font-size="11" text-anchor="middle">10m</text>
    <line x1="30" y1="20" x2="80" y2="120" stroke="#f59e0b" stroke-width="1" stroke-dasharray="4"/>
    <text x="140" y="115" fill="#f59e0b" font-size="15" text-anchor="middle" font-weight="bold">?°</text>
    <path d="M 80 132 A 12 12 0 0 0 92 140" fill="none" stroke="#94a3b8" stroke-width="1.5"/>
  </svg>`,
    options: ['5.7°', '11.3°', '20°', '45°'],
    answer: 1,
    explanation: 'tan θ = 2/10 → θ ≈ 11.3°. Anaxagoras was the first to claim the sun was a fiery rock larger than the Peloponnese — a revolutionary idea that got him exiled from Athens.',
  },
  'discus-angle': {
    title: 'The Olympic Discus',
    question: 'A discus thrower releases at 35° above the horizontal. Adding 10° increases distance by 18%. What is the optimal release angle for maximum range?',
    svg: `<svg viewBox="0 0 200 160" xmlns="http://www.w3.org/2000/svg">
    <line x1="20" y1="140" x2="180" y2="140" stroke="#64748b" stroke-width="2"/>
    <line x1="40" y1="140" x2="40" y2="40" stroke="#64748b" stroke-width="1" stroke-dasharray="3"/>
    <line x1="40" y1="140" x2="170" y2="60" stroke="#f59e0b" stroke-width="2"/>
    <path d="M 60 140 A 20 20 0 0 1 52 122" fill="none" stroke="#94a3b8" stroke-width="1.5"/>
    <text x="72" y="132" fill="#94a3b8" font-size="12">35°</text>
    <circle cx="175" cy="56" r="8" fill="none" stroke="#f59e0b" stroke-width="2"/>
    <text x="70" y="90" fill="#f59e0b" font-size="14" text-anchor="middle" font-weight="bold">?°</text>
    <text x="70" y="106" fill="#64748b" font-size="9" text-anchor="middle">optimal</text>
  </svg>`,
    options: ['35°', '40°', '45°', '50°'],
    answer: 2,
    explanation: '45° gives maximum range on flat ground (ignoring air resistance). The ancient Greeks discovered this empirically — Olympian discus throwers trained at this exact angle.',
  },
  'cylinder-volume': {
    title: 'Volume of a Cylinder',
    question: 'A cylinder has radius 3 cm and height 10 cm. What is its volume (use π ≈ 3.14)?',
    svg: `<svg viewBox="0 0 200 160" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="100" cy="30" rx="55" ry="15" fill="none" stroke="#f59e0b" stroke-width="2"/>
      <ellipse cx="100" cy="130" rx="55" ry="15" fill="none" stroke="#64748b" stroke-width="2"/>
      <line x1="45" y1="30" x2="45" y2="130" stroke="#f59e0b" stroke-width="2"/>
      <line x1="155" y1="30" x2="155" y2="130" stroke="#f59e0b" stroke-width="2"/>
      <text x="30" y="85" fill="#94a3b8" font-size="12" text-anchor="middle">h=10</text>
      <text x="100" y="18" fill="#94a3b8" font-size="12" text-anchor="middle">r=3</text>
      <text x="110" y="90" fill="#f59e0b" font-size="14" text-anchor="middle" font-weight="bold">V=?</text>
    </svg>`,
    options: ['188.4 cm³', '282.6 cm³', '94.2 cm³', '376.8 cm³'],
    answer: 1,
    explanation: 'V = πr²h = 3.14 × 9 × 10 = 282.6 cm³. Lorentz used similar calculations for the volume swept by a moving particle in space-time.',
  },
  'ellipse-area': {
    title: 'Area of an Ellipse',
    question: 'An ellipse has semi-major axis a = 8 and semi-minor axis b = 5. What is its area (use π ≈ 3.14)?',
    svg: `<svg viewBox="0 0 200 160" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="100" cy="80" rx="75" ry="50" fill="none" stroke="#f59e0b" stroke-width="2"/>
      <line x1="100" y1="80" x2="175" y2="80" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="4"/>
      <line x1="100" y1="80" x2="100" y2="30" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="4"/>
      <text x="140" y="73" fill="#94a3b8" font-size="12">a = 8</text>
      <text x="105" y="58" fill="#94a3b8" font-size="12">b = 5</text>
      <text x="100" y="110" fill="#f59e0b" font-size="14" text-anchor="middle" font-weight="bold">A = ?</text>
    </svg>`,
    options: ['94.2', '125.6', '157.0', '251.2'],
    answer: 1,
    explanation: 'A = πab = 3.14 × 8 × 5 = 125.6. Earth\'s orbit is an ellipse with the Sun at one focus — Earhart\'s transatlantic route curved with the planet\'s own elliptical path.',
  },
  'cone-surface': {
    title: 'Surface Area of a Cone',
    question: 'A mountain tent has a conical shape with radius 2 m and slant height 3 m. What is the total surface area (use π ≈ 3.14)?',
    svg: `<svg viewBox="0 0 200 160" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="100" cy="135" rx="60" ry="15" fill="none" stroke="#64748b" stroke-width="2"/>
      <line x1="40" y1="135" x2="100" y2="15" stroke="#f59e0b" stroke-width="2"/>
      <line x1="160" y1="135" x2="100" y2="15" stroke="#f59e0b" stroke-width="2"/>
      <line x1="100" y1="135" x2="100" y2="15" stroke="#94a3b8" stroke-width="1" stroke-dasharray="3"/>
      <text x="140" y="75" fill="#94a3b8" font-size="12">l=3</text>
      <text x="120" y="148" fill="#94a3b8" font-size="12">r=2</text>
      <text x="65" y="95" fill="#f59e0b" font-size="14" font-weight="bold">SA=?</text>
    </svg>`,
    options: ['18.84 m²', '25.12 m²', '31.40 m²', '37.68 m²'],
    answer: 2,
    explanation: 'SA = πrl + πr² = (3.14 × 2 × 3) + (3.14 × 4) = 18.84 + 12.56 = 31.40 m². Hillary and Tenzing\'s summit camp was a conical tent clinging to the South Col — every square metre of shelter calculated precisely against the wind.',
  },
  'cube-diagonal': {
    title: 'Diagonal of a Cube',
    question: 'A cube has side length 4. What is the length of its space diagonal (from one corner to the opposite corner)?',
    svg: `<svg viewBox="0 0 200 160" xmlns="http://www.w3.org/2000/svg">
      <rect x="40" y="30" width="90" height="90" fill="none" stroke="#64748b" stroke-width="2"/>
      <line x1="40" y1="30" x2="70" y2="10" stroke="#64748b" stroke-width="2"/>
      <line x1="130" y1="30" x2="160" y2="10" stroke="#64748b" stroke-width="2"/>
      <line x1="130" y1="120" x2="160" y2="100" stroke="#64748b" stroke-width="2"/>
      <line x1="70" y1="10" x2="160" y2="10" stroke="#64748b" stroke-width="2"/>
      <line x1="160" y1="10" x2="160" y2="100" stroke="#64748b" stroke-width="2"/>
      <line x1="40" y1="120" x2="70" y2="100" stroke="#64748b" stroke-width="2"/>
      <line x1="70" y1="10" x2="70" y2="100" stroke="#64748b" stroke-width="1" stroke-dasharray="3"/>
      <line x1="70" y1="100" x2="160" y2="100" stroke="#64748b" stroke-width="1" stroke-dasharray="3"/>
      <line x1="40" y1="30" x2="160" y2="100" stroke="#f59e0b" stroke-width="2"/>
      <text x="100" y="155" fill="#94a3b8" font-size="12" text-anchor="middle">side = 4</text>
      <text x="85" y="73" fill="#f59e0b" font-size="13" font-weight="bold">d=?</text>
    </svg>`,
    options: ['4√2', '4√3', '4√5', '8'],
    answer: 1,
    explanation: 'd = s√3 = 4√3 ≈ 6.93. The Gilded Age\'s great buildings — Carnegie\'s steel structures, Vanderbilt\'s palaces — used precise spatial geometry in every beam and diagonal.',
  },
}

export default function GeometryGame({ configId, onWin }: { configId: string; onWin: () => void }) {
  const config = CONFIGS[configId] ?? CONFIGS['triangle-sum']
  const [selected, setSelected] = useState<number | null>(null)
  const answered = selected !== null

  const handleSelect = (i: number) => {
    if (answered) return
    setSelected(i)
    if (i === config.answer) setTimeout(onWin, 800)
  }

  return (
    <div className="flex flex-col gap-3 bg-slate-950 rounded-xl p-3">
      <p className="text-amber-400/80 text-[10px] font-bold uppercase tracking-widest">{config.title}</p>

      {/* SVG figure */}
      <div
        className="rounded-xl bg-slate-900 border border-white/[0.06] overflow-hidden flex items-center justify-center py-2"
        dangerouslySetInnerHTML={{ __html: config.svg.replace('<svg', '<svg width="100%" height="180"') }}
      />

      <p className="text-white text-sm font-medium leading-snug">{config.question}</p>

      <div className="flex flex-col gap-2">
        {config.options.map((opt, i) => {
          const isCorrect = i === config.answer
          const isSelected = i === selected
          let cls = 'bg-white/5 border-white/10 text-slate-300 hover:border-amber-500/40 hover:text-amber-300'
          if (answered) {
            if (isCorrect) cls = 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
            else if (isSelected) cls = 'bg-red-500/20 border-red-500/40 text-red-300'
            else cls = 'bg-white/[0.03] border-white/[0.06] text-slate-500'
          }
          return (
            <button
              key={i}
              disabled={answered}
              onClick={() => handleSelect(i)}
              className={`text-left px-4 py-2.5 rounded-xl border text-sm transition-all ${cls}`}
            >
              {opt}
            </button>
          )
        })}
      </div>

      {answered && (
        <div className={`p-3 rounded-xl border text-xs leading-relaxed ${
          selected === config.answer
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            : 'bg-red-500/10 border-red-500/30 text-red-300'
        }`}>
          <span className="font-bold mr-1">
            {selected === config.answer ? '✓ Correct!' : '✗ Wrong.'}
          </span>
          {config.explanation}
        </div>
      )}
    </div>
  )
}
