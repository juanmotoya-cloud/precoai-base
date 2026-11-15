# PreçoAí — projeto web

## Etapas da integração SEFAZ-AM

- **Passo 1:** catálogo de 30 produtos e regras iniciais em `dados/catalogo-sefaz.json`.
- **Passo 2:** coletor genérico em `coletor-sefaz/index.js`, com pesquisa por termos, paginação configurável, extração de dados, filtros, deduplicação e saída JSON por produto.

## Testes do coletor
Entre em `coletor-sefaz` e execute:

```bash
npm install
npm run validar:catalogo
npm run testar:filtros
npm run coletar:teste
```

Consulte `coletor-sefaz/PASSO-1-CATALOGO.md` e `coletor-sefaz/PASSO-2-COLETOR.md` para instruções.

## Atenção
A etapa 2 ainda não envia dados ao Firestore e não cria endpoints HTTP no Render. A coleta real deve ser testada primeiro com um único produto. A disponibilidade, estrutura HTML e regras de consulta da SEFAZ-AM podem mudar sem aviso.

## Correções (passo 3)
- **Coletor:** resposta da SEFAZ decodificada como ISO-8859-1 (acabou o "H�" e os acentos quebrados). Ao coletar de novo, o texto vem correto.
- **Sincronizador:** calcula a data real da nota, o bairro, o tamanho da embalagem e o preço por kg/litro; descarta ADICIONAL/PORÇÃO e preços fora da faixa; grava a coleção `resumo` (1 documento por produto).
- **App:** lê só `resumo` (≈30 leituras), mostra a cesta e "Mais buscados" com dados reais, pesquisa por nome/categoria/marca, filtra por categoria, guarda a lista no navegador e mostra Manaus inteira antes de ativar o GPS (raio de 3 km depois).
- **Catálogo:** ids sem acento (`feijao-carioca`) e campos `unidadeComparacao`, `cesta`, `popular`, `ordem`.
- `firestore.rules`: copie para o Console do Firebase (Firestore → Regras) e publique.

## Como rodar
```bash
cd coletor-sefaz
node index.js --limite-produtos=30 --max-paginas=3 --pausa-ms=2000   # coleta
node sincronizar-firestore.js                                        # simulação
node sincronizar-firestore.js --executar                             # grava no Firestore
cd .. && py -m http.server 8000                                      # abre http://localhost:8000
```
Coloque a **nova** `serviceAccountKey.json` em `coletor-sefaz/` (nunca em ZIP ou GitHub).
