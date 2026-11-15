# Passo 2 — Coletor genérico SEFAZ-AM

## O que mudou
- O coletor lê `../dados/catalogo-sefaz.json` e não usa mais o termo fixo `arroz`.
- Pesquisa cada termo configurado para o produto.
- Envia a pesquisa inicial por POST e tenta percorrer as páginas seguintes por GET, preservando cookies da sessão.
- Limita páginas e adiciona pausas para reduzir a frequência de requisições.
- Extrai nome, preço, estabelecimento, endereço, coordenadas, tempo desde a emissão e página.
- Aplica critérios de inclusão e exclusão, descarta preços inválidos/iguais a R$ 0,01 e remove duplicidades.
- Salva um JSON por produto em `coletor-sefaz/dados/coletas/` e um resumo da execução.
- Falhas de um termo ficam registradas e não encerram a coleta dos outros termos/produtos.

## Instalar dependências
Na pasta `coletor-sefaz`:

```bash
npm install
```

## Testes locais sem acessar a SEFAZ
```bash
npm run validar:catalogo
npm run testar:filtros
npm run coletar:teste
```

`coletar:teste` usa o HTML de amostra salvo anteriormente. Isso testa a extração, não comprova que a SEFAZ esteja respondendo atualmente.

## Teste de consulta real — somente um produto
```bash
npm run coletar:arroz
```

Ou escolha qualquer ID do catálogo:
```bash
node index.js --produto=leite --max-paginas=2
```

## Teste de poucos produtos
```bash
node index.js --limite-produtos=2 --max-paginas=2 --max-termos=1 --pausa-ms=1500
```

## Coleta de todos os produtos
```bash
npm run coletar
```

Por padrão, o coletor usa até 3 páginas por termo e pausa de 1200 ms entre requisições. A SEFAZ pode alterar o HTML, limitar consultas ou exigir comportamento de sessão diferente; por isso, valide primeiro um produto e aumente gradualmente.

## Variáveis de ambiente
- `MAX_PAGINAS`: padrão 3.
- `PAUSA_MS`: padrão 1200.
- `TIMEOUT_MS`: padrão 30000.
- `LIMITE_PRODUTOS`: padrão 0 (todos).
- `MAX_TERMOS`: padrão 0 (todos os termos).
- `SALVAR_HTML=1`: salva HTMLs por produto/termo/página para diagnóstico.

## Limitações desta etapa
- Ainda não grava no Firestore.
- Ainda não publica endpoints HTTP no Render.
- Não normaliza tamanhos/quantidades para comparar preço por kg/litro/unidade. `unidadeConfirmada` permanece `false` para evitar comparações enganosas.
- As coordenadas podem estar ausentes em alguns estabelecimentos.
- O raio de 3 km será aplicado depois, quando os dados estiverem armazenados e os estabelecimentos tiverem coordenadas válidas.
