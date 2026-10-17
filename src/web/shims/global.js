// garante globais que libs node esperam no browser
import { Buffer as _Buffer } from "buffer";
export const Buffer = _Buffer;
if (typeof globalThis.Buffer === "undefined") globalThis.Buffer = _Buffer;
if (typeof globalThis.global === "undefined") globalThis.global = globalThis;
