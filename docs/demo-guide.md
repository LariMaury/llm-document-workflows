# Guia da demonstração local

## Preparação

Requisito: Node.js 22 ou superior.

```bash
npm ci --ignore-scripts
```

As dependências estão fixadas no `package-lock.json`. O projeto não lê variáveis de ambiente e não requer credenciais.

## Executar

```bash
npm run demo
```

A execução produz:

- `artifacts/demo-report.json` — resultado estruturado;
- `artifacts/demo-report.md` — resumo legível;
- saída JSON no terminal.

## O que acontece

1. Um TXT versionado e DOCX/PDF gerados em memória passam pela validação local.
2. Uma fixture JSON representa a resposta de um LLM que não foi chamado.
3. O normalizador aceita duas questões e descarta uma questão inválida.
4. Uma pessoa revisora fictícia aprova o conteúdo sintético.
5. O contrato cria um payload no formato da RPC, sem chamar banco.
6. A primeira transação simulada confirma o agregado.
7. A segunda falha depois das questões e demonstra rollback sem alteração do estado confirmado.
8. Cinco tarefas fictícias passam por janelas de backpressure; uma falha transitória é recuperada após um retry lógico.

## Resultado verificado

- formatos: TXT, DOCX e PDF;
- chamadas externas: 0;
- questões normalizadas: 2;
- questões descartadas: 1;
- commit simulado: confirmado;
- rollback simulado: estado preservado;
- tarefas liberadas: 5;
- retries: 1, com atraso calculado de 600 ms e relógio substituído na demonstração.

O atraso é calculado, mas a demo injeta uma função de espera vazia para permanecer rápida e determinística.
