const LINKS = [
  { href: '#/', label: 'Home' },
  { href: '#/carousel', label: 'Carousel' },
  { href: '#/stepper', label: 'Stepper' },
  { href: '#/combined', label: 'Carousel + Stepper' },
]

export function Nav({ route }: { route: string }) {
  return (
    <nav className="site-nav">
      <a className="site-logo" href="#/">
        ui-kit
      </a>
      <ul>
        {LINKS.map((link) => (
          <li key={link.href}>
            <a href={link.href} className={route === link.href.slice(1) ? 'is-active' : ''}>
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
