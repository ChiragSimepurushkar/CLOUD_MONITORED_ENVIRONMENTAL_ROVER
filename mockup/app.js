// App Mockup Logic

// State management
let connectionMode = 'simulated'; // 'simulated' or 'server'
let serverUrl = 'http://localhost:3000';
let simulationState = {
  temp: 24,
  humidity: 55,
  gas: 120,
  isOnline: true,
  command: 'stop',
  ledStatus: 'off',
  autoMode: false
};

let pollInterval = null;
let alertActive = false;
let lastSpeechTime = 0;

// DOM Elements
const elStatusText = document.getElementById('status-text');
const elStatusIndicator = document.getElementById('connection-status');
const elTemp = document.getElementById('temp-value');
const elHumidity = document.getElementById('humidity-value');
const elGas = document.getElementById('gas-value');
const elGasProgress = document.getElementById('gas-progress');
const elGasStatus = document.getElementById('gas-status');

// Controls
const btnForward = document.getElementById('btn-forward');
const btnLeft = document.getElementById('btn-left');
const btnStop = document.getElementById('btn-stop');
const btnRight = document.getElementById('btn-right');
const btnBackward = document.getElementById('btn-backward');
const btnLed = document.getElementById('btn-led');
const btnAuto = document.getElementById('btn-auto');

// Vibration Overlay
const elVibrationOverlay = document.getElementById('vibration-overlay');
const elPhoneScreen = document.querySelector('.phone-screen');

// Sim Sliders
const sliderTemp = document.getElementById('slider-temp');
const sliderHumidity = document.getElementById('slider-humidity');
const sliderGas = document.getElementById('slider-gas');
const checkOnline = document.getElementById('check-online');
const lblSimTemp = document.getElementById('sim-temp-lbl');
const lblSimHumidity = document.getElementById('sim-humidity-lbl');
const lblSimGas = document.getElementById('sim-gas-lbl');

// Mode Toggles
const btnModeSim = document.getElementById('mode-sim');
const btnModeServer = document.getElementById('mode-server');
const serverUrlContainer = document.getElementById('server-url-container');
const txtServerUrl = document.getElementById('server-url');

// Debug Panels
const elDebugCommand = document.getElementById('debug-command');
const elDebugLed = document.getElementById('debug-led');
const elDebugAuto = document.getElementById('debug-auto');
const elLogContent = document.getElementById('log-content');

// Helper: Log message to the virtual console
function logDebug(message) {
  const timestamp = new Date().toLocaleTimeString();
  const logLine = `[${timestamp}] ${message}\n`;
  elLogContent.textContent = logLine + elLogContent.textContent;
  
  // Keep logs readable
  if (elLogContent.textContent.split('\n').length > 20) {
    elLogContent.textContent = elLogContent.textContent.split('\n').slice(0, 20).join('\n');
  }
}

// Update UI display based on current state values
function updateUI(data) {
  // Update numbers
  elTemp.textContent = `${data.temp}°C`;
  elHumidity.textContent = `${data.humidity}%`;
  elGas.textContent = `${data.gas} ppm`;
  
  // Update progress bar
  const percent = Math.min((data.gas / 800) * 100, 100);
  elGasProgress.style.width = `${percent}%`;
  
  // Set color and text for gas levels
  elGasStatus.className = 'gas-status-label';
  if (data.gas > 300) {
    elGasStatus.textContent = 'Danger';
    elGasStatus.classList.add('status-danger');
    elGasProgress.style.backgroundColor = 'var(--accent-red)';
    triggerDangerAlert(true, data.gas);
  } else if (data.gas > 200) {
    elGasStatus.textContent = 'Warning';
    elGasStatus.classList.add('status-warning');
    elGasProgress.style.backgroundColor = 'var(--accent-warning)';
    triggerDangerAlert(false);
  } else {
    elGasStatus.textContent = 'Normal';
    elGasStatus.classList.add('status-normal');
    elGasProgress.style.backgroundColor = 'var(--accent-blue)';
    triggerDangerAlert(false);
  }

  // Update Status Banner
  if (data.isOnline) {
    elStatusIndicator.className = 'status-indicator online';
    elStatusText.textContent = '🟢 Online';
  } else {
    elStatusIndicator.className = 'status-indicator offline';
    elStatusText.textContent = '🔴 Offline';
  }

  // Update LED and Auto buttons
  if (data.ledStatus === 'on') {
    btnLed.className = 'action-btn led-btn-on';
    btnLed.querySelector('.action-text').textContent = 'LED: ON';
    elDebugLed.textContent = 'HIGH (ON)';
    elDebugLed.className = 'badge';
  } else {
    btnLed.className = 'action-btn led-btn-off';
    btnLed.querySelector('.action-text').textContent = 'LED: OFF';
    elDebugLed.textContent = 'LOW (OFF)';
    elDebugLed.className = 'badge text-gray';
  }

  if (data.autoMode) {
    btnAuto.className = 'action-btn auto-btn-on';
    btnAuto.querySelector('.action-text').textContent = 'Auto Mode: On';
    elDebugAuto.textContent = 'ENABLED';
    elDebugAuto.className = 'badge';
  } else {
    btnAuto.className = 'action-btn auto-btn-off';
    btnAuto.querySelector('.action-text').textContent = 'Auto Mode: Off';
    elDebugAuto.textContent = 'DISABLED';
    elDebugAuto.className = 'badge text-gray';
  }

  // Update D-Pad button visual states
  document.querySelectorAll('.control-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  
  elDebugCommand.textContent = data.command.toUpperCase();
  
  if (data.command !== 'stop') {
    const activeBtn = document.querySelector(`[data-cmd="${data.command}"]`);
    if (activeBtn) activeBtn.classList.add('active');
    elDebugCommand.className = 'badge';
  } else {
    btnStop.classList.add('active');
    elDebugCommand.className = 'badge text-gray';
  }
}

// Danger Alerts (Vibration & Text-to-Speech)
function triggerDangerAlert(activate, gasVal = 0) {
  if (activate) {
    if (!alertActive) {
      alertActive = true;
      elVibrationOverlay.classList.add('vibration-flash');
      elPhoneScreen.classList.add('vibrate-screen');
      logDebug(`🚨 ALERT: High Gas detected! App notifier triggered.`);
    }
    
    // Trigger true phone vibration API (if browser supports it)
    if (navigator.vibrate) {
      navigator.vibrate(300);
    }
    
    // Voice Warning (Text-to-Speech) — throttle to speak once every 8 seconds
    const now = Date.now();
    if (now - lastSpeechTime > 8000) {
      lastSpeechTime = now;
      if ('speechSynthesis' in window) {
        const text = `Danger! Warning. Gas levels are dangerous at ${gasVal} parts per million. Evacuate area.`;
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.0;
        window.speechSynthesis.speak(utterance);
        logDebug(`🔊 TTS: Speaking voice warning...`);
      }
    }
  } else {
    if (alertActive) {
      alertActive = false;
      elVibrationOverlay.classList.remove('vibration-flash');
      elPhoneScreen.classList.remove('vibrate-screen');
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      logDebug(`✅ Gas levels returned to normal. Alert cleared.`);
    }
  }
}

// --- SIMULATED CLIENT OPERATIONS ---

function updateSimStateFromSliders() {
  simulationState.temp = parseFloat(sliderTemp.value);
  simulationState.humidity = parseFloat(sliderHumidity.value);
  simulationState.gas = parseInt(sliderGas.value);
  simulationState.isOnline = checkOnline.checked;
  
  lblSimTemp.textContent = `${simulationState.temp} °C`;
  lblSimHumidity.textContent = `${simulationState.humidity} %`;
  lblSimGas.textContent = `${simulationState.gas} ppm`;
  
  if (connectionMode === 'simulated') {
    updateUI(simulationState);
  }
}

// Handle control command clicks in local simulation
function handleSimControl(cmd) {
  simulationState.command = cmd;
  logDebug(`[Local SIM] Control D-Pad tapped: "${cmd.toUpperCase()}"`);
  updateUI(simulationState);
}

function handleSimLed() {
  simulationState.ledStatus = simulationState.ledStatus === 'on' ? 'off' : 'on';
  logDebug(`[Local SIM] LED toggled: "${simulationState.ledStatus.toUpperCase()}"`);
  updateUI(simulationState);
}

function handleSimAuto() {
  simulationState.autoMode = !simulationState.autoMode;
  logDebug(`[Local SIM] Auto Mode toggled: "${simulationState.autoMode ? 'ENABLED' : 'DISABLED'}"`);
  updateUI(simulationState);
}

// --- SERVER CONNECTED OPERATIONS ---

// Fetch state from local backend
async function fetchServerState() {
  try {
    const res = await fetch(`${serverUrl}/data`);
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    const data = await res.json();
    
    // Sync simulation sliders with actual server data to make it match
    sliderTemp.value = data.temp;
    sliderHumidity.value = data.humidity;
    sliderGas.value = data.gas;
    checkOnline.checked = data.isOnline;
    
    lblSimTemp.textContent = `${data.temp} °C`;
    lblSimHumidity.textContent = `${data.humidity} %`;
    lblSimGas.textContent = `${data.gas} ppm`;
    
    updateUI({
      temp: data.temp,
      humidity: data.humidity,
      gas: data.gas,
      isOnline: data.isOnline,
      command: data.currentCommand,
      ledStatus: data.ledStatus,
      autoMode: data.autoMode
    });
    
    logDebug(`[API] GET /data -> Sync successful (Status: ${data.isOnline ? 'Online' : 'Offline'})`);
  } catch (err) {
    logDebug(`[API ERROR] GET /data failed: ${err.message}`);
    // Show offline
    updateUI({
      temp: '--',
      humidity: '--',
      gas: 0,
      isOnline: false,
      command: 'stop',
      ledStatus: 'off',
      autoMode: false
    });
  }
}

// Send movement commands to backend
async function sendServerControl(cmd) {
  try {
    logDebug(`[API] Sending GET /control?cmd=${cmd}...`);
    const res = await fetch(`${serverUrl}/control?cmd=${cmd}`);
    const data = await res.json();
    if (data.success) {
      logDebug(`[API Response] 200 OK -> Current direction: ${data.currentCommand.toUpperCase()}`);
      fetchServerState(); // immediately refresh UI
    }
  } catch (err) {
    logDebug(`[API ERROR] GET /control failed: ${err.message}`);
  }
}

// Send LED toggles to backend
async function sendServerLed() {
  const nextLedState = btnLed.className.includes('led-btn-off') ? 'on' : 'off';
  try {
    logDebug(`[API] Sending POST /led?state=${nextLedState}...`);
    const res = await fetch(`${serverUrl}/led?state=${nextLedState}`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      logDebug(`[API Response] 200 OK -> LED: ${data.ledStatus.toUpperCase()}`);
      fetchServerState();
    }
  } catch (err) {
    logDebug(`[API ERROR] POST /led failed: ${err.message}`);
  }
}

// Send Auto Mode toggles to backend
async function sendServerAuto() {
  try {
    logDebug(`[API] Sending POST /auto...`);
    const res = await fetch(`${serverUrl}/auto`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      logDebug(`[API Response] 200 OK -> Auto Mode: ${data.autoMode ? 'ENABLED' : 'DISABLED'}`);
      fetchServerState();
    }
  } catch (err) {
    logDebug(`[API ERROR] POST /auto failed: ${err.message}`);
  }
}

// Helper: Push slider data to Server (mimics Chirag's Arduino sending sensor data)
async function pushSimulatedSensorToServer() {
  if (connectionMode !== 'server') return;
  
  try {
    const payload = {
      temp: parseFloat(sliderTemp.value),
      humidity: parseFloat(sliderHumidity.value),
      gas: parseInt(sliderGas.value)
    };
    
    logDebug(`[API] Posting Rover Data: ${JSON.stringify(payload)}`);
    const res = await fetch(`${serverUrl}/data`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    
    const data = await res.json();
    if (data.success) {
      logDebug(`[API Response] 200 OK -> Data posted. Rover synced.`);
    }
  } catch (err) {
    logDebug(`[API ERROR] Failed to send simulated data to server: ${err.message}`);
  }
}

// --- EVENT LISTENERS & SETUP ---

// Slider movements
sliderTemp.addEventListener('input', () => {
  updateSimStateFromSliders();
  if (connectionMode === 'server') pushSimulatedSensorToServer();
});
sliderHumidity.addEventListener('input', () => {
  updateSimStateFromSliders();
  if (connectionMode === 'server') pushSimulatedSensorToServer();
});
sliderGas.addEventListener('input', () => {
  updateSimStateFromSliders();
  if (connectionMode === 'server') pushSimulatedSensorToServer();
});
checkOnline.addEventListener('change', () => {
  updateSimStateFromSliders();
});

// Control Keys event handlers
document.querySelectorAll('.control-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const cmd = btn.getAttribute('data-cmd');
    if (connectionMode === 'simulated') {
      handleSimControl(cmd);
    } else {
      sendServerControl(cmd);
    }
  });
});

btnLed.addEventListener('click', () => {
  if (connectionMode === 'simulated') {
    handleSimLed();
  } else {
    sendServerLed();
  }
});

btnAuto.addEventListener('click', () => {
  if (connectionMode === 'simulated') {
    handleSimAuto();
  } else {
    sendServerAuto();
  }
});

// Keyboard hotkeys for WASD control & Space to STOP
document.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  let cmd = null;
  
  if (key === 'w' || key === 'arrowup') cmd = 'forward';
  else if (key === 'a' || key === 'arrowleft') cmd = 'left';
  else if (key === 's' || key === 'arrowdown') cmd = 'backward';
  else if (key === 'd' || key === 'arrowright') cmd = 'right';
  else if (key === ' ' || key === 'escape') cmd = 'stop';
  
  if (cmd) {
    e.preventDefault();
    if (connectionMode === 'simulated') {
      handleSimControl(cmd);
    } else {
      sendServerControl(cmd);
    }
  }
});

// Connection Mode selectors
btnModeSim.addEventListener('click', () => {
  connectionMode = 'simulated';
  btnModeSim.classList.add('active');
  btnModeServer.classList.remove('active');
  serverUrlContainer.classList.add('hidden');
  
  // Clear server polling
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  
  logDebug('Switched to simulated mode. Local controls enabled.');
  updateSimStateFromSliders();
});

btnModeServer.addEventListener('click', () => {
  connectionMode = 'server';
  btnModeServer.classList.add('active');
  btnModeSim.classList.remove('active');
  serverUrlContainer.classList.remove('hidden');
  serverUrl = txtServerUrl.value;
  
  logDebug(`Switched to connected mode. Connecting to ${serverUrl}...`);
  
  // Start server polling every 2s (same as MIT App Inventor Clock interval)
  if (pollInterval) clearInterval(pollInterval);
  fetchServerState();
  pollInterval = setInterval(fetchServerState, 2000);
});

txtServerUrl.addEventListener('change', () => {
  serverUrl = txtServerUrl.value;
  logDebug(`Server URL updated to: ${serverUrl}`);
  if (connectionMode === 'server') {
    fetchServerState();
  }
});

// Initial load
updateSimStateFromSliders();
logDebug('Rover Dashboard UI initialized.');
