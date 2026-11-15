// Ícones da pasta icons/ (PNG preto) pintados via CSS mask: assumem a cor do texto.
const POR_CATEGORIA = {
  todos: "carrinho-de-supermercado", feijoes: "cesta", cereais: "casal-de-biscoitos",
  "raizes-tuberculos": "cesta", "legumes-verduras": "silhueta-negra-de-maca-com-uma-folha",
  frutas: "silhueta-negra-de-maca-com-uma-folha", "castanhas-nozes": "casal-de-biscoitos",
  "carnes-ovos": "carne", "leites-queijos": "leite", "acucares-sal-gorduras": "casal-de-biscoitos",
  "cafe-cha-especiarias": "drinque-suave"
};

export function icone(nome, classe = "") {
  const i = document.createElement("i");
  i.className = ("i " + classe).trim();
  const u = `url(icons/${nome}.png)`;
  i.style.webkitMaskImage = u;
  i.style.maskImage = u;
  i.setAttribute("aria-hidden", "true");
  return i;
}

export const iconeCategoria = id => icone(POR_CATEGORIA[id] || "cesta");
