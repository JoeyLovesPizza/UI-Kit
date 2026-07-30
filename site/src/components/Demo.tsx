import type { ReactNode } from 'react'

interface DemoProps {
  title?: string
  children: ReactNode
  controls?: ReactNode
  dark?: boolean
}

export function Demo({ title, children, controls, dark }: DemoProps) {
  return (
    <div className="demo">
      {title && <div className="demo-title">{title}</div>}
      <div className={`demo-stage${dark ? ' demo-stage-dark' : ''}`}>{children}</div>
      {controls && <div className="demo-controls">{controls}</div>}
    </div>
  )
}
