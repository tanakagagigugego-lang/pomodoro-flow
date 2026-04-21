const DEFAULTS = {
  workMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 20,
  cyclesBeforeLongBreak: 4,
};

const sessionLabels = {
  work: "Work",
  shortBreak: "Short break",
  longBreak: "Long break",
};

const SOUND_STORAGE_KEY = "pomodoroSoundEnabled";
const AUTO_START_STORAGE_KEY = "pomodoroAutoStartEnabled";

const elements = {
  sessionName: document.getElementById("sessionName"),
  cycleCount: document.getElementById("cycleCount"),
  timeText: document.getElementById("timeText"),
  progressRing: document.getElementById("progressRing"),
  startPauseButton: document.getElementById("startPauseButton"),
  skipButton: document.getElementById("skipButton"),
  resetButton: document.getElementById("resetButton"),
  soundButton: document.getElementById("soundButton"),
  autoStartButton: document.getElementById("autoStartButton"),
  completedCount: document.getElementById("completedCount"),
  nextSession: document.getElementById("nextSession"),
  workMinutes: document.getElementById("workMinutes"),
  shortBreakMinutes: document.getElementById("shortBreakMinutes"),
  longBreakMinutes: document.getElementById("longBreakMinutes"),
  cyclesBeforeLongBreak: document.getElementById("cyclesBeforeLongBreak"),
  applySettingsButton: document.getElementById("applySettingsButton"),
};

const ringRadius = Number(elements.progressRing.getAttribute("r"));
const ringCircumference = 2 * Math.PI * ringRadius;

elements.progressRing.style.strokeDasharray = `${ringCircumference}`;

const state = {
  settings: { ...DEFAULTS },
  sessionType: "work",
  timeRemaining: DEFAULTS.workMinutes * 60,
  totalDuration: DEFAULTS.workMinutes * 60,
  completedPomodoros: 0,
  currentCycle: 1,
  timerId: null,
  running: false,
  soundEnabled: localStorage.getItem(SOUND_STORAGE_KEY) !== "false",
  autoStartEnabled: localStorage.getItem(AUTO_START_STORAGE_KEY) === "true",
  audioContext: null,
};

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function durationFor(sessionType) {
  if (sessionType === "work") {
    return state.settings.workMinutes * 60;
  }

  if (sessionType === "shortBreak") {
    return state.settings.shortBreakMinutes * 60;
  }

  return state.settings.longBreakMinutes * 60;
}

function nextSessionType() {
  if (state.sessionType === "work") {
    return state.currentCycle % state.settings.cyclesBeforeLongBreak === 0 ? "longBreak" : "shortBreak";
  }

  return "work";
}

function updateProgress() {
  const progress = state.totalDuration === 0 ? 0 : state.timeRemaining / state.totalDuration;
  const offset = ringCircumference * (1 - progress);
  elements.progressRing.style.strokeDashoffset = `${offset}`;
}

function updateLabels() {
  elements.sessionName.textContent = sessionLabels[state.sessionType];
  elements.cycleCount.textContent = `${Math.min(state.currentCycle, state.settings.cyclesBeforeLongBreak)} / ${state.settings.cyclesBeforeLongBreak}`;
  elements.timeText.textContent = formatTime(state.timeRemaining);
  elements.completedCount.textContent = String(state.completedPomodoros);
  elements.nextSession.textContent = sessionLabels[nextSessionType()];
  elements.startPauseButton.textContent = state.running ? "Pause" : "Start";
  elements.soundButton.textContent = `Sound: ${state.soundEnabled ? "ON" : "OFF"}`;
  elements.autoStartButton.textContent = `Auto start: ${state.autoStartEnabled ? "ON" : "OFF"}`;
  document.title = `${formatTime(state.timeRemaining)} | ${sessionLabels[state.sessionType]}`;
  updateProgress();
}

function getAudioContext() {
  if (!state.audioContext) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    state.audioContext = AudioContext ? new AudioContext() : null;
  }

  return state.audioContext;
}

function unlockSound() {
  const audioContext = getAudioContext();
  if (audioContext && audioContext.state === "suspended") {
    audioContext.resume();
  }
}

function playNotificationSound() {
  if (!state.soundEnabled) {
    return;
  }

  const audioContext = getAudioContext();
  if (!audioContext) {
    return;
  }

  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  const now = audioContext.currentTime;

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(880, now);
  gainNode.gain.setValueAtTime(0.0001, now);
  gainNode.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.2);
}

function clearTimer() {
  if (state.timerId !== null) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
}

function switchSession(nextType, shouldAutoStart = false) {
  clearTimer();
  state.running = false;

  if (state.sessionType === "work" && nextType !== "work") {
    state.completedPomodoros += 1;
  } else if (state.sessionType !== "work" && nextType === "work") {
    state.currentCycle = state.currentCycle % state.settings.cyclesBeforeLongBreak + 1;
  }

  state.sessionType = nextType;
  state.totalDuration = durationFor(nextType);
  state.timeRemaining = state.totalDuration;
  updateLabels();
  playNotificationSound();

  if (shouldAutoStart && state.autoStartEnabled) {
    startTimer();
  }
}

function tick() {
  if (state.timeRemaining > 0) {
    state.timeRemaining -= 1;
    updateLabels();
    return;
  }

  switchSession(nextSessionType(), true);
}

function startTimer() {
  if (state.running) {
    return;
  }

  state.running = true;
  state.timerId = setInterval(tick, 1000);
  updateLabels();
}

function pauseTimer() {
  clearTimer();
  state.running = false;
  updateLabels();
}

function resetCurrentSession() {
  pauseTimer();
  state.timeRemaining = durationFor(state.sessionType);
  state.totalDuration = state.timeRemaining;
  updateLabels();
}

function applySettings() {
  const nextSettings = {
    workMinutes: Number(elements.workMinutes.value),
    shortBreakMinutes: Number(elements.shortBreakMinutes.value),
    longBreakMinutes: Number(elements.longBreakMinutes.value),
    cyclesBeforeLongBreak: Number(elements.cyclesBeforeLongBreak.value),
  };

  const invalidValue = Object.values(nextSettings).some((value) => !Number.isFinite(value) || value < 1);
  if (invalidValue) {
    window.alert("Please enter values greater than or equal to 1.");
    return;
  }

  state.settings = nextSettings;
  state.currentCycle = Math.min(state.currentCycle, state.settings.cyclesBeforeLongBreak);
  resetCurrentSession();
}

elements.startPauseButton.addEventListener("click", () => {
  unlockSound();

  if (state.running) {
    pauseTimer();
  } else {
    startTimer();
  }
});

elements.skipButton.addEventListener("click", () => {
  switchSession(nextSessionType());
});

elements.resetButton.addEventListener("click", () => {
  pauseTimer();
  state.sessionType = "work";
  state.currentCycle = 1;
  state.completedPomodoros = 0;
  state.totalDuration = durationFor("work");
  state.timeRemaining = state.totalDuration;
  updateLabels();
});

elements.soundButton.addEventListener("click", () => {
  state.soundEnabled = !state.soundEnabled;
  localStorage.setItem(SOUND_STORAGE_KEY, String(state.soundEnabled));

  if (state.soundEnabled) {
    unlockSound();
  }

  updateLabels();
});

elements.autoStartButton.addEventListener("click", () => {
  state.autoStartEnabled = !state.autoStartEnabled;
  localStorage.setItem(AUTO_START_STORAGE_KEY, String(state.autoStartEnabled));
  updateLabels();
});

elements.applySettingsButton.addEventListener("click", applySettings);

Object.entries(DEFAULTS).forEach(([key, value]) => {
  if (elements[key]) {
    elements[key].value = String(value);
  }
});

updateLabels();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js");
  });
}
