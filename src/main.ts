import sdk, { ScryptedDeviceBase, HttpRequestHandler, HttpRequest, HttpResponse, LauncherApplication, LauncherApplicationInfo } from "@scrypted/sdk";
import { APP_JS, INDEX_HTML } from "./generated/assets";

// Camera Grid — plugin do Scrypted que serve uma grade multi-câmera ao vivo.
// O servidor só entrega a página e o bundle JS; todo o vídeo roda no browser via
// WebRTC nativo do Scrypted (@scrypted/client + startRTCSignalingSession). Nada de
// RTSP/go2rtc aqui — o Scrypted já negocia o WebRTC de cada câmera.
// Implementa LauncherApplication: aparece como app clicável no painel do Scrypted.
class CameraGrid extends ScryptedDeviceBase implements HttpRequestHandler, LauncherApplication {
  applicationInfo?: LauncherApplicationInfo;

  constructor(nativeId?: string) {
    super(nativeId);
    this.registerLauncher();
  }

  private async registerLauncher() {
    try {
      const href = await sdk.endpointManager.getPublicLocalEndpoint();
      this.applicationInfo = {
        name: "Camera Grid",
        description: "Grade multi-câmera ao vivo (WebRTC nativo)",
        icon: "mdi-view-grid",
        href,
      };
      this.console.log(`Camera Grid em: ${href}`);
    } catch (e) {
      this.console.warn("não consegui registrar no launcher:", e);
    }
  }

  async onRequest(request: HttpRequest, response: HttpResponse): Promise<void> {
    // path relativo ao endpoint do plugin (tira o rootPath que o Scrypted prefixa)
    let path = request.url;
    if (request.rootPath && path.startsWith(request.rootPath))
      path = path.substring(request.rootPath.length);
    path = path.split("?")[0];

    if (path === "/app.js") {
      response.send(APP_JS, {
        headers: { "Content-Type": "application/javascript; charset=utf-8" },
      });
      return;
    }

    if (path === "" || path === "/" || path === "/index.html") {
      response.send(INDEX_HTML, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
      return;
    }

    response.send("not found", { code: 404 });
  }
}

export default CameraGrid;
