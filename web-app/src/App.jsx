import { Link, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import AuthShell from './components/AuthShell'
import { Button, Card, Center, Empty, PageHeader, Spinner } from './components/ui'
import { useSession } from './state/session'
import Login from './pages/Login'
import Register from './pages/Register'
import Onboarding from './pages/Onboarding'
import Overview from './pages/Overview'
import Incidents from './pages/Incidents'
import LiveDetectionPage from './pages/LiveDetectionPage'
import IncidentDetail from './pages/IncidentDetail'
import Cameras from './pages/Cameras'
import AddCamera from './pages/AddCamera'
import Perimeter from './pages/Perimeter'
import WallCreate from './pages/WallCreate'
import WallDetail from './pages/WallDetail'
import WallAnnotate from './pages/WallAnnotate'
import WallCells from './pages/WallCells'
import WallMapping from './pages/WallMapping'
import Drones from './pages/Drones'
import SettingsLayout, { SettingsIndex } from './pages/SettingsLayout'
import Account from './pages/Account'
import ResponseSettings from './pages/ResponseSettings'
import Guards from './pages/Guards'
import Properties from './pages/Properties'
import People from './pages/People'
import EnrollPerson from './pages/EnrollPerson'
import PersonDetail from './pages/PersonDetail'
import Appearance from './pages/Appearance'

function Splash() { return <Center><Spinner big /></Center> }

// Everything after sign-in. A signed-out visitor goes to the sign-in screen; an admin with no property adds one;
// a guard with no property waits for their administrator.
function Protected() {
  const { user, isAdmin, property, restoring, signOut } = useSession()
  if (restoring) return <Splash />
  if (!user) return <Navigate to="/login" replace />
  if (!property) {
    if (isAdmin) return <Navigate to="/onboarding" replace />
    return (
      <AuthShell>
        <div className="stack">
          <div><h1>Waiting for your administrator</h1><p className="sub">No property is set up for your account yet. Ask your administrator to give you access to one.</p></div>
          <Button variant="secondary" onClick={() => signOut()}>Sign out</Button>
        </div>
      </AuthShell>
    )
  }
  return <Layout />
}

function AdminOnly() {
  const { isAdmin } = useSession()
  return isAdmin ? <Outlet /> : <Navigate to="/" replace />
}

function PublicOnly({ children }) {
  const { user, restoring } = useSession()
  if (restoring) return <Splash />
  return user ? <Navigate to="/" replace /> : children
}

function OnboardingGate() {
  const { user, isAdmin, property, restoring } = useSession()
  if (restoring) return <Splash />
  if (!user) return <Navigate to="/login" replace />
  if (!isAdmin || property) return <Navigate to="/" replace />
  return <Onboarding />
}

function NotFound() {
  return (
    <>
      <PageHeader title="Page not found" />
      <Card><Empty icon="search" title="There is nothing at this address" action={<Link className="btn" to="/">Go to Overview</Link>}>The page may have moved, or the address is wrong.</Empty></Card>
    </>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
      <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />
      <Route path="/onboarding" element={<OnboardingGate />} />
      <Route element={<Protected />}>
        <Route index element={<Overview />} />
        <Route path="live" element={<LiveDetectionPage />} />
        <Route path="incidents" element={<Incidents />} />
        <Route path="incidents/:id" element={<IncidentDetail />} />
        <Route path="cameras" element={<Cameras />} />
        <Route path="perimeter" element={<Perimeter />} />
        <Route path="perimeter/walls/:wallId" element={<WallDetail />} />
        <Route path="drones" element={<Drones />} />
        <Route path="settings" element={<SettingsLayout />}>
          <Route index element={<SettingsIndex />} />
          <Route path="appearance" element={<Appearance />} />
          <Route path="account" element={<Account />} />
          <Route element={<AdminOnly />}>
            <Route path="response" element={<ResponseSettings />} />
            <Route path="guards" element={<Guards />} />
            <Route path="properties" element={<Properties />} />
            <Route path="people" element={<People />} />
            <Route path="people/new" element={<EnrollPerson />} />
            <Route path="people/:personId" element={<PersonDetail />} />
          </Route>
        </Route>
        <Route element={<AdminOnly />}>
          <Route path="cameras/new" element={<AddCamera />} />
          <Route path="perimeter/walls/new" element={<WallCreate />} />
          <Route path="perimeter/walls/:wallId/annotate" element={<WallAnnotate />} />
          <Route path="perimeter/walls/:wallId/cells" element={<WallCells />} />
          <Route path="perimeter/walls/:wallId/mapping" element={<WallMapping />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
