// SCC Adv Gestão – service worker mínimo para o app instalado no celular.
// Não guarda dados do escritório no aparelho: tudo continua vindo do servidor.
// Sem internet, mostra só um aviso simples.
const AVISO = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sem conexão</title><body style="font-family:system-ui,sans-serif;background:#F7F5F1;color:#0F2340;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center;padding:24px">
<div><h1 style="font-size:20px">Sem conexão com a internet</h1><p style="color:#5B6472">Verifique a conexão e tente de novo.</p>
<button onclick="location.reload()" style="margin-top:12px;padding:10px 16px;border-radius:8px;border:0;background:#0F2340;color:#fff">Tentar de Novo</button></div></body></html>`;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return; // só páginas; o resto segue normal
  event.respondWith(fetch(event.request).catch(() => new Response(AVISO, { headers: { "Content-Type": "text/html; charset=utf-8" } })));
});