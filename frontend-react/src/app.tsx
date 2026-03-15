import { Routes, Route } from 'react-router-dom';
import { Home } from './pages/home';
import { Process } from './pages/process';
import { SimulationView } from './pages/simulation-view';
import { SimulationRunView } from './pages/simulation-run-view';
import { ReportView } from './pages/report-view';
import { InteractionView } from './pages/interaction-view';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/process/:projectId" element={<Process />} />
      <Route path="/simulation/:simulationId" element={<SimulationView />} />
      <Route path="/simulation/:simulationId/start" element={<SimulationRunView />} />
      <Route path="/report/:reportId" element={<ReportView />} />
      <Route path="/interaction/:reportId" element={<InteractionView />} />
    </Routes>
  );
}
