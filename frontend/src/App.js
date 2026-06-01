import "./App.css";

import {
  BrowserRouter,
  Routes,
  Route,
  Link
} from "react-router-dom";

import Dashboard from "./pages/Dashboard";
import Alerts from "./pages/Alerts";
import History from "./pages/History";

function App() {
  return (
    <BrowserRouter>

      <div className="container">

        <h1>
          🚀 Smart Rover Monitoring System
        </h1>

        <div className="navbar">

          <Link to="/">
            Dashboard
          </Link>

          <Link to="/alerts">
            Alerts
          </Link>

          <Link to="/history">
            History
          </Link>

        </div>

        <Routes>

          <Route
            path="/"
            element={<Dashboard />}
          />

          <Route
            path="/alerts"
            element={<Alerts />}
          />

          <Route
            path="/history"
            element={<History />}
          />

        </Routes>

      </div>

    </BrowserRouter>
  );
}

export default App;