// Espaços de anúncio. Dois formatos: 300x100 (celular) e 970x90 (leaderboard, telas largas).
// - Enquanto não houver anúncio contratado, o espaço aparece como "Publicidade" com o tamanho reservado.
// - Para colocar um anúncio de verdade, é só preencher ANUNCIOS abaixo (ou trocar por uma rede de anúncios).

export const FORMATOS = { "300x100": { largura: 300, altura: 100 }, "970x90": { largura: 970, altura: 90 } };

// Exemplo: { formato: "300x100", imagem: "anuncios/mercado-300x100.png", link: "https://...", alt: "Mercado X" }
export const ANUNCIOS = [];

// Quem decide o formato é o site, não o usuário: "auto" (300x100 em coluna estreita, 970x90 quando cabe 970 px),
// ou fixe aqui "300x100" / "970x90". Use "off" para desligar todos os anúncios.
export const FORMATO_ANUNCIO = "auto";

export function formatoAtual(preferencia = FORMATO_ANUNCIO, larguraDisponivel = document.querySelector(".app")?.clientWidth || innerWidth) {
    if (preferencia === "off") return null;
    if (preferencia === "300x100" || preferencia === "970x90") return preferencia;
    return larguraDisponivel >= 970 ? "970x90" : "300x100";
}

export function criarAnuncio(formato, indice = 0) {
    if (!FORMATOS[formato]) return null;
    const { largura, altura } = FORMATOS[formato];
    const caixa = document.createElement("aside");
    caixa.className = `anuncio anuncio-${formato}`;
    caixa.setAttribute("aria-label", "Publicidade");
    caixa.style.setProperty("--aw", largura);
    caixa.style.setProperty("--ah", altura);
    const criativos = ANUNCIOS.filter(a => a.formato === formato);
    const criativo = criativos.length ? criativos[indice % criativos.length] : null;
    if (criativo) {
        const a = document.createElement("a");
        a.href = criativo.link; a.target = "_blank"; a.rel = "noopener sponsored";
        const img = document.createElement("img");
        img.src = criativo.imagem; img.alt = criativo.alt || "Anúncio"; img.width = largura; img.height = altura; img.loading = "lazy";
        a.append(img);
        caixa.append(a);
    } else {
        const t = document.createElement("span");
        t.className = "anuncio-vazio";
        t.textContent = `Publicidade · ${largura}×${altura}`;
        caixa.append(t);
    }
    return caixa;
}

// Separa a lista: um anúncio no topo e outro a cada `cada` produtos (sem anúncio colado no fim da lista).
export function intercalarAnuncios(elementos, { cada = 6, topo = true } = {}) {
    const formato = formatoAtual();
    if (!formato) return elementos;
    const saida = [];
    let n = 0;
    if (topo && elementos.length) saida.push(criarAnuncio(formato, n++));
    elementos.forEach((e, i) => {
        saida.push(e);
        if ((i + 1) % cada === 0 && i < elementos.length - 1) saida.push(criarAnuncio(formato, n++));
    });
    return saida;
}
