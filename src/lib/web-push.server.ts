/**
 * Envio de notificações push (Web Push) só com WebCrypto, sem pacotes extras.
 * Criptografia do conteúdo: RFC 8291 (aes128gcm). Identificação do servidor: VAPID (RFC 8292).
 * Use apenas no servidor (rota /api/avisos-publicacoes).
 */
import { VAPID_PUBLICA } from "@/lib/vapid";

export type InscricaoPush = { endpoint: string; p256dh: string; auth: string };

const enc = new TextEncoder();

function b64urlParaBytes(texto: string) {
  const base = texto.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(base + "=".repeat((4 - (base.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function bytesParaB64url(bytes: Uint8Array) {
  let bin = "";
  bytes.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function juntar(...partes: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const total = new Uint8Array(partes.reduce((s, p) => s + p.length, 0));
  let pos = 0;
  for (const p of partes) {
    total.set(p, pos);
    pos += p.length;
  }
  return total;
}

async function hmac(chave: Uint8Array<ArrayBuffer>, dados: Uint8Array<ArrayBuffer>) {
  const k = await crypto.subtle.importKey("raw", chave, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, dados));
}

/** Assinatura VAPID (JWT ES256) para o serviço de push do aparelho (Apple, Google, Mozilla…). */
async function cabecalhoVapid(endpoint: string, privada: string) {
  const publica = b64urlParaBytes(VAPID_PUBLICA);
  const chave = await crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", d: privada, x: bytesParaB64url(publica.slice(1, 33)), y: bytesParaB64url(publica.slice(33, 65)), ext: true },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const cabecalho = bytesParaB64url(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const corpo = bytesParaB64url(
    enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: "https://sccadv-sist.lovable.app" })),
  );
  const assinatura = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, chave, enc.encode(`${cabecalho}.${corpo}`)));
  return `vapid t=${cabecalho}.${corpo}.${bytesParaB64url(assinatura)}, k=${VAPID_PUBLICA}`;
}

/** Criptografa a mensagem para um aparelho (só ele consegue abrir). */
export async function criptografar(inscricao: InscricaoPush, mensagem: string) {
  const uaPublica = b64urlParaBytes(inscricao.p256dh);
  const segredo = b64urlParaBytes(inscricao.auth);
  const local = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const localPublica = new Uint8Array(await crypto.subtle.exportKey("raw", local.publicKey));
  const chaveUa = await crypto.subtle.importKey("raw", uaPublica, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const compartilhado = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: chaveUa }, local.privateKey, 256));

  const prkChave = await hmac(segredo, compartilhado);
  const ikm = await hmac(prkChave, juntar(enc.encode("WebPush: info\0"), uaPublica, localPublica, new Uint8Array([1])));
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(sal, ikm.slice(0, 32));
  const cek = (await hmac(prk, juntar(enc.encode("Content-Encoding: aes128gcm\0"), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, juntar(enc.encode("Content-Encoding: nonce\0"), new Uint8Array([1])))).slice(0, 12);

  const chaveAes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const cifrado = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, chaveAes, juntar(enc.encode(mensagem), new Uint8Array([2]))),
  );
  const rs = new Uint8Array([0, 0, 0x10, 0]); // 4096
  return juntar(sal, rs, new Uint8Array([localPublica.length]), localPublica, cifrado);
}

/** Envia um aviso. Retorna o status HTTP (404/410 = aparelho não existe mais: apagar a inscrição). */
export async function enviarPush(inscricao: InscricaoPush, dados: Record<string, unknown>, privada: string) {
  const corpo = await criptografar(inscricao, JSON.stringify(dados));
  const resposta = await fetch(inscricao.endpoint, {
    method: "POST",
    headers: {
      Authorization: await cabecalhoVapid(inscricao.endpoint, privada),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(12 * 3600),
      Urgency: "high",
    },
    body: corpo,
  });
  return resposta.status;
}