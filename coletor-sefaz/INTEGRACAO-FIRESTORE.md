# Integração do coletor com o Firestore — PreçoAí

Esta etapa adiciona a sincronização ao coletor sem alterar os arquivos HTML, CSS ou JavaScript do aplicativo.

## O que o sincronizador faz

- Lê os JSON já produzidos em `coletor-sefaz/dados/coletas/`.
- Prepara documentos para as coleções existentes `produtos`, `estabelecimentos` e `precos`.
- Usa IDs estáveis para evitar duplicar a mesma loja e o mesmo preço no mesmo dia.
- Preserva preços diferentes e registros de dias diferentes como histórico.
- Usa `set(..., { merge: true })`; não apaga documentos.
- Grava em lotes menores que o limite de 500 operações do Firestore.
- Por padrão, executa apenas uma simulação. A gravação exige `--executar`.

## 1. Simular primeiro

No CMD:

```cmd
cd C:\Users\Motoya\Documents\precoai-passo2-coletor\precoai-passo1\coletor-sefaz
node sincronizar-firestore.js --produto=arroz
```

A simulação não acessa nem altera o Firestore. Ela mostra quantos documentos seriam preparados.

## 2. Gravar o arroz no Firestore

Somente depois de conferir a simulação:

```cmd
node sincronizar-firestore.js --produto=arroz --executar
```

O script exige `serviceAccountKey.json` nesta pasta e confere se a credencial pertence ao projeto `precoai-sistema`.

Para limitar a uma pequena amostra:

```cmd
node sincronizar-firestore.js --produto=arroz --limite=10
node sincronizar-firestore.js --produto=arroz --limite=10 --executar
```

## 3. Abrir o protótipo

Depois da sincronização, volte à pasta do aplicativo e inicie um servidor local:

```cmd
cd ..
py -m http.server 8000
```

Abra no navegador:

```text
http://localhost:8000
```

No protótipo, use o botão **Ativar localização**. O aplicativo consulta os preços em estabelecimentos dentro do raio de 3 km da localização autorizada pelo navegador.

## Estrutura gravada

### `produtos`
- Documento: ID do catálogo (ex.: `arroz`)
- Campos: `nome`, `categoriaId`, `unidadeReferencia`, `fonte`, `atualizadoEm`

### `estabelecimentos`
- Documento: hash estável do nome + endereço
- Campos: `nome`, `endereco`, `bairro`, `municipio`, `latitude`, `longitude`, `fonte`, `atualizadoEm`

### `precos`
- Documento: hash estável de produto + estabelecimento + descrição + preço + dia
- Campos: `produtoId`, `estabelecimentoId`, `preco`, `dataConsulta`, `nomeEncontrado`, `unidadeReferencia`, `unidadeConfirmada`, `fonte`, `endereco`

Esses campos atendem às relações consultadas atualmente por `js/banco.js`: `preco.produtoId === produto.id`, `preco.estabelecimentoId === estabelecimento.id`, além de `preco.preco`, `preco.dataConsulta` e das coordenadas do estabelecimento.

## Cuidados

- O sincronizador não apaga dados de teste existentes.
- O sincronizador não altera o aplicativo.
- `unidadeConfirmada` permanece falsa quando a coleta não confirmou a embalagem. O protótipo pode mostrar o preço observado, mas ainda não deve tratar preços de embalagens diferentes como preço por kg/litro.
- O acesso real ao Firestore deve ser testado no computador do projeto; a tentativa de inspeção remota nesta sessão expirou sem confirmar a conexão.
- Não compartilhe `serviceAccountKey.json`. Como essa chave apareceu no ZIP enviado, revogue-a no Google Cloud e gere uma nova antes de usar a gravação real.
