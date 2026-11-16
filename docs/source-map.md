# Mapa de origem e adaptações

Este documento diferencia código adaptado de uma plataforma educacional privada e código criado apenas para a demonstração. Nenhum prompt pedagógico, credencial, configuração de ambiente, dado real ou adaptador de produção foi incluído.

## Classificação

- **Adaptado:** preserva a lógica essencial de uma função original, com renomeação, redução de dependências ou portabilidade para Node.js.
- **Criado para demonstração:** não existia como componente isolado no projeto de origem; serve apenas para compor uma execução local verificável.
- **Omitido:** permaneceu no projeto privado por não ser necessário ou por apresentar risco de divulgação.

## A. LLM Integration & Human-in-the-Loop

| Arquivo público | Símbolo | Origem | Classificação | Adaptação |
|---|---|---|---|---|
| `src/llm/normalize-activity.js` | `extractJson` | `site/supabase/functions/gerar-atividade-ia/index.ts:156` | adaptado | removidos detalhes de provedor; aceita somente texto simulado |
| mesmo arquivo | `normalizeBnccCodes` | mesmo arquivo, `:181` | adaptado | nomes em inglês técnico; limites preservados |
| mesmo arquivo | `normalizeActivity` | mesmo arquivo, `:198` | adaptado | parâmetros reunidos em objeto; contrato e limites preservados |
| mesmo arquivo | `createHumanReview`, `approveHumanReview` | fluxo de editor em `site/app.js` | criado para demonstração | torna a barreira humana explícita e testável |

Omitidos: prompt de sistema, instruções pedagógicas, autenticação, chamada ao provedor, chaves e tratamento específico do ambiente Supabase.

## B. Secure Document Ingestion

| Arquivo público | Símbolo | Origem | Classificação | Adaptação |
|---|---|---|---|---|
| `src/ingestion/secure-document-ingestion.js` | `decodeBase64File` | `processar-material-atividade/index.ts:39` | adaptado | portado para execução local; limite de 5 MB preservado |
| mesmo arquivo | `validateZip` | mesmo arquivo, `:84` | adaptado | inspeção do diretório central e limites preservados |
| mesmo arquivo | `extractDocx` | mesmo arquivo, `:128` | adaptado | usa `fflate 0.8.3`, atualização corretiva auditada |
| mesmo arquivo | `withTimeout`, `extractPdf` | mesmo arquivo, `:149` e `:163` | adaptado | dependências injetáveis para testes; destruição do parser preservada |
| mesmo arquivo | `processDocumentBytes` | handler do mesmo arquivo, `:196`–`:227` | adaptado | removidos HTTP, CORS, autenticação e Supabase |
| `demo/synthetic-documents.js` | geradores DOCX/PDF | sem equivalente | criado para demonstração | gera somente conteúdo artificial em memória |

Os limites preservados são: arquivo de 5 MB, texto de 500 mil caracteres, PDF de 200 páginas, ZIP descompactado de 25 MB e até 1.000 entradas.

## C. Transactional Data Contracts

| Arquivo público | Símbolo | Origem | Classificação | Adaptação |
|---|---|---|---|---|
| `src/contracts/activity-contract.js` | normalização monetária e BNCC | `site/atividade-contrato.js:10`–`:71` | adaptado | nomes portáveis; aritmética inteira preservada |
| mesmo arquivo | `normalizeQuestionForPersistence` | mesmo arquivo, `:82` | adaptado | aceita o formato normalizado da demonstração |
| mesmo arquivo | `buildSaveActivityArguments` | mesmo arquivo, `:108` | adaptado | reduz metadados privados; mantém forma `p_atividade`/`p_questoes` |
| mesmo arquivo | validações de questões e pontuação | mesmo arquivo, `:163`–`:209` | adaptado | mensagens e regras essenciais preservadas |
| `src/contracts/simulated-transaction-store.js` | `SimulatedTransactionStore` | sem equivalente | criado para demonstração | simula preparação, commit e rollback em memória |

A classe em memória não implementa PostgreSQL, autenticação, transações reais nem RLS. A implementação real permanece documentada, mas não é simulada como evidência de banco em execução.

## D. Asynchronous Processing

| Arquivo público | Símbolo | Origem | Classificação | Adaptação |
|---|---|---|---|---|
| `src/async/resilient-processing.js` | `processQueueWithConcurrency` | `site/folha-respostas-contrato.js:12` | adaptado | nomes em inglês; limite máximo de quatro preservado |
| mesmo arquivo | `processWithBackpressure` | mesmo arquivo, `:30` | adaptado | callbacks renomeados; liberação em `finally` preservada |
| mesmo arquivo | classificação transitória e `retryDelayMs` | `site/leitor-robustez-contrato.js:1`–`:30` | adaptado | categorias reduzidas às necessárias para a demo |
| mesmo arquivo | `processWithRetry` | política integrada originalmente em `site/app.js` | criado para demonstração | orquestra retry local com relógio injetável |

Omitidos: leitor de folhas, OCR, processamento visual, lotes reais, rede, chamadas de Edge Functions e persistência de progresso.

## Estado de publicação

O recorte público contém somente os arquivos selecionados e atribuídos à autora no histórico do projeto de origem. Dependências e condições de uso estão registradas em `NOTICE.md`; nenhuma licença aberta foi concedida. Prompts, dados, marca, materiais curriculares e configurações privadas permanecem excluídos.
