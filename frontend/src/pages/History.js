import React, { useEffect, useState } from "react";
import axios from "axios";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip
} from "recharts";

function History() {

  const [data, setData] = useState([]);

  const fetchData = async () => {

    const res = await axios.get(
      "http://localhost:5000/sensor-data"
    );

    const formattedData = res.data
      .slice()
      .reverse()
      .map(item => ({
        ...item,
        time: new Date(item.createdAt)
          .toLocaleTimeString()
      }));

    setData(formattedData);
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <div>

      <h2>History & Analytics</h2>

      <h3>🌡 Temperature (°C)</h3>

      <LineChart
        width={800}
        height={250}
        data={data}
      >
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="time" />
        <YAxis label={{
          value: "°C",
          angle: -90,
          position: "insideLeft"
        }} />
        <Tooltip />
        <Line
          type="monotone"
          dataKey="temperature"
        />
      </LineChart>

      <br />

      <h3>💧 Humidity (%)</h3>

      <LineChart
        width={800}
        height={250}
        data={data}
      >
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="time" />
        <YAxis label={{
          value: "%",
          angle: -90,
          position: "insideLeft"
        }} />
        <Tooltip />
        <Line
          type="monotone"
          dataKey="humidity"
        />
      </LineChart>

      <br />

      <h3>💨 Gas Level (ADC)</h3>

      <LineChart
        width={800}
        height={250}
        data={data}
      >
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="time" />
        <YAxis label={{
          value: "ADC",
          angle: -90,
          position: "insideLeft"
        }} />
        <Tooltip />
        <Line
          type="monotone"
          dataKey="gas"
        />
      </LineChart>

      <br />

      <h3>Sensor Data Table</h3>

      <table border="1" cellPadding="10">

        <thead>

          <tr>
            <th>Time</th>
            <th>Temperature (°C)</th>
            <th>Humidity (%)</th>
            <th>Gas Level (ADC)</th>
          </tr>

        </thead>

        <tbody>

          {data.map(item => (

            <tr key={item._id}>
              <td>{item.time}</td>
              <td>{item.temperature}</td>
              <td>{item.humidity}</td>
              <td>{item.gas}</td>
            </tr>

          ))}

        </tbody>

      </table>

    </div>
  );
}

export default History;