import { useTitle } from '../components/Layout'
import { Card, Empty, Notice, PageHeader, Badge } from '../components/ui'

// The drone feature does not exist on the server yet: every drones/... function answers 501.
const PLANNED = [
  ['Register a drone', 'Give it a name and its home square on the laser grid.'],
  ['Send the drone to an alert', 'It flies to the laser squares linked to the cell where the person is.'],
  ['Live status', 'Navigating, arrived or manual override, with its position on the grid.'],
  ['Manual control', 'Take over with a joystick, then hand the mission back.'],
  ['Flight logs', 'A record of every flight.'],
]

export default function Drones() {
  useTitle('Drones')
  return (
    <>
      <PageHeader title="Drones" subtitle="Autonomous response to an intruder, without GPS" actions={<Badge tone="grey">Not available yet</Badge>} />
      <Notice title="The drone is not connected yet">
        The server has no drone control yet. When a person is detected, the alert is created and sent to the guards, but no drone is dispatched. This screen will show the drone once it is connected.
      </Notice>
      <Card title="Planned" flush>
        <div className="rows">
          {PLANNED.map(([t, s]) => <div key={t}><div className="grow"><div className="title">{t}</div><div className="sub">{s}</div></div><Badge tone="grey">Planned</Badge></div>)}
        </div>
      </Card>
      <Card><Empty icon="drone" title="No drone registered">This will list your drones with their live status.</Empty></Card>
    </>
  )
}
