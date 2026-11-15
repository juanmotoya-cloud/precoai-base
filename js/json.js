export async function carregarCategorias() {
  const resposta = await fetch("./dados/categorias.json");

  if (!resposta.ok) {
    throw new Error("Não foi possível carregar as categorias.");
  }

  const dados = await resposta.json();

  return dados.categorias || [];
}