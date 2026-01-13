import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Optimizer from "./pages/Optimizer";
import DraftPlanner from "./pages/DraftPlanner";
import Explainability from "./pages/Explainability";

export default function App() {
  return (
    <BrowserRouter>
      <div style={{ padding: 16 }}>
        <nav style={{ display: "flex", gap: 16, marginBottom: 16 }}>
          <Link to="/">Dashboard</Link>
          <Link to="/optimizer">Optimizer</Link>
          <Link to="/draft">Draft Planner</Link>
          <Link to="/explain">Explainability</Link>
        </nav>

        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/optimizer" element={<Optimizer />} />
          <Route path="/draft" element={<DraftPlanner />} />
          <Route path="/explain" element={<Explainability />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
