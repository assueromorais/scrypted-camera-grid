# Camera Grid — plugin do Scrypted

Grade multi-câmera ao vivo **dentro** do Scrypted. Mantém tudo que o Scrypted já faz e
soma uma página de grade. Zero RTSP/go2rtc próprio: usa o **WebRTC nativo** do Scrypted
(`startRTCSignalingSession`), então herda a negociação de stream já pronta de cada câmera.

## Arquitetura

```
browser (/endpoint/scrypted-camera-grid/public/)
  app.js  ──@scrypted/client (mesma origem, sessão logada)──> systemManager
          ──startRTCSignalingSession──> cada câmera ──WebRTC──> <video>
```

- `src/main.ts` — servidor: `HttpRequestHandler` serve a página (`/`) e o bundle (`/app.js`).
  Não toca em vídeo.
- `src/web/app.ts` — browser: conecta via `@scrypted/client`, lista quem tem
  `RTCSignalingChannel`, renderiza cada câmera num `<video>` por WebRTC nativo.
- `src/web/vendor/` — `BrowserSignalingSession` + `Deferred` vendorizados do
  koush/scrypted (MIT), pra não depender de `@scrypted/common` publicado.
- `build-web.mjs` — esbuild empacota o app de browser e grava `src/generated/assets.ts`
  (strings), servido inline pelo servidor.

## Build & deploy

```bash
npm install
npx scrypted login 127.0.0.1      # 1ª vez: credenciais do Scrypted local
npm run scrypted-deploy 127.0.0.1 # empacota + envia pro Scrypted
```

Depois abra no Scrypted: **Plugins → Camera Grid → endpoint** (ou a URL logada no console
do plugin). Precisa estar logado no Scrypted (a página reusa a sessão).

## Por que WebRTC nativo e não go2rtc

O Scrypted já resolve o transporte de cada câmera (incl. transcode quando precisa). A grade
só orquestra `<video>` + layout. Sem segundo processo puxando RTSP = sem contenção de sessão
na câmera Tapo.
