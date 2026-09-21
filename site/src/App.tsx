import { useEffect } from 'react'
import { DialRoot } from 'dialkit'
import 'dialkit/styles.css'
import { Nav } from './components/Nav'
import { useHashRoute } from './useHashRoute'
import { HomePage } from './pages/HomePage'
import { CarouselPage } from './pages/CarouselPage'
import { StepperPage } from './pages/StepperPage'
import { MenuPage } from './pages/MenuPage'
import { RecorderPage } from './pages/RecorderPage'
import { CombinedPage } from './pages/CombinedPage'

function Page({ route }: { route: string }) {
  switch (route) {
    case '/carousel':
      return <CarouselPage />
    case '/stepper':
      return <StepperPage />
    case '/menu':
      return <MenuPage />
    case '/recorder':
      return <RecorderPage />
    case '/combined':
      return <CombinedPage />
    default:
      return <HomePage />
  }
}

export function App() {
  const route = useHashRoute()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [route])

  return (
    <div className="site-shell">
      <Nav route={route} />
      <main className="site-content">
        <Page route={route} />
      </main>
      <DialRoot />
    </div>
  )
}
