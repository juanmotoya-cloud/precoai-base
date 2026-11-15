# Passo 1 — Catálogo SEFAZ-AM

- `../dados/catalogo-sefaz.json`: 30 produtos, termos de pesquisa e filtros iniciais.
- `../dados/categorias.json`: mantém o formato esperado pelo frontend e inclui Leite em pó integral como item 30.
- `validar-catalogo.js`: confere consistência entre a interface e o catálogo SEFAZ.

## Instalação
Copie a pasta `dados` atualizada para a raiz do frontend. Copie `validar-catalogo.js` para `coletor-sefaz`. Atualize o script `validar:catalogo` no package.json e execute `npm run validar:catalogo` dentro de `coletor-sefaz`.

Este passo não consulta a SEFAZ nem grava no Firestore; prepara as regras para o coletor do próximo passo. Os filtros serão ajustados com amostras reais para evitar excluir produtos válidos.
