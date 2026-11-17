import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Navbar } from '@/components/Navbar'
import Explore from '@/pages/Explore'
import Create from '@/pages/Create'
import LaunchDetail from '@/pages/LaunchDetail'
import { EmptyState } from '@/components/ui'

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <div className="min-h-dvh">
        <Navbar />
        <main className="mx-auto max-w-6xl px-4 pb-28 pt-8">
          <Routes>
            <Route path="/" element={<Explore />} />
            <Route path="/create" element={<Create />} />
            <Route path="/launch/:pool" element={<LaunchDetail />} />
            <Route
              path="*"
              element={<EmptyState title="Page not found" body="That page does not exist. Head back to the launches." />}
            />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
