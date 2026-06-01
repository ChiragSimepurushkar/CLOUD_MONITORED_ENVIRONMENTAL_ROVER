const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

require("dotenv").config();

const app = express();

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("MongoDB connected"))
.catch(err => console.log(err));

const sensorSchema = new mongoose.Schema({
  temperature: Number,
  humidity: Number,
  gas: Number,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const Sensor = mongoose.model("Sensor", sensorSchema);

const Alert = require("./models/Alert");

app.post("/sensor-data", async (req, res) => {

  const { temperature, humidity, gas } = req.body;

  const sensor = new Sensor({
    temperature,
    humidity,
    gas
  });

  await sensor.save();

  io.emit("sensorUpdate", sensor);

  if (gas > 400) {

    const alert = new Alert({
      type: "DANGER",
      message: `Gas level reached ${gas}`
    });

    await alert.save();

    io.emit("newAlert", alert);
  }

  res.json({
    message: "Sensor data stored"
  });
});

app.get("/sensor-data", async (req, res) => {

  const data = await Sensor.find()
    .sort({ createdAt: -1 })
    .limit(20);

  res.json(data);
});

app.get("/alerts", async (req, res) => {

  const alerts = await Alert.find()
    .sort({ createdAt: -1 });

  res.json(alerts);
});

app.get("/control", (req, res) => {

  const cmd = req.query.cmd;

  console.log("Control Command:", cmd);

  res.json({
    success: true,
    command: cmd
  });
});

io.on("connection", () => {
  console.log("Frontend Connected");
});

server.listen(5000, () => {
  console.log("Server running on port 5000");
});