/*
  FOCO — aplicativo de estudos, produtividade e casal.
  Sem framework: HTML + CSS + JavaScript + localStorage.
  O Firebase é opcional e serve apenas para sincronizar o módulo de casal.
*/

import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getDatabase,
  ref,
  set,
  update,
  get,
  onValue,
  onDisconnect,
  push
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";

import { FIREBASE_CONFIG, FIREBASE_ENABLED } from "./firebase-config.js";

/* ---------- utilidades ---------- */
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const STORAGE = {
  sessions: "foco_sessions_v1",
  tasks: "foco_tasks_v1",
  couple: "foco_couple_v1",
  timer: "foco_timer_v1"
};

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function pad(n) {
  return String(Math.floor(n)).padStart(2, "0");
}

function formatHMS(seconds) {
  seconds = Math.max(0, Math.floor(seconds || 0));
  return `${pad(seconds / 3600)}:${pad((seconds % 3600) / 60)}:${pad(seconds % 60)}`;
}

function formatHM(seconds) {
  seconds = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${pad(h)}h ${pad(m)}m`;
}

function startOfDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfWeek(date = new Date()) {
  const d = startOfDay(date);
  const day = d.getDay(); // 0 = domingo
  const diff = day === 0 ? 6 : day - 1; // segunda-feira
  d.setDate(d.getDate() - diff);
  return d;
}

function isToday(timestamp) {
  return startOfDay(new Date(timestamp)).getTime() === startOfDay().getTime();
}

function isThisWeek(timestamp) {
  return new Date(timestamp) >= startOfWeek();
}

function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 2400);
}

function randomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

/* ---------- navegação ---------- */
$$(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    const view = tab.dataset.view;
    $$(".tab").forEach((t) => t.classList.toggle("active", t === tab));
    $$(".view").forEach((section) => section.classList.toggle("active", section.id === `view-${view}`));
    if (view === "tasks") renderTasks();
    if (view === "couple") renderCouple();
    if (view === "dates") renderDateBank();
    if (view === "rescue") renderRescue();
  });
});

/* ---------- PWA install ---------- */
let deferredInstallPrompt = null;
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  $("#installBtn").hidden = false;
});

$("#installBtn").addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  $("#installBtn").hidden = true;
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(console.warn));
}

/* ---------- MÓDULO 1: TIMER LIVRE ---------- */
let timer = load(STORAGE.timer, {
  status: "idle",       // idle | studying | resting | paused
  studySeconds: 0,
  restSeconds: 0,
  startedAt: null,
  restStartedAt: null,
  subject: "",
  reason: ""
});

let timerInterval = null;

function effectiveStudySeconds() {
  if (timer.status === "studying" && timer.startedAt) {
    return timer.studySeconds + Math.floor((Date.now() - timer.startedAt) / 1000);
  }
  return timer.studySeconds;
}

function effectiveRestSeconds() {
  if (timer.status === "resting" && timer.restStartedAt) {
    return timer.restSeconds + Math.floor((Date.now() - timer.restStartedAt) / 1000);
  }
  return timer.restSeconds;
}

function persistTimer() {
  save(STORAGE.timer, timer);
}

function updateTimerUI() {
  const study = effectiveStudySeconds();
  const rest = effectiveRestSeconds();

  $("#studyTimer").textContent = formatHMS(study);
  $("#restTimer").textContent = formatHMS(rest).slice(3);
  $("#studyModePill").classList.toggle("active", timer.status !== "resting");
  $("#restModePill").classList.toggle("active", timer.status === "resting");

  const live = timer.status === "studying";
  $("#liveDot").hidden = !live;

  if (timer.status === "idle") $("#focusStatus").textContent = "📖 pronta pra estudar";
  if (timer.status === "studying") $("#focusStatus").textContent = `📖 estudando • ${timer.subject || "sem matéria"}`;
  if (timer.status === "resting") $("#focusStatus").textContent = "☕ pausa automática";
  if (timer.status === "paused") $("#focusStatus").textContent = "⏸️ estudo pausado";

  const startBtn = $("#startPauseBtn");
  if (timer.status === "idle") startBtn.textContent = "▶ Começar";
  if (timer.status === "studying") startBtn.textContent = "Ⅱ Pausar";
  if (timer.status === "resting") startBtn.textContent = "▶ Continuar estudo";
  if (timer.status === "paused") startBtn.textContent = "▶ Continuar estudo";

  $("#finishBtn").disabled = timer.status === "idle";
  $("#subjectInput").value = timer.subject;
  $("#reasonInput").value = timer.reason;

  $("#rescueDynamicReason").textContent = timer.reason
    ? `Agora: “${timer.reason}”`
    : "Seu motivo aparece aqui quando você iniciar uma sessão.";

  renderStudyStats();
}

function tick() {
  updateTimerUI();
  if (timer.status === "studying" || timer.status === "resting") persistTimer();
}

function startTicker() {
  clearInterval(timerInterval);
  timerInterval = setInterval(tick, 1000);
}

function requireSessionFields() {
  const subject = $("#subjectInput").value.trim();
  const reason = $("#reasonInput").value.trim();

  if (!subject || !reason) {
    toast("Preencha matéria e motivo antes de começar.");
    return false;
  }
  timer.subject = subject;
  timer.reason = reason;
  return true;
}

function startStudy() {
  if (!requireSessionFields()) return;

  if (timer.status === "idle") {
    timer.studySeconds = 0;
    timer.restSeconds = 0;
  }

  if (timer.status === "resting") {
    timer.restSeconds = effectiveRestSeconds();
    timer.restStartedAt = null;
  }

  if (timer.status === "paused") {
    timer.startedAt = Date.now();
  } else {
    timer.startedAt = Date.now();
  }

  timer.status = "studying";
  persistTimer();
  startTicker();
  updateTimerUI();
  syncPresence(true);
}

function pauseStudy() {
  timer.studySeconds = effectiveStudySeconds();
  timer.startedAt = null;

  // O descanso começa automaticamente ao pausar.
  timer.restStartedAt = Date.now();
  timer.status = "resting";

  persistTimer();
  startTicker();
  updateTimerUI();
  syncPresence(false);
  toast("Pausa iniciada automaticamente. ☕");
}

function finishSession({ showToast = true } = {}) {
  const studySeconds = effectiveStudySeconds();

  if (studySeconds > 0) {
    const session = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      subject: timer.subject || "Estudo",
      reason: timer.reason || "",
      seconds: studySeconds,
      createdAt: Date.now()
    };

    const sessions = load(STORAGE.sessions, []);
    sessions.unshift(session);
    save(STORAGE.sessions, sessions.slice(0, 200));
    syncSessionToFirebase(session);

    if (showToast) toast(`Sessão salva: ${formatHMS(studySeconds)}. ✨`);
  }

  timer = {
    status: "idle",
    studySeconds: 0,
    restSeconds: 0,
    startedAt: null,
    restStartedAt: null,
    subject: "",
    reason: ""
  };

  persistTimer();
  clearInterval(timerInterval);
  syncPresence(false);
  updateTimerUI();
  renderSessions();
}

$("#startPauseBtn").addEventListener("click", () => {
  if (timer.status === "studying") pauseStudy();
  else startStudy();
});

$("#finishBtn").addEventListener("click", () => finishSession());

$("#resetBtn").addEventListener("click", () => {
  if (timer.status !== "idle" && !confirm("Zerar a sessão atual? O tempo não será salvo.")) return;
  timer = {
    status: "idle",
    studySeconds: 0,
    restSeconds: 0,
    startedAt: null,
    restStartedAt: null,
    subject: "",
    reason: ""
  };
  persistTimer();
  updateTimerUI();
});

$("#subjectInput").addEventListener("input", (e) => {
  timer.subject = e.target.value;
  persistTimer();
});
$("#reasonInput").addEventListener("input", (e) => {
  timer.reason = e.target.value;
  persistTimer();
});

$("#clearSessionsBtn").addEventListener("click", () => {
  if (!confirm("Apagar todo o histórico local de sessões?")) return;
  save(STORAGE.sessions, []);
  renderSessions();
  renderStudyStats();
  toast("Histórico apagado.");
});

function renderSessions() {
  const sessions = load(STORAGE.sessions, []);
  const container = $("#sessionList");

  if (!sessions.length) {
    container.innerHTML = `<div class="empty-state">Nenhuma sessão encerrada ainda.</div>`;
    return;
  }

  container.innerHTML = sessions.slice(0, 8).map((s) => `
    <div class="session-item">
      <div>
        <div class="session-title">${escapeHtml(s.subject)}</div>
        <div class="session-meta">${escapeHtml(s.reason || "sem motivo")} · ${new Date(s.createdAt).toLocaleDateString("pt-BR")}</div>
      </div>
      <div class="session-duration">${formatHMS(s.seconds)}</div>
    </div>
  `).join("");
}

function renderStudyStats() {
  const sessions = load(STORAGE.sessions, []);
  const today = sessions.filter(s => isToday(s.createdAt)).reduce((sum, s) => sum + s.seconds, 0);
  const week = sessions.filter(s => isThisWeek(s.createdAt)).reduce((sum, s) => sum + s.seconds, 0);

  // Inclui a sessão atual no indicador, mesmo antes de encerrá-la.
  const current = effectiveStudySeconds();
  $("#todayStudy").textContent = formatHMS(today + (isToday(Date.now()) ? current : 0));
  $("#weekStudy").textContent = formatHMS(week + current);
  $("#taskStudySummary").textContent = `${formatHMS(today + current)} estudadas`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* ---------- MÓDULO 2: TAREFAS ---------- */
function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function getTasks() {
  const all = load(STORAGE.tasks, {});
  return all[todayKey()] || [];
}

function saveTasks(tasks) {
  const all = load(STORAGE.tasks, {});
  all[todayKey()] = tasks;
  save(STORAGE.tasks, all);
}

function renderTasks() {
  const tasks = getTasks();
  const done = tasks.filter(t => t.done).length;
  const percent = tasks.length ? Math.round((done / tasks.length) * 100) : 0;

  $("#taskProgressText").textContent = `${percent}%`;
  $("#taskProgressBar").style.width = `${percent}%`;
  $("#taskCountText").textContent = `${done} de ${tasks.length} concluídas`;

  const container = $("#taskList");
  if (!tasks.length) {
    container.innerHTML = `<div class="empty-state">Adicione uma meta pequena e concreta para começar.</div>`;
    return;
  }

  container.innerHTML = tasks.map((task) => `
    <div class="task-item ${task.done ? "done" : ""}" data-id="${task.id}">
      <input class="task-check" type="checkbox" ${task.done ? "checked" : ""} aria-label="Concluir tarefa">
      <span class="task-label">${escapeHtml(task.text)}</span>
      <button class="delete-task" title="Excluir">×</button>
    </div>
  `).join("");

  container.querySelectorAll(".task-check").forEach((check) => {
    check.addEventListener("change", (e) => {
      const item = e.target.closest(".task-item");
      const id = item.dataset.id;
      const updated = getTasks().map(t => t.id === id ? { ...t, done: e.target.checked } : t);
      saveTasks(updated);
      renderTasks();
    });
  });

  container.querySelectorAll(".delete-task").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.closest(".task-item").dataset.id;
      saveTasks(getTasks().filter(t => t.id !== id));
      renderTasks();
    });
  });
}

function addTask() {
  const input = $("#taskInput");
  const text = input.value.trim();
  if (!text) return;

  const tasks = getTasks();
  tasks.push({
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    text,
    done: false
  });
  saveTasks(tasks);
  input.value = "";
  renderTasks();
  toast("Meta adicionada. 🎀");
}

$("#addTaskBtn").addEventListener("click", addTask);
$("#taskInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") addTask();
});
$("#clearDoneBtn").addEventListener("click", () => {
  saveTasks(getTasks().filter(t => !t.done));
  renderTasks();
});

/* ---------- MÓDULO 4: ENCONTROS ---------- */
const DATE_IDEAS = [
  { title: "Caminhada + sorvete", description: "Escolham um lugar agradável, caminhem sem pressa e terminem com sorvete.", budget: 0, label: "gratuito + pequeno gasto" },
  { title: "Piquenique no parque", description: "Cada um leva uma coisa de casa e vocês montam um lanche simples ao ar livre.", budget: 0, label: "R$ 0–50" },
  { title: "Noite de filmes em casa", description: "Escolham um filme cada, façam pipoca e criem uma pequena sessão temática.", budget: 0, label: "R$ 0–30" },
  { title: "Café + livraria", description: "Visitem uma livraria e depois escolham uma cafeteria tranquila para conversar.", budget: 50, label: "até R$ 50" },
  { title: "Museu + café", description: "Visitem uma exposição e reservem um tempo para conversar sobre o que viram.", budget: 50, label: "até R$ 50–80" },
  { title: "Desafio de cozinhar juntos", description: "Escolham uma receita nova e dividam as etapas como uma pequena equipe.", budget: 50, label: "até R$ 50" },
  { title: "Jantar + passeio", description: "Escolham um restaurante que vocês ainda não conhecem e façam um passeio depois.", budget: 100, label: "R$ 51–100" },
  { title: "Experiência cultural", description: "Procurem uma peça, exposição, cinema especial ou evento cultural.", budget: 100, label: "R$ 51–100" },
  { title: "Restaurante diferente", description: "Escolham uma culinária que nenhum dos dois costuma pedir e experimentem juntos.", budget: 101, label: "mais de R$ 100" },
  { title: "Day date especial", description: "Planejem uma experiência maior: brunch, atividade, passeio e jantar.", budget: 101, label: "mais de R$ 100" }
];

let selectedBudget = 0;

$$(".budget-option").forEach((button) => {
  button.addEventListener("click", () => {
    selectedBudget = Number(button.dataset.budget);
    $$(".budget-option").forEach(b => b.classList.toggle("active", b === button));
  });
});

function budgetMatches(item) {
  if (selectedBudget === 0) return item.budget === 0;
  if (selectedBudget === 50) return item.budget <= 50;
  if (selectedBudget === 100) return item.budget === 100;
  return item.budget === 101;
}

function drawDate() {
  const options = DATE_IDEAS.filter(budgetMatches);
  const chosen = options[Math.floor(Math.random() * options.length)] || DATE_IDEAS[0];

  $("#dateTitle").textContent = chosen.title;
  $("#dateDescription").textContent = chosen.description;
  $("#dateMeta").textContent = `Faixa: ${chosen.label}`;
  $("#dateResult").animate?.(
    [{ transform: "scale(.98)", opacity: .6 }, { transform: "scale(1)", opacity: 1 }],
    { duration: 260, easing: "ease-out" }
  );
}

function renderDateBank() {
  $("#dateBank").innerHTML = DATE_IDEAS.map(item => `
    <div class="date-bank-item">
      <strong>${item.title}</strong>
      <span>${item.label}</span>
    </div>
  `).join("");
}

$("#drawDateBtn").addEventListener("click", drawDate);

/* ---------- MÓDULO 5: RESGATE ---------- */
const RESCUE_PHRASES = [
  "Você não precisa estudar perfeitamente. Precisa apenas voltar ao próximo bloco de conteúdo.",
  "Cansaço é informação, não uma sentença sobre a sua capacidade.",
  "A sessão de hoje não precisa ser heroica para ser útil.",
  "Se o problema é começar, reduza o próximo passo até ele ficar pequeno o suficiente para executar."
];

function renderRescue() {
  const phrase = RESCUE_PHRASES[Math.floor(Math.random() * RESCUE_PHRASES.length)];
  $("#rescuePhrase").textContent = phrase;
  $("#rescueDynamicReason").textContent = timer.reason
    ? `Agora: “${timer.reason}”`
    : "Seu motivo aparece aqui quando você iniciar uma sessão.";
}

$("#returnToStudyBtn").addEventListener("click", () => {
  $$(".tab").find(t => t.dataset.view === "focus").click();
});

$("#restWithoutGuiltBtn").addEventListener("click", () => {
  if (timer.status !== "idle") finishSession({ showToast: true });
  toast("Sessão salva. Descanse sem transformar descanso em culpa.");
  $$(".tab").find(t => t.dataset.view === "focus").click();
});

/* ---------- MÓDULO 3: FIREBASE / CASAL ---------- */
let firebase = {
  enabled: false,
  app: null,
  auth: null,
  db: null,
  uid: null,
  roomId: null,
  unsubRoom: null,
  connected: false
};

async function initFirebase() {
  if (!FIREBASE_ENABLED) return;

  try {
    firebase.app = initializeApp(FIREBASE_CONFIG);
    firebase.auth = getAuth(firebase.app);
    firebase.db = getDatabase(firebase.app);

    onAuthStateChanged(firebase.auth, async (user) => {
      if (!user) return;
      firebase.uid = user.uid;
      await restoreCoupleRoom();
    });

    await signInAnonymously(firebase.auth);
  } catch (error) {
    console.warn("Firebase não inicializado:", error);
    toast("Modo local ativo. Configure o Firebase para sincronizar o casal.");
  }
}

async function restoreCoupleRoom() {
  const couple = load(STORAGE.couple, null);
  if (couple?.roomId) {
    firebase.roomId = couple.roomId;
    $("#myNameInput").value = couple.name || "";
    $("#roomInput").value = couple.roomId;
    await connectToRoom();
  }
}

function setCoupleUI(connected) {
  $("#coupleSetup").hidden = connected;
  $("#coupleDashboard").hidden = !connected;
}

async function connectToRoom() {
  const name = $("#myNameInput").value.trim() || "Você";
  const roomId = $("#roomInput").value.trim().toUpperCase();

  if (!roomId) {
    toast("Informe ou gere um código de casal.");
    return;
  }

  save(STORAGE.couple, { name, roomId });
  firebase.roomId = roomId;
  $("#roomLabel").textContent = roomId;
  $("#meName").textContent = name;
  setCoupleUI(true);

  if (!FIREBASE_ENABLED || !firebase.db || !firebase.uid) {
    $("#firebaseStatus").textContent = "somente local";
    $("#liveMessage").textContent = "Firebase ainda não configurado. O seu placar local funciona, mas não é compartilhado.";
    renderCouple();
    return;
  }

  try {
    const base = ref(firebase.db, `rooms/${roomId}/users/${firebase.uid}`);
    await update(base, {
      name,
      updatedAt: Date.now()
    });

    const presenceRef = ref(firebase.db, `rooms/${roomId}/presence/${firebase.uid}`);
    await onDisconnect(presenceRef).set({
      online: false,
      studying: false,
      updatedAt: Date.now()
    });

    firebase.unsubRoom?.();
    firebase.unsubRoom = onValue(ref(firebase.db, `rooms/${roomId}`), (snapshot) => {
      const data = snapshot.val() || {};
      firebase.connected = true;
      $("#firebaseStatus").textContent = "ao vivo";
      renderRemoteCouple(data);
    });

    await set(presenceRef, {
      online: true,
      studying: timer.status === "studying",
      updatedAt: Date.now()
    });

    toast("Sala conectada. 💘");
  } catch (error) {
    console.error(error);
    $("#firebaseStatus").textContent = "erro";
    toast("Não foi possível acessar a sala. Confira o Firebase.");
  }
}

function syncPresence(studying) {
  if (!FIREBASE_ENABLED || !firebase.db || !firebase.uid || !firebase.roomId) return;

  set(ref(firebase.db, `rooms/${firebase.roomId}/presence/${firebase.uid}`), {
    online: true,
    studying,
    updatedAt: Date.now()
  }).catch(console.warn);
}

function syncSessionToFirebase(session) {
  if (!FIREBASE_ENABLED || !firebase.db || !firebase.uid || !firebase.roomId) return;

  const sessionRef = push(ref(firebase.db, `rooms/${firebase.roomId}/sessions`));
  set(sessionRef, {
    uid: firebase.uid,
    name: load(STORAGE.couple, {})?.name || "Você",
    seconds: session.seconds,
    createdAt: session.createdAt,
    subject: session.subject
  }).catch(console.warn);
}

function renderRemoteCouple(data) {
  const users = data.users || {};
  const presence = data.presence || {};
  const sessions = Object.values(data.sessions || {});

  const myId = firebase.uid;
  const others = Object.entries(users).filter(([id]) => id !== myId);

  const me = users[myId] || { name: load(STORAGE.couple, {})?.name || "Você" };
  const partner = others.length ? others[0][1] : null;
  const partnerId = others.length ? others[0][0] : null;

  $("#meName").textContent = me.name || "Você";
  $("#partnerName").textContent = partner?.name || "Seu namorado";

  const mySeconds = sessions
    .filter(s => s.uid === myId && isThisWeek(s.createdAt))
    .reduce((sum, s) => sum + Number(s.seconds || 0), 0);

  const partnerSeconds = sessions
    .filter(s => s.uid === partnerId && isThisWeek(s.createdAt))
    .reduce((sum, s) => sum + Number(s.seconds || 0), 0);

  $("#meWeek").textContent = formatHM(mySeconds + effectiveStudySeconds());
  $("#partnerWeek").textContent = formatHM(partnerSeconds);

  const mePresence = presence[myId];
  const partnerPresence = partnerId ? presence[partnerId] : null;

  setPresence("#meLive", mePresence?.online, mePresence?.studying);
  setPresence("#partnerLive", partnerPresence?.online, partnerPresence?.studying);

  if (!partner) {
    $("#liveMessage").textContent = "Seu namorado ainda não entrou nesta sala.";
  } else if (partnerPresence?.online && partnerPresence?.studying) {
    $("#liveMessage").innerHTML = `💘 <strong>${escapeHtml(partner.name || "Seu namorado")}</strong> está estudando agora.`;
  } else if (partnerPresence?.online) {
    $("#liveMessage").innerHTML = `🌙 <strong>${escapeHtml(partner.name || "Seu namorado")}</strong> está online, mas não está em uma sessão de estudo.`;
  } else {
    $("#liveMessage").innerHTML = `☁️ <strong>${escapeHtml(partner.name || "Seu namorado")}</strong> está offline.`;
  }
}

function setPresence(selector, online, studying) {
  const el = $(selector);
  el.className = `presence ${online ? "live" : "offline"}`;
  el.textContent = studying ? "● estudando" : online ? "● online" : "offline";
}

function renderCouple() {
  const couple = load(STORAGE.couple, null);
  if (couple?.roomId) {
    $("#myNameInput").value = couple.name || "";
    $("#roomInput").value = couple.roomId;
    $("#roomLabel").textContent = couple.roomId;
  }

  // Sem Firebase, ainda mostramos o próprio total semanal.
  if (!FIREBASE_ENABLED) {
    const sessions = load(STORAGE.sessions, []);
    const week = sessions.filter(s => isThisWeek(s.createdAt)).reduce((sum, s) => sum + s.seconds, 0);
    $("#meWeek").textContent = formatHM(week + effectiveStudySeconds());
  }
}

$("#generateRoomBtn").addEventListener("click", () => {
  $("#roomInput").value = randomCode();
});

$("#connectCoupleBtn").addEventListener("click", connectToRoom);

$("#disconnectBtn").addEventListener("click", () => {
  firebase.unsubRoom?.();
  firebase.roomId = null;
  localStorage.removeItem(STORAGE.couple);
  setCoupleUI(false);
  toast("Sala desconectada.");
});

/* ---------- inicialização ---------- */
function init() {
  renderSessions();
  renderTasks();
  renderDateBank();
  renderRescue();
  updateTimerUI();
  startTicker();
  initFirebase();

  // Se o navegador for fechado durante uma sessão, o timestamp permite recuperar o tempo.
  if (timer.status === "studying" || timer.status === "resting") {
    toast("Sessão anterior recuperada. O tempo continua contando.");
  }
}

init();
