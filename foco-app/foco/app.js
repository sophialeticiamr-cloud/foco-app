// ===== Módulo 1: Cronômetro livre =====
// status: "idle" (parado) | "study" (estudando) | "rest" (descansando)
// Usamos horários (Date.now) em vez de contar segundos, assim o tempo
// continua certo mesmo se a janela ficar em segundo plano.

const $ = (id) => document.getElementById(id);
const KEY_STATE = "foco_estado";
const KEY_LOG = "foco_sessoes";

const load = (k, padrao) => {
  try { return JSON.parse(localStorage.getItem(k)) ?? padrao; }
  catch { return padrao; }
};
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));

let s = load(KEY_STATE, { status: "idle", studyMs: 0, since: 0, materia: "", motivo: "" });
let log = load(KEY_LOG, []);

const pad = (n) => String(n).padStart(2, "0");
function fmt(ms) {
  const t = Math.floor(ms / 1000);
  return `${pad(Math.floor(t / 3600))}:${pad(Math.floor(t / 60) % 60)}:${pad(t % 60)}`;
}
const hoje = () => new Date().toLocaleDateString("sv-SE"); // AAAA-MM-DD

function studyNow() {
  return s.studyMs + (s.status === "study" ? Date.now() - s.since : 0);
}

function persist() { save(KEY_STATE, s); }

function main() {
  const agora = Date.now();
  if (s.status === "study") {            // pausar -> descanso começa sozinho
    s.studyMs += agora - s.since;
    s.status = "rest";
    s.since = agora;
  } else {                               // começar ou voltar a estudar
    const materia = $("materia").value.trim();
    if (!materia) {
      $("materia").classList.add("erro");
      $("materia").focus();
      setTimeout(() => $("materia").classList.remove("erro"), 400);
      return;
    }
    if (s.status === "idle") {
      s.studyMs = 0;
      s.materia = materia;
      s.motivo = $("motivo").value.trim();
    }
    s.status = "study";
    s.since = agora;
  }
  persist();
  render();
}

function finish() {
  const ms = studyNow();
  if (ms >= 1000) {
    log.push({ dia: hoje(), materia: s.materia, motivo: s.motivo, ms });
    save(KEY_LOG, log);
  }
  s = { status: "idle", studyMs: 0, since: 0, materia: "", motivo: "" };
  $("materia").value = "";
  $("motivo").value = "";
  persist();
  render();
}

function renderList() {
  const doDia = log.filter((x) => x.dia === hoje());
  $("total").textContent = fmt(doDia.reduce((a, x) => a + x.ms, 0) + (s.status !== "idle" ? studyNow() : 0));
  $("empty").hidden = doDia.length > 0;
  $("list").replaceChildren(...doDia.slice().reverse().map((x) => {
    const li = document.createElement("li");
    const nome = document.createElement("b");
    nome.textContent = x.materia;
    const tempo = document.createElement("span");
    tempo.textContent = fmt(x.ms);
    li.append(nome, tempo);
    return li;
  }));
}

const TEXTOS = {
  idle: ["📖 pronta pra estudar", "▶ Começar"],
  study: ["🌸 estudando…", "⏸ Pausar"],
  rest: ["☕ pausa — respira", "▶ Voltar a estudar"],
};

function render() {
  const [modo, botao] = TEXTOS[s.status];
  document.body.dataset.status = s.status;
  $("mode").textContent = modo;
  $("btnMain").textContent = botao;
  $("btnFinish").disabled = s.status === "idle";
  $("restBox").hidden = s.status !== "rest";
  for (const id of ["materia", "motivo"]) $(id).disabled = s.status !== "idle";
  if (s.status !== "idle") { $("materia").value = s.materia; $("motivo").value = s.motivo; }
  tick();
  renderList();
}

let ultimoTotal = "";
function tick() {
  const t = fmt(studyNow());
  $("time").textContent = t;
  if (s.status === "rest") $("restTime").textContent = fmt(Date.now() - s.since);
  const icone = { idle: "✨", study: "📖", rest: "☕" }[s.status];
  document.title = s.status === "idle" ? "Foco ✨" : `${icone} ${t}`;
  if (s.status !== "idle" && t !== ultimoTotal) { ultimoTotal = t; $("total").textContent = fmt(log.filter((x) => x.dia === hoje()).reduce((a, x) => a + x.ms, 0) + studyNow()); }
}

$("btnMain").addEventListener("click", main);
$("btnFinish").addEventListener("click", finish);
setInterval(tick, 250);
render();

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
