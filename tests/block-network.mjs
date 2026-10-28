import http from "node:http";
import https from "node:https";
import http2 from "node:http2";
import net from "node:net";
import tls from "node:tls";
import dgram from "node:dgram";
import { syncBuiltinESMExports } from "node:module";

const blocked = () => { throw new Error("Network access is disabled for this test."); };
for (const module of [http, https, http2, net, tls, dgram]) {
  for (const name of ["request", "get", "connect", "createConnection", "createServer", "createSecureServer", "createSocket"]) {
    if (typeof module[name] === "function") module[name] = blocked;
  }
}
globalThis.fetch = blocked;
globalThis.WebSocket = blocked;
syncBuiltinESMExports();
