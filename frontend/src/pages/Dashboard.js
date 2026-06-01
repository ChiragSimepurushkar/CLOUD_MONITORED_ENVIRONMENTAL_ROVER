import React, { useEffect, useState } from "react";
import axios from "axios";

import { io } from "socket.io-client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip
} from "recharts";

const socket = io("http://localhost:5000");

function Dashboard() {

  const [data, setData] = useState([]);

  const fetchData = async () => {

    const res = await axios.get(
      "http://localhost:5000/sensor-data"
    );

    setData(res.data);
  };

  useEffect(() => {

    fetchData();

    socket.on("sensorUpdate", (newData) => {

      setData(prev => [
        newData,
        ...prev.slice(0, 19)
      ]);

    });

    return () => {
      socket.off("sensorUpdate");
    };

  }, []);

  const latest = data[0];

  const getEnvironmentStatus = () => {

    if (!latest) return "Unknown";

    if (latest.gas > 400)
      return "🔴 Danger";

    if (latest.gas > 250)
      return "🟡 Warning";

    return "🟢 Safe";
  };

  return (
    <div>

      <h2>Live Dashboard</h2>

      {latest && (

        <div className="grid">

          <div className="card">
            <h3>🌡 Temperature</h3>
            <h1>{latest.temperature} °C</h1>
          </div>

          <div className="card">
            <h3>💧 Humidity</h3>
            <h1>{latest.humidity} %</h1>
          </div>

          <div className="card">
            <h3>💨 Gas Level</h3>
            <h1>{latest.gas} ADC</h1>
          </div>

          <div className="card">
            <h3>🤖 Rover Status</h3>
            <h1>🟢 Online</h1>
          </div>

          <div className="card">
            <h3>⚠ Environment</h3>
            <h1>{getEnvironmentStatus()}</h1>
          </div>

        </div>

      )}

      <br />

      <div className="card">

        <h2>Live Sensor Trend</h2>

        <LineChart
          width={900}
          height={350}
          data={data}
        >
          <CartesianGrid strokeDasharray="3 3" />

          <XAxis dataKey="_id" />

          <YAxis />

          <Tooltip />

          <Line
            type="monotone"
            dataKey="temperature"
          />

          <Line
            type="monotone"
            dataKey="humidity"
          />

          <Line
            type="monotone"
            dataKey="gas"
          />

        </LineChart>

      </div>

    </div>
  );
}

export default Dashboard;