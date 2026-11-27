# Checklist do MVP — PreçoAí

## Já corrigido neste pacote
- Catálogo v2: critérios de inclusão que nunca batiam (carne bovina, ovos, macaxeira, temperos) agora funcionam; exclusões ampliadas (leite de coco, creme de leite, batata palha, produtos "sabor X", limpeza com cheiro de laranja etc.).
- Ovos agora comparam por ovo (C/12, 30 UN, dúzia); iogurte, chá e temperos comparam por kg.
- Lojas sem coordenada não somem mais do ranking de Manaus inteira.
- Coletor: 3 tentativas com espera, falha numa página não perde as outras, aborta se vier zero resultados.
- Busca: palavra por início (sal ≠ salsicha), plural, sinônimos (aipim = macaxeira), erro de digitação, ordem por relevância, mínimo de 2 letras, data da nota mais recente na tela.
- `npm test` roda 60+ verificações (catálogo, filtros, coordenadas, busca).

## Novidades da v3
- Busca por marca, filtros (marca, mercado, ordem), modo "Todas as ofertas", coleta por marca, tela de Cesta/Favoritos, manifest do app.
- Depois da primeira coleta completa: `cd coletor-sefaz && npm run auditar` e acrescente em `js/marcas.js` as marcas que aparecerem na lista "faltam no dicionário".

## Antes de publicar (nesta ordem)
1. `cd coletor-sefaz && npm ci && npm test`
2. `npm run coletar:teste-real` e confira o JSON gerado.
3. Firebase → Firestore → Regras: publicar `firestore.rules`.
4. GitHub → Secrets: `FIREBASE_SERVICE_ACCOUNT` (JSON da chave; nunca no repositório).
5. Actions → "Atualizar preços" → Run workflow. Conferir "gravados e conferidos" no log.
6. Publicar o site: `firebase deploy --only hosting` (https automático).
7. Google Cloud → Credenciais → restringir a chave de API do navegador ao seu domínio.
8. Testar no celular: Home, categoria, produto, busca ("arros", "aipim", "ovo"), localização.
9. Ligar o agendamento (descomentar `schedule` no workflow).

## Depois do MVP
- Separar "Temperos" em produtos próprios (cominho, colorau, pimenta).
- Página Mapa ainda mostra "Em breve" (Cesta e Favoritos já funcionam).
- Termos de uso/política de privacidade e citação da fonte SEFAZ-AM.
