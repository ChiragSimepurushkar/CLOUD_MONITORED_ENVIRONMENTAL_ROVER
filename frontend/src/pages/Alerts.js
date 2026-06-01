import React, {
  useEffect,
  useState
} from "react";

import axios from "axios";

function Alerts() {

  const [alerts, setAlerts] = useState([]);

  const fetchAlerts = async () => {

    const res = await axios.get(
      "http://localhost:5000/alerts"
    );

    setAlerts(res.data);
  };

  useEffect(() => {

    fetchAlerts();

    const interval = setInterval(
      fetchAlerts,
      2000
    );

    return () => clearInterval(interval);

  }, []);

  return (
    <div>

      <h2>🚨 Alert Center</h2>

      {alerts.length === 0 && (
        <div className="card">
          No alerts detected
        </div>
      )}

      {alerts.map(alert => (

        <div
          key={alert._id}
          className="card"
          style={{
            marginBottom: "15px",
            borderLeft:
              alert.type === "DANGER"
                ? "6px solid #FF3B3B"
                : "6px solid #FF8C00"
          }}
        >

          <h3>
            {alert.type === "DANGER"
              ? "🔴 DANGER"
              : "🟡 WARNING"}
          </h3>

          <p>{alert.message}</p>

          <small>
            {new Date(
              alert.createdAt
            ).toLocaleString()}
          </small>

        </div>

      ))}

    </div>
  );
}

export default Alerts;