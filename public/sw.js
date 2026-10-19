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
// Avisos de publicações (push). O servidor manda título, texto e a tela a abrir.
self.addEventListener("push", (event) => {
  let dados = {};
  try {
    dados = event.data ? event.data.json() : {};
  } catch (erro) {
    dados = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(dados.title || "SCC Adv Gestão", {
      body: dados.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      tag: dados.tag || "scc-aviso",
      data: { url: dados.url || "/inicio" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/inicio", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((janelas) => {
      for (const janela of janelas) {
        if ("focus" in janela) {
          janela.navigate(url);
          return janela.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});