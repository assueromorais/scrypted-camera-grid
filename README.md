# Camera Grid — plugin do Scrypted

Parede multi-câmera ao vivo **dentro** do Scrypted. Mantém tudo que o Scrypted já faz e
soma uma página de grade, de graça. Sem RTSP/go2rtc próprio: usa o **WebRTC nativo** do
Scrypted (`startRTCSignalingSession`), então herda a negociação de stream já pronta de cada
câmera — inclusive transcode quando a câmera precisa.

> Por que existe: o console grátis do Scrypted mostra uma câmera por vez; a parede de várias
> só vem no NVR pago. Este plugin dá a grade sem NVR e sem um segundo processo puxando RTSP
> (o que estoura o limite de sessões de câmeras baratas, tipo Tapo).

## Recursos

- **Grade de todas as câmeras** com `RTCSignalingChannel` (qualquer câmera WebRTC do Scrypted).
- **Seleção e layout por navegador**: escolha quais câmeras aparecem (⚙) e o nº de colunas;
  fica salvo no `localStorage`.
- **PTZ**: câmeras com `PanTiltZoom` ganham um pad de setas (usa `ptzCommand` nativo — o
  plugin da câmera executa o movimento; nenhum código de protocolo aqui).
- **Tela cheia** (duplo-clique ou ⛶): reconecta o stream pra renegociar numa resolução maior.
- **Auto-reconexão**: se o WebRTC cai (ICE failed/disconnected), reconecta sozinho com backoff.
- **Atalho no painel**: aparece como app clicável na home do Scrypted (LauncherApplication).

## Instalação

**Pelo store do Scrypted** (recomendado): Plugins → Install → procure por `camera grid`.

**Por npm**:
```
npm install -g scrypted-camera-grid   # ou instale pelo próprio Scrypted
```

Depois abra: **home do Scrypted → Camera Grid**, ou direto em
`https://<host>:10443/endpoint/scrypted-camera-grid/public/`. Precisa estar logado no Scrypted
(a página reusa a sessão).

## Como funciona

```
browser (/endpoint/scrypted-camera-grid/public/)
  app.js  ──@scrypted/client (mesma origem, sessão logada)──> systemManager
          ──startRTCSignalingSession──> cada câmera ──WebRTC──> <video>
```

- `src/main.ts` — servidor: `HttpRequestHandler` serve a página (`/`) e o bundle (`/app.js`).
  Não toca em vídeo. Implementa `LauncherApplication`.
- `src/web/app.ts` — browser: conecta via `@scrypted/client`, lista as câmeras, renderiza
  cada uma num `<video>` por WebRTC nativo; seleção/colunas persistidas; auto-reconexão.
- `src/web/vendor/` — `BrowserSignalingSession` + `Deferred` vendorizados de koush/scrypted
  (MIT), pra não depender da versão publicada de `@scrypted/common`.
- `build-web.mjs` — esbuild empacota o app de browser e grava `src/generated/assets.ts`
  (strings), servido inline pelo servidor (não depende do FS do plugin em runtime).

## Desenvolvimento

```
npm install
npx scrypted login 127.0.0.1        # 1ª vez
npm run scrypted-deploy 127.0.0.1   # empacota + envia
npm run dev                         # watch: redeploy a cada save
```

## Limites

- Só lista câmeras que o Scrypted expõe como WebRTC (`RTCSignalingChannel`). Configure a
  câmera no Scrypted primeiro.
- A seleção/colunas é por navegador (`localStorage`), não compartilhada entre dispositivos.
- Câmeras com GOP longo em 2K podem demorar/engasgar em tela cheia — é da câmera, não do grid.

## Licença

MIT. Ver `LICENSE` e `src/web/vendor/NOTICE.md`.
