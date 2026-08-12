// Shared listener logic for the FF proxy.
// Supports HTTP-proxy semantics (what iOS system proxy sends):
//  - CONNECT host:port  -> tunnel, reply "HTTP/1.1 200", relay TLS to target
//  - GET /cache_res ... -> serve the mod file
//  - anything else HTTP -> relay the raw request to the upstream target
//  - non-HTTP (raw TLS) -> relay as passthrough (legacy behavior)
import net from "node:net";
import http from "node:http";

const DEFAULT_TARGET = { host: "ff.garena.com", port: 443 };

// Parse "host:port" from a CONNECT request line
function parseConnectTarget(requestLine) {
  const m = requestLine.match(/^CONNECT\s+([^:]+):(\d+)/i);
  if (m) return { host: m[1], port: Number(m[2]) };
  return DEFAULT_TARGET;
}

function looksLikeHttpRequest(firstChunk) {
  const head = firstChunk
    .slice(0, 16)
    .toString("ascii", 0, Math.min(firstChunk.length, 16));
  return /^GET |HEAD |POST |PUT |CONNECT |HTTP\//i.test(head);
}

function parseHttpRequest(firstChunk) {
  const text = firstChunk.toString("ascii");
  const lines = text.split(/\r?\n/);
  const parts = lines[0].split(" ");
  const method = (parts[0] || "").toUpperCase();
  const url = parts[1] || "/";
  return { method, url };
}

// ------------------- embedded mod file server -------------------
let modFileBuffer = null;
function loadModFile(fs, path, file) {
  try {
    if (fs.existsSync(file)) {
      modFileBuffer = fs.readFileSync(file);
      console.log(`[MOD] cache_res loaded (${modFileBuffer.length} bytes)`);
    }
  } catch (e) {
    console.log(`[MOD] failed to load: ${e.message}`);
  }
}

function serveModFile(socket) {
  if (!modFileBuffer) {
    socket.end("HTTP/1.1 503 Unavailable\r\nContent-Length: 0\r\n\r\n");
    return;
  }
  socket.end(
    Buffer.concat([
      Buffer.from(
        `HTTP/1.1 200 OK\r\nContent-Type: application/octet-stream\r\nContent-Length: ${modFileBuffer.length}\r\nConnection: close\r\n\r\n`,
      ),
      modFileBuffer,
    ]),
  );
  console.log(`[MOD] served cache_res (${modFileBuffer.length} bytes)`);
}

// ------------------- upstream relay -------------------
function relay(clientSocket, upSocket) {
  clientSocket.on("data", (d) => upSocket.write(d));
  upSocket.on("data", (d) => clientSocket.write(d));
  clientSocket.on("end", () => upSocket.destroy());
  upSocket.on("end", () => clientSocket.destroy());
  clientSocket.on("error", () => upSocket.destroy());
  upSocket.on("error", () => clientSocket.destroy());
}

function connectUpstream(clientSocket, host, port) {
  const up = net.connect({ host, port }, () => {
    console.log(`[RELAY] -> ${host}:${port} tunnel`);
    relay(clientSocket, up);
  });
  up.on("error", (e) => {
    console.log(`[RELAY] error ${host}:${port}: ${e.message}`);
    up.destroy();
    clientSocket.destroy();
  });
}

// Send HTTP/1.1 200 to complete the CONNECT handshake
function completeConnectHandshake(socket) {
  socket.write("HTTP/1.1 200 Connection established\r\n\r\n");
}

// ------------------- key store (mirrors server.js logic) -------------------
function findValidKey(keys, clientIp) {
  const now = Date.now();
  return keys.find(
    (k) => k.expired_at > now && (k.status === "active" || !k.status),
  );
}

export function makeListener({
  port,
  feature,
  keysFn,
  fs,
  path,
  modFile,
}) {
  if (fs && path && modFile) loadModFile(fs, path, modFile);

  const server = net.createServer((socket) => {
    const clientIp =
      socket.remoteAddress?.replace(/^::ffff:/, "") || "unknown";
    let handled = false;

    const onceData = (firstChunk) => {
      if (handled) return;
      handled = true;
      socket.off("data", onceData);
      socket.off("error", onceError);

      if (looksLikeHttpRequest(firstChunk)) {
        const { method, url } = parseHttpRequest(firstChunk);

        // Mod file request -> serve it
        if (/cache_res|\.obb|UnityFS/i.test(url) || url === "/") {
          console.log(`[MOD] HTTP request on port ${port}: ${method} ${url}`);
          serveModFile(socket);
          return;
        }

        // CONNECT -> HTTP proxy tunnel (this is what iOS sends for HTTPS)
        if (method === "CONNECT") {
          const keyOk = Boolean(findValidKey(keysFn(), clientIp));
          if (!keyOk) {
            // respond with an HTTP denial so iOS doesn't hang forever
            socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
            console.log(
              `[DENY] ${clientIp}:${socket.remotePort} -> port ${port} (${feature}) no valid key (CONNECT)`,
            );
            return;
          }
          const { host, port: upPort } = parseConnectTarget(
            firstChunk.toString("ascii"),
          );
          completeConnectHandshake(socket);
          console.log(
            `[OK] ${clientIp}:${socket.remotePort} -> port ${port} (${feature}) CONNECT -> ${host}:${upPort}`,
          );
          connectUpstream(socket, host, upPort);
          return;
        }

        // Plain HTTP request -> forward to upstream as-is (legacy fallback)
        const keyOk = Boolean(findValidKey(keysFn(), clientIp));
        if (!keyOk) {
          socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
          console.log(
            `[DENY] ${clientIp}:${socket.remotePort} -> port ${port} (${feature}) no valid key`,
          );
          return;
        }
        console.log(
          `[OK] ${clientIp}:${socket.remotePort} -> port ${port} (${feature}) HTTP ${method} ${url}`,
        );
        connectUpstream(socket, DEFAULT_TARGET.host, DEFAULT_TARGET.port);
        socket.write(firstChunk);
        return;
      }

      // Raw TLS (non-HTTP) -> legacy passthrough
      if (!findValidKey(keysFn(), clientIp)) {
        console.log(
          `[DENY] ${clientIp}:${socket.remotePort} -> port ${port} (${feature}) no valid key (TLS)`,
        );
        socket.destroy();
        return;
      }
      console.log(
        `[OK] ${clientIp}:${socket.remotePort} -> port ${port} (${feature}) passthrough`,
      );
      connectUpstream(socket, DEFAULT_TARGET.host, DEFAULT_TARGET.port);
    };

    const onceError = () => {
      if (handled) return;
      handled = true;
      socket.off("data", onceData);
    };

    socket.once("data", onceData);
    socket.once("error", onceError);
    setTimeout(() => {
      if (!handled) {
        handled = true;
        socket.destroy();
      }
    }, 15000).unref();
  });

  server.listen(port, "0.0.0.0", () => {
    console.log(`[LISTEN] port ${port} (${feature}) on 0.0.0.0`);
  });
  server.on("error", (e) => {
    console.error(`[ERR] port ${port}: ${e.message}`);
  });
  return server;
}
