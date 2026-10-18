// App de browser da grade. Roda DENTRO do Scrypted (mesma origem), reusa a sessão
// logada. Lista câmeras (RTCSignalingChannel) e renderiza cada uma via WebRTC nativo
// do Scrypted. PTZ e resolução também pela API do Scrypted — zero RTSP/ONVIF próprio.
//
// v0.2: seleção de câmeras + colunas persistidas (localStorage, por navegador) e
// auto-reconexão quando o WebRTC cai (ICE failed/disconnected).
import { connectScryptedClient } from "@scrypted/client";
import { BrowserSignalingSession } from "./vendor/rtc-signaling";

interface Cam {
  id: string;
  name: string;
  ptz: boolean;
}

const gridEl = document.getElementById("grid") as HTMLElement;
const statusEl = document.getElementById("status") as HTMLElement;
const colsSel = document.getElementById("cols") as HTMLSelectElement;
const gearBtn = document.getElementById("gear") as HTMLButtonElement;
const panelEl = document.getElementById("settings") as HTMLElement;

const LS_KEY = "camera-grid-config-v1";
type Config = { hidden: string[]; cols: string };

function loadConfig(): Config {
  try {
    const c = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
    return { hidden: Array.isArray(c.hidden) ? c.hidden : [], cols: c.cols || "auto" };
  } catch {
    return { hidden: [], cols: "auto" };
  }
}
function saveConfig(c: Config) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(c)); } catch {}
}

const config = loadConfig();
let allCams: Cam[] = [];
let sm: any = null;

function setStatus(msg: string) { statusEl.textContent = msg; }

// conecta (ou reconecta) uma câmera a um <video> via WebRTC nativo. Fecha a conexão
// anterior antes. Em queda de ICE, reconecta com backoff (2s→15s) enquanto o <video>
// seguir no DOM. Usado também no fullscreen pra renegociar resolução.
async function connectCamera(cam: Cam, video: HTMLVideoElement) {
  const old = (video as any)._pc as RTCPeerConnection | undefined;
  if (old) { try { old.close(); } catch {} }
  clearTimeout((video as any)._retryTimer);

  const device = sm.getDeviceById(cam.id);
  const session = new BrowserSignalingSession();
  session.onPeerConnection = async (pc: RTCPeerConnection) => {
    (video as any)._pc = pc;
    pc.addEventListener("track", (ev: RTCTrackEvent) => {
      if (ev.streams?.[0]) {
        video.srcObject = ev.streams[0];
        video.play().catch(() => {});
      }
    });
    pc.addEventListener("iceconnectionstatechange", () => {
      const s = pc.iceConnectionState;
      if (s === "connected" || s === "completed") {
        (video as any)._retries = 0;
      } else if (s === "failed" || s === "disconnected" || s === "closed") {
        scheduleReconnect(cam, video);
      }
    });
  };
  try {
    await device.startRTCSignalingSession(session);
  } catch (err: any) {
    console.error("câmera", cam.name, err);
    scheduleReconnect(cam, video);
  }
}

function scheduleReconnect(cam: Cam, video: HTMLVideoElement) {
  if (!video.isConnected) return;               // célula saiu do DOM
  clearTimeout((video as any)._retryTimer);
  const n = ((video as any)._retries || 0) + 1;
  (video as any)._retries = n;
  const delay = Math.min(2000 * n, 15000);
  (video as any)._retryTimer = setTimeout(() => {
    if (video.isConnected) connectCamera(cam, video).catch(() => {});
  }, delay);
}

function makePtzPad(cam: Cam): HTMLElement {
  const pad = document.createElement("div");
  pad.className = "ptz";
  const btns: [string, number, number, string][] = [
    ["↑", 0, 0.1, "up"], ["←", -0.1, 0, "left"], ["→", 0.1, 0, "right"], ["↓", 0, -0.1, "down"],
  ];
  for (const [txt, pan, tilt, pos] of btns) {
    const b = document.createElement("button");
    b.textContent = txt;
    b.className = `ptz-${pos}`;
    b.onclick = async (e) => {
      e.stopPropagation();
      b.disabled = true;
      try {
        await sm.getDeviceById(cam.id).ptzCommand({ movement: "Relative", pan, tilt });
      } catch (err: any) {
        setStatus(`PTZ ${cam.name}: ${err?.message || err}`);
      } finally {
        b.disabled = false;
      }
    };
    pad.appendChild(b);
  }
  return pad;
}

function makeCell(cam: Cam): HTMLElement {
  const cell = document.createElement("div");
  cell.className = "cell";

  const video = document.createElement("video");
  video.muted = true;
  video.autoplay = true;
  video.playsInline = true;
  video.controls = false;

  const label = document.createElement("div");
  label.className = "label";
  label.textContent = cam.name + (cam.ptz ? " · PTZ" : "");

  const full = document.createElement("button");
  full.className = "full";
  full.textContent = "⛶";
  full.title = "Tela cheia";
  full.onclick = (e) => {
    e.stopPropagation();
    if (document.fullscreenElement) document.exitFullscreen();
    else cell.requestFullscreen();
  };

  cell.appendChild(video);
  cell.appendChild(label);
  cell.appendChild(full);
  if (cam.ptz) cell.appendChild(makePtzPad(cam));
  cell.ondblclick = () => cell.requestFullscreen();
  (cell as any)._cam = cam;
  (cell as any)._video = video;

  connectCamera(cam, video).catch(() => {});
  return cell;
}

// desconecta tudo e remonta só as câmeras visíveis (não escondidas na config).
function renderGrid() {
  // fecha conexões e timers das células atuais
  for (const cell of Array.from(gridEl.children) as any[]) {
    const v = cell._video as HTMLVideoElement | undefined;
    if (v) {
      clearTimeout((v as any)._retryTimer);
      const pc = (v as any)._pc as RTCPeerConnection | undefined;
      if (pc) { try { pc.close(); } catch {} }
    }
  }
  gridEl.innerHTML = "";

  const hidden = new Set(config.hidden);
  const visible = allCams.filter((c) => !hidden.has(c.id));
  for (const cam of visible) gridEl.appendChild(makeCell(cam));
  setStatus(`${visible.length}/${allCams.length} câmera(s) · WebRTC nativo do Scrypted`);
}

// painel de seleção: um checkbox por câmera (marcado = visível).
function buildSettingsPanel() {
  panelEl.innerHTML = "";
  const title = document.createElement("div");
  title.className = "settings-title";
  title.textContent = "Câmeras na parede";
  panelEl.appendChild(title);

  const hidden = new Set(config.hidden);
  for (const cam of allCams) {
    const row = document.createElement("label");
    row.className = "settings-row";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = !hidden.has(cam.id);
    cb.onchange = () => {
      const h = new Set(config.hidden);
      if (cb.checked) h.delete(cam.id);
      else h.add(cam.id);
      config.hidden = Array.from(h);
      saveConfig(config);
      renderGrid();
    };
    const span = document.createElement("span");
    span.textContent = cam.name + (cam.ptz ? " · PTZ" : "");
    row.appendChild(cb);
    row.appendChild(span);
    panelEl.appendChild(row);
  }
}

async function main() {
  try {
    setStatus("conectando ao Scrypted…");
    sm = (await connectScryptedClient({ baseUrl: location.origin, pluginId: "@scrypted/core" } as any)).systemManager;

    const state = sm.getSystemState();
    allCams = [];
    for (const id of Object.keys(state)) {
      const d = state[id];
      const interfaces: string[] = d?.interfaces?.value || [];
      if (interfaces.includes("RTCSignalingChannel")) {
        allCams.push({ id, name: d?.name?.value || id, ptz: interfaces.includes("PanTiltZoom") });
      }
    }
    allCams.sort((a, b) => a.name.localeCompare(b.name));

    // aplica colunas salvas
    colsSel.value = config.cols;
    if (config.cols === "auto") gridEl.removeAttribute("data-cols");
    else gridEl.setAttribute("data-cols", config.cols);

    buildSettingsPanel();
    renderGrid();

    // fullscreen: reconecta pra renegociar resolução (maior em tela cheia)
    document.addEventListener("fullscreenchange", () => {
      const fe = document.fullscreenElement as any;
      const cell = fe?.classList?.contains("cell") ? fe : (window as any)._lastFsCell;
      if (cell?._cam && cell?._video) connectCamera(cell._cam, cell._video).catch(() => {});
      (window as any)._lastFsCell = fe?.classList?.contains("cell") ? fe : null;
    });
  } catch (err: any) {
    setStatus(`erro: ${err?.message || err}`);
    console.error(err);
  }
}

colsSel.onchange = () => {
  config.cols = colsSel.value;
  saveConfig(config);
  if (colsSel.value === "auto") gridEl.removeAttribute("data-cols");
  else gridEl.setAttribute("data-cols", colsSel.value);
};

gearBtn.onclick = () => panelEl.classList.toggle("open");
document.addEventListener("click", (e) => {
  if (!panelEl.contains(e.target as Node) && e.target !== gearBtn) panelEl.classList.remove("open");
});

main();
