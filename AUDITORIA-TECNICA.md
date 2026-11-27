# Auditoria técnica — PreçoAí (pacote enviado)

## Escopo
Revisão dos arquivos do ZIP recebido: HTML, JavaScript do navegador, coletor Node.js, sincronizador Firestore, regras, dependências e GitHub Actions.

## Resultado verificado
- 30 produtos: catálogo da interface e catálogo SEFAZ consistentes.
- 36 arquivos JSON: todos abriram sem erro de sintaxe.
- Arquivos JavaScript do projeto: passaram em `node --check`.
- Teste isolado de `menoresPrecos`: coordenadas nulas são rejeitadas e a descrição é formatada corretamente.
- O fluxo não foi executado contra o Firestore real, porque isso exige credenciais privadas.
- A coleta atual da SEFAZ-AM não foi validada ao vivo nesta auditoria.

## Correções aplicadas
1. `js/precos.js`: corrigido o caso em que `Number(null)` e `Number("")` viravam `0`, podendo tratar ofertas sem coordenadas como se estivessem em latitude/longitude zero. Agora valida valores ausentes e limites geográficos.
2. `js/precos.js`: corrigida a expressão de formatação de unidade após a conversão do texto para minúsculas.
3. `coletor-sefaz/package.json`: `npm test` agora executa validação do catálogo e testes de filtros, em vez de falhar com a mensagem padrão "no test specified".
4. `coletor-sefaz/package.json`: `npm run atualizar` deixou de incluir a limpeza do Firestore.
5. `.github/workflows/atualizar-precos.yml`: removida a exclusão automática diária de documentos. O workflow continua coletando e sincronizando.
6. `limpar-antigos.js`: exclusão real exige `--executar` e a confirmação adicional `--confirmar-projeto=precoai-sistema`.
7. `README.md`: instruções de teste, atualização e limpeza foram ajustadas.
8. GitHub Actions: cron alterado para 04:17 em Manaus, com permissões mínimas e proteção contra execuções simultâneas.

## Pontos que exigem atenção antes de produção
- Instalar dependências com `npm ci` dentro de `coletor-sefaz`.
- Executar `npm test` depois da instalação.
- Executar `npm run coletar:teste-real` para validar uma consulta pequena à SEFAZ-AM.
- Conferir o resultado JSON antes de sincronizar com Firestore.
- Configurar `FIREBASE_SERVICE_ACCOUNT` em GitHub → Settings → Secrets and variables → Actions.
- O arquivo `serviceAccountKey.json` nunca deve ser enviado ao GitHub nem compartilhado em ZIP.
- `npm run coletar:teste` depende de `coletor-sefaz/dados/resposta-arroz.html`, que não veio no ZIP.
- A exclusão antiga considera as coleções `precos`, `resumo` e `estabelecimentos`; não executar até revisar os documentos e a regra de retenção desejada.

## Automação recomendada
Para este repositório, GitHub Actions é a opção inicial mais simples: o projeto já contém workflow, instala Node 22, executa coleta e sincroniza com Firestore. Em repositório público, runners padrão do GitHub Actions não consomem minutos faturáveis; em repositório privado, aplicam-se as cotas do plano.
