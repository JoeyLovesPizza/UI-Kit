import { useState } from 'react'
import { Menu, type MenuItemData } from 'ui-kit'
import { CodeBlock } from '../components/CodeBlock'
import { Demo } from '../components/Demo'
import { PropsTable } from '../components/PropsTable'

const SUPPORT = 'Agentic principles for the second generation of Meta AI.'

const NAV: MenuItemData[] = [
  {
    id: 'work',
    label: 'Work',
    items: [
      { id: 'wildflower', label: 'Wildflower', description: SUPPORT },
      { id: 'hitl', label: 'Human In The Loop', description: SUPPORT },
      { id: 'dash', label: 'Dropbox Dash', description: SUPPORT },
      { id: 'meetings', label: 'Dropbox Meetings', description: SUPPORT },
      { id: 'paper', label: 'Paper', description: SUPPORT },
    ],
  },
  {
    id: 'writing',
    label: 'Writing',
    items: [
      { id: 'essays', label: 'Essays', description: 'Longer pieces on design and process.' },
      { id: 'notes', label: 'Notes', description: 'Short observations, published as they land.' },
    ],
  },
  { id: 'projects', label: 'Projects' },
  { id: 'about', label: 'About' },
]

// Short submenus, so both placements fit on one stage without a 5-row panel
// running off the top or the bottom.
const COMPACT: MenuItemData[] = [
  {
    id: 'work',
    label: 'Work',
    items: [
      { id: 'wildflower', label: 'Wildflower', description: SUPPORT },
      { id: 'hitl', label: 'Human In The Loop', description: SUPPORT },
    ],
  },
  { id: 'projects', label: 'Projects' },
  { id: 'about', label: 'About' },
]

const FLAT: MenuItemData[] = [
  { id: 'work', label: 'Work' },
  { id: 'writing', label: 'Writing' },
  { id: 'projects', label: 'Projects' },
  { id: 'about', label: 'About' },
]

const BASIC_CODE = `
const items = [
  {
    id: 'work',
    label: 'Work',
    items: [
      { id: 'wildflower', label: 'Wildflower', description: 'Agentic principles…' },
      { id: 'hitl', label: 'Human In The Loop', description: 'Agentic principles…' },
    ],
  },
  { id: 'projects', label: 'Projects' },
  { id: 'about', label: 'About' },
]

// selectedId marks the page you're on. On a subpage its section lights up too —
// selectedId="wildflower" selects both Wildflower and the Work row that owns it.
<Menu items={items} selectedId={currentPageId} onSelect={(item) => navigate(item.id)} />
`

const FLAT_CODE = `
// No item has children, so nothing opens — just the main menu.
<Menu items={[{ id: 'work', label: 'Work' }, { id: 'about', label: 'About' }]} />
`

const PLACEMENT_CODE = `
<Menu items={items} side="left" />
<Menu items={items} align="item" />
`

const THEMED_CODE = `
<Menu items={items} className="my-dark-menu" />
`

const THEMED_CSS = `
.my-dark-menu {
  --menu-bg: rgba(20, 20, 24, 0.5);
  --menu-label-color: rgba(255, 255, 255, 0.55);
  --menu-label-color-active: #ffffff;
  --menu-description-color: rgba(255, 255, 255, 0.4);
  --menu-description-color-active: rgba(255, 255, 255, 0.75);
  --menu-item-bg-active: rgba(255, 255, 255, 0.08);
  --menu-focus-ring: rgba(255, 255, 255, 0.6);

  /* multiply would sink this panel's light-on-dark type toward black */
  --menu-text-blend-mode: screen;
  --menu-selected-label-color: #9a9a9a;
}
`

const PROPS = [
  { name: 'items', type: 'MenuItemData[]', description: 'Rows of the main menu.' },
  {
    name: 'onSelect',
    type: '(item, path) => void',
    description:
      'Called when any row is chosen, including a parent that owns a submenu. `path` is the ancestry, ending with the row itself.',
  },
  { name: 'side', type: "'right' | 'left'", default: "'right'", description: 'Which side the submenu opens on.' },
  {
    name: 'align',
    type: "'bottom' | 'top' | 'item'",
    default: "'bottom'",
    description: 'Vertical alignment of the submenu against the main menu.',
  },
  {
    name: 'openDelay',
    type: 'number',
    default: '90',
    description: 'Hover dwell before the submenu opens, in ms. Ignored once a submenu is already open.',
  },
  {
    name: 'closeDelay',
    type: 'number',
    default: '220',
    description: 'Grace period after the pointer leaves the menu and its safe area, in ms.',
  },
  {
    name: 'selectedId',
    type: 'string',
    description:
      '`id` of the row for the page you are currently on, at either level. On a subpage the owning section is selected too; only the exact row gets aria-current="page".',
  },
  { name: 'label', type: 'string', default: "'Menu'", description: 'Accessible name for the main menu.' },
  { name: 'panelName', type: 'string', default: "'Menu'", description: 'DialKit panel title. Menus sharing a name share one panel.' },
  {
    name: 'defaults',
    type: 'MenuDefaults',
    description: 'Per-scenario starting values for the DialKit sliders (openFrom, content).',
  },
  { name: 'className', type: 'string', description: 'Additional class for CSS custom-property overrides.' },
]

const DIALS = [
  {
    name: 'openFrom.anchor',
    type: 'select',
    default: "'bottom corner'",
    description:
      'The point the submenu opens and resizes out of. Defaults to the bottom corner, for a menu anchored at the bottom of a page.',
  },
  {
    name: 'openFrom.offsetX / offsetY',
    type: 'number',
    default: '-8 / 0',
    description: 'Where the panel starts. offsetX runs along the open axis and mirrors when side="left".',
  },
  {
    name: 'openFrom.scale',
    type: 'number',
    default: '0.96',
    description:
      'How small the panel opens from, as a fraction of its natural size. Both width and height grow away from the corner it is pinned at. Centre scales by transform instead, since real dimensions cannot expand about a middle. Lower it for a more pronounced open.',
  },
  {
    name: 'menu.transition',
    type: 'spring | easing',
    default: 'spring 0.28 / 0.18',
    description: 'Physics of the panel opening and closing on hover.',
  },
  {
    name: 'menu.resize',
    type: 'spring | easing',
    default: 'spring 0.35 / 0.15',
    description:
      'Physics of the panel growing or shrinking when moving straight from one parent to another.',
  },
  {
    name: 'content.delay',
    type: 'number',
    default: '0.05',
    description: 'Head start the panel gets before the rows begin arriving.',
  },
  { name: 'content.stagger', type: 'number', default: '0.035', description: 'Gap between consecutive rows.' },
  { name: 'content.blur', type: 'number', default: '2', description: 'Blur each row resolves out of as it arrives.' },
  {
    name: 'content.resizeHandoff',
    type: 'number',
    default: '0.9',
    description:
      'Moving between parents holds the rows back until this fraction of the resize is done. Fresh opens use `delay` instead.',
  },
  {
    name: 'content.offsetX / offsetY / scale',
    type: 'number',
    default: '0 / 8 / 1',
    description:
      'How far each row travels. On a fresh open the direction comes from openFrom, so card and content arrive together; between parents offsetY is the growing direction and flips when the panel shrinks.',
  },
  {
    name: 'content.transition',
    type: 'spring | easing',
    default: 'spring 0.32 / 0.22',
    description: 'Physics of the rows settling into place.',
  },
  {
    name: 'rowHover.transition',
    type: 'spring | easing',
    default: 'easing 0.16s',
    description: 'Physics of the label/subtext color shift as the pointer moves between rows.',
  },
]

const ITEM_PROPS = [
  { name: 'id', type: 'string', description: 'Stable key, also used for open/active tracking.' },
  { name: 'label', type: 'string', description: 'The single line of text on the row.' },
  {
    name: 'description',
    type: 'string',
    description:
      'Subtext under the label. A panel where any item has one renders as the taller label & support variant.',
  },
  { name: 'href', type: 'string', description: 'Renders the row as a link instead of a button.' },
  { name: 'disabled', type: 'boolean', description: 'Greys the row out and takes it out of the tab order.' },
  { name: 'items', type: 'MenuItemData[]', description: 'Nested rows. An item with children opens a submenu.' },
]

const THEME_VARS = [
  { name: '--menu-bg', type: 'color', default: 'rgba(255,255,255,0.4)', description: 'Panel fill.' },
  {
    name: '--menu-blur',
    type: 'length',
    default: '34px',
    description: 'Backdrop blur radius. Driven by the surface.blur dial, which writes it inline.',
  },
  { name: '--menu-radius', type: 'length', default: '20px', description: 'Panel corner radius.' },
  { name: '--menu-padding-y / -x', type: 'length', default: '18px / 20px', description: 'Panel padding.' },
  { name: '--menu-panel-gap', type: 'length', default: '14px', description: 'Gap between the two panels.' },
  { name: '--menu-row-gap', type: 'length', default: '14px', description: 'Gap between single-line rows.' },
  { name: '--menu-item-gap', type: 'length', default: '8px', description: 'Gap between label & support rows.' },
  { name: '--menu-item-padding', type: 'length', default: '12px', description: 'Padding on label & support rows.' },
  { name: '--menu-item-radius', type: 'length', default: '8px', description: 'Row corner radius.' },
  { name: '--menu-item-bg-active', type: 'color', default: 'transparent', description: 'Row fill when active.' },
  { name: '--menu-label-size', type: 'length', default: '16px', description: 'Label type size.' },
  { name: '--menu-label-color', type: 'color', default: '#8f8f8f', description: 'Resting label color (Grey/500).' },
  {
    name: '--menu-label-color-active',
    type: 'color',
    default: '#373737',
    description: 'Active label color (Grey/900).',
  },
  { name: '--menu-description-size', type: 'length', default: '14px', description: 'Subtext type size.' },
  { name: '--menu-description-width', type: 'length', default: '200px', description: 'Subtext wrap width.' },
  {
    name: '--menu-description-color',
    type: 'color',
    default: '#8f8f8f',
    description: 'Resting subtext color (Grey/500).',
  },
  {
    name: '--menu-description-color-active',
    type: 'color',
    default: '#636363',
    description: 'Active subtext color (Grey/700).',
  },
  {
    name: '--menu-text-blend-mode',
    type: 'blend-mode',
    default: 'multiply',
    description:
      'How every label and subtext blends into the panel backdrop. `multiply` for a light panel, `screen` for a dark one, `normal` to paint them literally.',
  },
  {
    name: '--menu-selected-blend-mode',
    type: 'blend-mode',
    default: 'var(--menu-text-blend-mode)',
    description: 'Overrides the blend for the selected row alone.',
  },
  {
    name: '--menu-selected-label-color',
    type: 'color',
    default: '#5c5c5c',
    description: 'Selected label — Label component (main menu row). Blended, not painted.',
  },
  {
    name: '--menu-selected-subtext-label-color',
    type: 'color',
    default: '#5c5c5c',
    description: 'Selected label — Label & Subtext component (submenu row).',
  },
  {
    name: '--menu-selected-subtext-description-color',
    type: 'color',
    default: '#808080',
    description: 'Selected subtext — Label & Subtext component.',
  },
  { name: '--menu-focus-ring', type: 'color', default: 'rgba(55,55,55,0.45)', description: 'Focus outline color.' },
]

function BasicDemo() {
  // Starts on "Work" — a row that owns a submenu and is still a page in its
  // own right — so the Label component's selected state is visible without
  // touching anything. Choosing a submenu row moves the selection down a
  // level and shows the Label & Subtext one.
  const [selectedId, setSelectedId] = useState('work')
  const [selectedLabel, setSelectedLabel] = useState('Work')

  return (
    <Demo
      title="Main menu + submenu"
      controls={
        <span className="field-readout">
          On: {selectedLabel} — choose a row and it stays selected, like the page you’re on
        </span>
      }
    >
      <div className="menu-stage">
        <Menu
          items={NAV}
          label="Portfolio"
          selectedId={selectedId}
          onSelect={(item) => {
            setSelectedId(item.id)
            setSelectedLabel(item.label)
          }}
        />
      </div>
    </Demo>
  )
}

function FlatDemo() {
  return (
    <Demo title="Main menu only">
      <div className="menu-stage menu-stage-short">
        <Menu items={FLAT} label="Portfolio" selectedId="work" />
      </div>
    </Demo>
  )
}

function BlendDemo() {
  const [selectedId, setSelectedId] = useState('projects')

  return (
    <Demo
      title="Selected state, blended"
      controls={
        <span className="field-readout">
          The selected row takes its colour from the backdrop — hover a row to see the flat hover
          colour it drops back to
        </span>
      }
    >
      <div className="menu-stage menu-stage-short menu-stage-vivid">
        <Menu
          items={FLAT}
          label="Portfolio"
          selectedId={selectedId}
          onSelect={(item) => setSelectedId(item.id)}
        />
      </div>
    </Demo>
  )
}

function PlacementDemo() {
  return (
    <Demo title="side=&quot;left&quot; and align=&quot;item&quot;">
      <div className="menu-stage menu-stage-split">
        <Menu items={COMPACT} side="left" label="Opens left" />
        <Menu items={COMPACT} align="item" label="Aligned to the row" />
      </div>
    </Demo>
  )
}

function ThemedDemo() {
  return (
    <Demo title="Themed" dark>
      <div className="menu-stage menu-stage-dark">
        <Menu items={NAV} className="dark-menu" label="Portfolio" />
      </div>
    </Demo>
  )
}

export function MenuPage() {
  return (
    <div>
      <p className="page-eyebrow">Component</p>
      <h1 className="page-title">Menu</h1>
      <p className="page-lede">
        A two-level hover menu on frosted glass. The main menu is one line of text per row; a row
        with children opens a submenu whose rows carry a label and a line of subtext. Moving
        diagonally into the submenu is protected by a safe triangle, so the menu doesn’t snap shut
        when the cursor drifts off the row on its way over.
      </p>

      <p className="section-title">Live demos</p>
      <BasicDemo />
      <CodeBlock code={BASIC_CODE} />

      <BlendDemo />
      <div className="prose">
        <p>
          None of the type is a flat colour — every label and subtext is blended into the panel’s
          frosted backdrop, so each row takes a shade of whatever the menu is sitting on and holds
          its contrast as the page moves underneath. <code>multiply</code> can only ever darken the
          text relative to what’s behind it and <code>screen</code> can only ever lighten it, so
          whichever one matches the panel’s polarity keeps the type on the correct side of its own
          backdrop. A light panel wants <code>multiply</code>, a dark one <code>screen</code>. How
          strongly the tint reads depends on how much colour is behind the glass: over a near-white
          page it settles to roughly the base grey, and over something saturated it picks up the
          hue. Set <code>--menu-text-blend-mode</code> to <code>normal</code> to paint the colours
          literally instead.
        </p>
      </div>

      <FlatDemo />
      <div className="prose">
        <p>
          There is no <code>variant</code> prop — a panel renders as the label &amp; support variant
          when any of its rows has a <code>description</code>, and as the single-line variant
          otherwise. That’s the only structural difference between the two menu types.
        </p>
      </div>
      <CodeBlock code={FLAT_CODE} />

      <PlacementDemo />
      <CodeBlock code={PLACEMENT_CODE} />

      <ThemedDemo />
      <CodeBlock code={THEMED_CODE} />
      <CodeBlock code={THEMED_CSS} language="css" />

      <p className="section-title">Hover behavior</p>
      <ul className="a11y-list">
        <li>Hovering a row darkens its label; a row with children opens its submenu after `openDelay`.</li>
        <li>
          The parent row stays dark for as long as its submenu is open, including while the pointer
          is over the submenu.
        </li>
        <li>
          Leaving the main panel while a submenu is open builds a triangle from the exit point to
          the submenu’s near edge. Inside it, the submenu is held open; outside it, the menu closes
          after <code>closeDelay</code>.
        </li>
        <li>Swapping between rows while a submenu is open is instant — the dwell delay only applies to opening the first one.</li>
        <li>Clicking a parent row toggles its submenu rather than selecting, so the menu works on touch.</li>
      </ul>

      <p className="section-title">Tuning the motion</p>
      <div className="prose">
        <p>
          Every transition is driven by Motion and tuned from a live{' '}
          <a href="https://www.npmjs.com/package/dialkit" target="_blank" rel="noreferrer">
            DialKit
          </a>{' '}
          panel — mount <code>{'<DialRoot />'}</code> once in your app root. All the menus on this
          page share one panel, so a change here moves every demo at once. Use{' '}
          <code>panelName</code> to give a menu its own, and <code>defaults</code> to set where its
          sliders start.
        </p>
        <p>
          The panel and its rows animate on separate clocks: <code>menu.transition</code> is the
          panel itself, and the <code>content</code> group brings the rows in behind it, so you can
          have the surface arrive first and the content catch up.
        </p>
      </div>
      <PropsTable rows={DIALS} />

      <p className="section-title">Props</p>
      <PropsTable rows={PROPS} />

      <p className="section-title">MenuItemData</p>
      <PropsTable rows={ITEM_PROPS} />

      <p className="section-title">Theming</p>
      <div className="prose">
        <p>
          Every value from the design is a CSS custom property, overridable via a class passed to{' '}
          <code>className</code>.
        </p>
      </div>
      <PropsTable rows={THEME_VARS} />

      <p className="section-title">Accessibility</p>
      <ul className="a11y-list">
        <li>
          Panels are <code>role="menu"</code>, rows are <code>role="menuitem"</code>; parent rows
          carry <code>aria-haspopup</code> and <code>aria-expanded</code>
        </li>
        <li>Roving tabindex — one row per panel is in the tab order</li>
        <li>
          <code>↑</code>/<code>↓</code> move between rows, <code>Home</code>/<code>End</code> jump to
          the ends
        </li>
        <li>
          <code>→</code> opens a submenu and focuses its first row; <code>←</code> or{' '}
          <code>Esc</code> closes it and returns focus to the parent row (mirrored when{' '}
          <code>side="left"</code>)
        </li>
        <li>A submenu opened by hover never steals focus; one opened by keyboard always does</li>
        <li>
          Respects <code>prefers-reduced-motion</code> — the open/close transition resolves instantly
        </li>
      </ul>
    </div>
  )
}
