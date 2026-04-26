import { NavLink, Route, Routes } from 'react-router-dom';
import Home from './pages/Home';
import History from './pages/History';

function AppShell() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">AI Impact Analysis Agent</div>
        <NavLink to="/" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`} end>
          Dashboard
        </NavLink>
        <NavLink to="/history" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
          History
        </NavLink>
      </aside>

      <main className="main-content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/history" element={<History />} />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  return (
    <Routes>
      <Route path="*" element={<AppShell />} />
    </Routes>
  );
}

export default App;
