# PreçoAí — Compare preços perto de você (Manaus)

Site estático (HTML/CSS/JS) que lê o Firestore + coletor Node.js que busca preços na SEFAZ-AM.

## Estrutura
- `index.html`, `categoria.html`, `produto.html`, `css/`, `js/`, `icons/` → o site (vai para a hospedagem)
- `dados/` → `catalogo-sefaz.json` e `categorias.json` (usados pelo site e pelo coletor)
- `coletor-sefaz/` → coleta (SEFAZ-AM), sincronização e limpeza do Firestore
- `.github/workflows/atualizar-precos.yml` → coleta diária no GitHub Actions
- `firestore.rules` → regras do banco (só leitura pública)

## Localização do celular
- O botão "Usar minha localização" pede permissão ao navegador (precisa de **https**).
- Tenta 3 km; se houver poucos mercados, abre para 5 e 10 km; se ainda houver poucos, mostra Manaus inteira ordenada por menor preço, com a distância em cada oferta.
- A posição fica guardada 30 min no aparelho: Categoria e Produto mostram distância e "Como chegar" (Google Maps) sem pedir de novo.
- Fora de Manaus (mais de 60 km do centro): aviso e preços de Manaus inteira.
- Se a permissão já foi dada antes, a Home usa a localização sozinha ao abrir.

## Busca por marca e pesquisa detalhada (v3)
- **Marcas:** `js/marcas.js` é o dicionário de marcas (Tio João, Camil, Italac, Lebre...). O coletor grava a marca, a variação (tipo 1, integral) e o tamanho em cada oferta; o site usa a mesma lista. Só marcas do dicionário aparecem (sem "marcas" inventadas). Para incluir uma marca, adicione uma linha em `js/marcas.js`.
- **Coleta por marca:** com `--marcas` o coletor também pesquisa "arroz tio joao", "leite italac" etc. (lista `marcasBusca` de cada produto no catálogo, 3 páginas por marca). O workflow já usa `--marcas`.
- **Auditoria:** `npm run auditar` (em `coletor-sefaz`) mostra, por produto, quantas notas passam no filtro, quantas têm marca/tamanho e **quais marcas ainda faltam no dicionário**. Rode depois de cada coleta.
- **Busca (busca.html):** prefixo de palavra, plural, sinônimos, erro de digitação, relevância; filtros por **marca** e **mercado**; ordem (relevância, menor preço, mais perto, mais recente); modo **Produtos** (menor preço de cada) ou **Todas as ofertas** (uma linha por mercado/marca).
- **Produto:** chips de marca com o menor preço de cada uma.
- **Cesta e Favoritos (cesta.html):** lista salva no aparelho e os 3 mercados onde sai mais barato levar tudo.
- **Instalável no celular:** `manifest.webmanifest` + ícones.

## Busca, cards e anúncios
- `busca.html` + `js/busca.js`: menu inferior "Buscar" abre a página de busca. Ao digitar, aparecem sugestões (produto, marca, categoria, mercado, bairro); também guarda buscas recentes no aparelho.
- Card de produto (`js/cards.js`): nome + marca em cima (ex.: "Arroz Branco Manaus"), tamanho embaixo (ex.: "500 g"). A marca é extraída da descrição da nota por `analisarDescricao` em `js/precos.js`.
- Anúncios (`js/anuncios.js`): formatos 300×100 e 970×90, escolhidos pelo site (não pelo usuário): `FORMATO_ANUNCIO = "auto"` usa 300×100 em coluna estreita e 970×90 quando cabe. Aparecem na Home (abaixo das categorias), na Categoria (topo e a cada 6 produtos) e na Busca (início e nos resultados). Para anúncio real, preencha `ANUNCIOS`.
- Velocidade: o resumo de preços guardado no aparelho aparece na hora (atualiza em segundo plano); o Analytics carrega depois.
- Bairro pela localização: ao ativar a localização, o app descobre o bairro (mapa OpenStreetMap/Nominatim; se o mapa não responder, usa o bairro do mercado mais próximo, até 2 km), seleciona e guarda. Se o bairro não tiver preços recentes, mostra mercados perto de você e avisa onde você está.
- Bairro e posição ficam guardados no aparelho (localStorage; cookie como reserva se o navegador bloquear).
- Coordenadas: a SEFAZ às vezes envia latitude/longitude trocadas; `corrigirCoordenadas` corrige no coletor e no site. Depois de publicar, rode a coleta/sincronização de novo para gravar os dados já corrigidos.

## Lançamento — passo a passo
1. **Firebase → Firestore → Regras:** cole `firestore.rules` e publique.
2. **GitHub → Settings → Secrets → Actions:** crie `FIREBASE_SERVICE_ACCOUNT` com o JSON inteiro da chave (nunca no repositório).
3. **GitHub → Actions → "Atualizar preços" → Run workflow** (1ª vez, manual). Confira no log: "SINCRONIZAÇÃO CONCLUÍDA ... gravados e conferidos".
4. Abra o site e confira Home, categoria e produto. Com os dados no ar, ative o agendamento (descomente `schedule` no workflow).
5. Suba o site (`index.html`, `categoria.html`, `produto.html`, `css/`, `js/`, `icons/`, `dados/`) na hospedagem **com https**.
6. No celular: abra o site, toque em "Usar minha localização" e permita.

## Rodar no computador
```bash
cd coletor-sefaz && npm ci && npm test
node index.js --max-paginas=2 --pausa-ms=2000   # coleta pequena
node sincronizar-firestore.js                  # simulação (não grava)
node sincronizar-firestore.js --executar       # grava no Firestore
cd .. && python -m http.server 8000            # site em http://localhost:8000
```
A localização funciona em `http://localhost` e em `https://`; em `http://` comum o navegador bloqueia.

## Limpeza (sempre manual)
`npm run limpar:simular` mostra o que seria removido; `npm run limpar:antigos` remove o que ficou fora da última coleta (faz backup antes e bloqueia se a nova base estiver incompleta).
