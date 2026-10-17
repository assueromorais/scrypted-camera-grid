// App de browser da grade. Roda DENTRO do Scrypted (mesma origem), então reusa a
// sessão logada: connectScryptedClient sem usuário/senha cai no fluxo de cookie.
// Lista as câmeras (quem tem RTCSignalingChannel) e renderiza cada uma via WebRTC
// nativo do Scrypted. PTZ e troca de resolução também via API do Scrypted — zero
// RTSP/ONVIF próprio.
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

function setStatus(msg: string) {
  statusEl.textContent = msg;
}

// conecta (ou reconecta) uma câmera a um <video> via WebRTC nativo.
// Fecha a conexão anterior (se houver) antes de abrir outra — usado no fullscreen
// pra forçar uma renegociação (o Scrypted escolhe a stream conforme o tamanho do
// receptor, então em tela cheia tende a vir numa resolução melhor).
async function connectCamera(systemManager: any, cam: Cam, video: HTMLVideoElement) {
  const old = (video as any)._pc as RTCPeerConnection | undefined;
  if (old) {
    try { old.close(); } catch {}
  }

  const device = systemManager.getDeviceById(cam.id);
  const session = new BrowserSignalingSession();
  session.onPeerConnection = async (pc: RTCPeerConnection) => {
    (video as any)._pc = pc;
    pc.addEventListener("track", (ev: RTCTrackEvent) => {
      if (ev.streams?.[0]) {
        video.srcObject = ev.streams[0];
        video.play().catch(() => {});
      }
    });
  };
  // o plugin da câmera dirige a sessão por RPC (createLocalDescription etc.)
  await device.startRTCSignalingSession(session);
}

// pad de setas PTZ. Chama ptzCommand nativo (movimento relativo); o plugin da
// câmera (ONVIF/vendor) executa. pan/tilt ∈ [-1,1].
function makePtzPad(systemManager: any, cam: Cam): HTMLElement {
  const pad = document.createElement("div");
  pad.className = "ptz";
  const btns: [string, number, number, string][] = [
    ["↑", 0, 0.1, "up"],
    ["←", -0.1, 0, "left"],
    ["→", 0.1, 0, "right"],
    ["↓", 0, -0.1, "down"],
  ];
  for (const [txt, pan, tilt, pos] of btns) {
    const b = document.createElement("button");
    b.textContent = txt;
    b.className = `ptz-${pos}`;
    b.onclick = async (e) => {
      e.stopPropagation();
      b.disabled = true;
      try {
        const device = systemManager.getDeviceById(cam.id);
        await device.ptzCommand({ movement: "Relative", pan, tilt });
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

function makeCell(systemManager: any, cam: Cam): HTMLElement {
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
  if (cam.ptz) cell.appendChild(makePtzPad(systemManager, cam));
  cell.ondblclick = () => cell.requestFullscreen();
  (cell as any)._cam = cam;
  (cell as any)._video = video;

  connectCamera(systemManager, cam, video).catch((err) => {
    label.textContent = `${cam.name} — erro: ${err?.message || err}`;
    console.error("câmera", cam.name, err);
  });

  return cell;
}

async function main() {
  try {
    setStatus("conectando ao Scrypted…");
    const sdk = await connectScryptedClient({
      baseUrl: location.origin,
      pluginId: "@scrypted/core",
    } as any);

    const systemManager = sdk.systemManager;
    const state = systemManager.getSystemState();

    const cams: Cam[] = [];
    for (const id of Object.keys(state)) {
      const d = state[id];
      const interfaces: string[] = d?.interfaces?.value || [];
      if (interfaces.includes("RTCSignalingChannel")) {
        cams.push({
          id,
          name: d?.name?.value || id,
          ptz: interfaces.includes("PanTiltZoom"),
        });
      }
    }
    cams.sort((a, b) => a.name.localeCompare(b.name));

    gridEl.innerHTML = "";
    for (const cam of cams) gridEl.appendChild(makeCell(systemManager, cam));
    setStatus(`${cams.length} câmera(s) · WebRTC nativo do Scrypted`);

    // Tela cheia: reconecta o stream pra renegociar resolução (maior em fullscreen).
    document.addEventListener("fullscreenchange", () => {
      const fe = document.fullscreenElement as any;
      const cell = fe?.classList?.contains("cell") ? fe : null;
      const target = cell || (window as any)._lastFsCell;
      if (!target) return;
      const cam: Cam = target._cam;
      const video: HTMLVideoElement = target._video;
      if (cam && video) connectCamera(systemManager, cam, video).catch(() => {});
      (window as any)._lastFsCell = cell; // guarda pra reconectar ao SAIR
    });
  } catch (err: any) {
    setStatus(`erro: ${err?.message || err}`);
    console.error(err);
  }
}

colsSel.onchange = () => {
  if (colsSel.value === "auto") gridEl.removeAttribute("data-cols");
  else gridEl.setAttribute("data-cols", colsSel.value);
};

main();
