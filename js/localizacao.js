// Localização do celular (API de geolocalização do navegador). Sem Firebase, sem dependências.
// A posição fica guardada por 30 min no aparelho (localStorage) para as outras telas
// (categoria e produto) mostrarem a distância sem pedir permissão de novo.
import { distanciaKm } from "./precos.js";

const CHAVE = "precoai:posicao";

// Guarda no aparelho do usuário. Tenta o localStorage; se o navegador bloquear (modo privado, configurações),
// usa cookie próprio como reserva e, por último, a memória da página.
const memoria = new Map();
const COOKIE_DIAS = 365;
function gravarCookie(chave, valor) {
    try {
        const expira = valor === null ? "Thu, 01 Jan 1970 00:00:00 GMT" : new Date(Date.now() + COOKIE_DIAS * 864e5).toUTCString();
        document.cookie = `${chave}=${valor === null ? "" : encodeURIComponent(valor)}; expires=${expira}; path=/; SameSite=Lax`;
    } catch { /* cookies bloqueados */ }
}
function lerCookie(chave) {
    try {
        const par = document.cookie.split("; ").find(c => c.startsWith(chave + "="));
        return par ? decodeURIComponent(par.slice(chave.length + 1)) : null;
    } catch { return null; }
}
export function guardar(chave, texto) {
    memoria.set(chave, texto);
    try { texto === null ? localStorage.removeItem(chave) : localStorage.setItem(chave, texto); } catch { gravarCookie(chave, texto); }
}
export function recuperar(chave) {
    try {
        const v = localStorage.getItem(chave);
        if (v !== null) return v;
    } catch { /* cai para o cookie */ }
    return lerCookie(chave) ?? memoria.get(chave) ?? null;
}
const VALIDADE_MS = 30 * 60 * 1000;
export const CENTRO_MANAUS = { latitude: -3.1190, longitude: -60.0217 };
export const RAIO_COBERTURA_KM = 60;   // além disso, o app avisa que só cobre Manaus
export const RAIOS_KM = [3, 5, 10];    // tenta o menor raio primeiro e abre só se houver poucos mercados
const PRECISAO_RUIM_M = 3000;          // acima disso a posição é aproximada (rede/IP)

export function lerPosicaoSalva() {
    try {
        const p = JSON.parse(recuperar(CHAVE) || "null");
        if (!p || !Number.isFinite(p.latitude) || !Number.isFinite(p.longitude)) return null;
        if (Date.now() - p.em > VALIDADE_MS) return null;
        return p;
    } catch { return null; }
}

export function salvarPosicao(posicao, raioKm = null) {
    guardar(CHAVE, JSON.stringify({ ...posicao, raioKm }));
}

export function limparPosicao() {
    guardar(CHAVE, null);
}

export function dentroDeManaus(p) {
    return distanciaKm(p.latitude, p.longitude, CENTRO_MANAUS.latitude, CENTRO_MANAUS.longitude) <= RAIO_COBERTURA_KM;
}

export const posicaoAproximada = p => Number.isFinite(p?.precisao) && p.precisao > PRECISAO_RUIM_M;

// "granted" | "denied" | "prompt" | "indisponivel"
export async function estadoPermissao() {
    try {
        if (!navigator.permissions?.query) return "indisponivel";
        return (await navigator.permissions.query({ name: "geolocation" })).state;
    } catch { return "indisponivel"; }
}

function pedir(opcoes) {
    return new Promise((ok, falha) => navigator.geolocation.getCurrentPosition(ok, falha, opcoes));
}

// Primeiro tenta uma posição rápida (Wi-Fi/antenas, boa para achar mercados);
// se demorar ou falhar por outro motivo que não seja permissão negada, tenta o GPS.
export async function obterPosicao() {
    if (!window.isSecureContext) throw { code: -1 };
    if (!("geolocation" in navigator)) throw { code: 0 };
    let pos;
    try {
        pos = await pedir({ enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
    } catch (erro) {
        if (erro.code === 1) throw erro;
        pos = await pedir({ enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
    }
    return { latitude: pos.coords.latitude, longitude: pos.coords.longitude, precisao: pos.coords.accuracy, em: Date.now() };
}

export function mensagemErro(erro) {
    switch (erro?.code) {
        case -1: return "A localização só funciona em site seguro (https). Mostrando Manaus inteira.";
        case 0: return "Este navegador não oferece localização. Escolha um bairro abaixo.";
        case 1: return "Localização bloqueada. Para usar, libere a localização para este site nas configurações do navegador. Mostrando Manaus inteira.";
        case 2: return "Não conseguimos identificar onde você está. Ligue o GPS ou escolha um bairro abaixo.";
        case 3: return "A localização demorou demais. Toque para tentar de novo ou escolha um bairro abaixo.";
        default: return "Não foi possível obter a localização. Escolha um bairro abaixo.";
    }
}

// Bairro escolhido pelo usuário: fica guardado no aparelho até ele trocar ou voltar para "Todos os bairros".
const CHAVE_BAIRRO = "precoai:bairro";

export function lerBairroSalvo() {
    try {
        const b = JSON.parse(recuperar(CHAVE_BAIRRO) || "null");
        return b && typeof b.chave === "string" && b.chave && typeof b.nome === "string" ? b : null;
    } catch { return null; }
}

export function salvarBairro(chave, nome) {
    guardar(CHAVE_BAIRRO, chave ? JSON.stringify({ chave, nome }) : null);
}

// Pergunta ao mapa (OpenStreetMap/Nominatim) em que bairro fica a posição. Devolve os nomes possíveis, do mais
// específico ao mais amplo; lista vazia se não responder em 6 s ou se não houver internet.
export async function nomesDoBairroNoMapa(posicao) {
    const controle = new AbortController();
    const limite = setTimeout(() => controle.abort(), 6000);
    try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=16&accept-language=pt-BR&lat=${posicao.latitude}&lon=${posicao.longitude}`;
        const r = await fetch(url, { signal: controle.signal, headers: { Accept: "application/json" } });
        if (!r.ok) return [];
        const a = (await r.json()).address || {};
        return [a.suburb, a.neighbourhood, a.quarter, a.city_district, a.village, a.residential].filter(Boolean);
    } catch { return []; }
    finally { clearTimeout(limite); }
}
