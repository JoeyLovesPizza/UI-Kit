import { useState } from 'react'
import { Carousel, Stepper } from 'ui-kit'
import { CodeBlock } from '../components/CodeBlock'
import { Demo } from '../components/Demo'

const SLIDES = [
  { id: 'aurora', title: 'Aurora', gradient: 'linear-gradient(135deg, #ff5e7e, #ff9a5e)' },
  { id: 'ledger', title: 'Ledger', gradient: 'linear-gradient(135deg, #38f9d7, #43e97b)' },
  { id: 'nimbus', title: 'Nimbus', gradient: 'linear-gradient(135deg, #4facfe, #00f2fe)' },
  { id: 'orbit', title: 'Orbit', gradient: 'linear-gradient(135deg, #a18cd1, #fbc2eb)' },
  { id: 'quartz', title: 'Quartz', gradient: 'linear-gradient(135deg, #f6d365, #fda085)' },
]

const CODE = `
const [active, setActive] = useState(0)

// .combined-stage is just { position: relative; width: 700px }
// .combined-stepper is { position: absolute; bottom: 20px; left: 50%;
//   transform: translateX(-50%); ...--stepper-* overrides for a glassy look }
<div className="combined-stage">
  <Carousel
    items={slides}
    itemKey={(item) => item.id}
    showDots={false}
    activeIndex={active}
    onActiveIndexChange={setActive}
    defaults={{ card: { width: 480, height: 360, borderRadius: 16 }, spacing: { gap: 24 } }}
    renderItem={(item) => <img src={item.src} alt="" />}
  />
  <Stepper
    count={slides.length}
    active={active}
    onStepClick={setActive}
    className="combined-stepper"
  />
</div>
`

export function CombinedPage() {
  const [active, setActive] = useState(0)

  return (
    <div>
      <p className="page-eyebrow">Pattern</p>
      <h1 className="page-title">Carousel + Stepper</h1>
      <p className="page-lede">
        <code>Carousel</code>'s optional <code>activeIndex</code>/<code>onActiveIndexChange</code>{' '}
        props let an external <code>Stepper</code> drive and reflect it — click a step to jump the
        carousel, or drag/scroll the carousel and watch the stepper follow. The stepper is just laid
        over the carousel with CSS and themed with a glassy override.
      </p>

      <p className="section-title">Live demo</p>
      <Demo>
        <div className="combined-stage">
          <Carousel
            items={SLIDES}
            itemKey={(item) => item.id}
            itemLabel={(item) => item.title}
            panelName="Combined"
            showDots={false}
            activeIndex={active}
            onActiveIndexChange={setActive}
            defaults={{
              card: { width: 480, height: 360, borderRadius: 16 },
              spacing: { gap: 24 },
            }}
            renderItem={(item) => (
              <div className="gradient-card" style={{ background: item.gradient }}>
                {item.title}
              </div>
            )}
          />
          <Stepper
            count={SLIDES.length}
            active={active}
            onStepClick={setActive}
            className="combined-stepper"
          />
        </div>
      </Demo>

      <p className="section-title">Usage</p>
      <CodeBlock code={CODE} />
    </div>
  )
}
