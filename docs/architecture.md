# Arquitetura da seleção técnica

> Status da Etapa 3: os quatro recortes descritos abaixo possuem agora implementações locais e testes independentes. O mapa entre origem e adaptação está em [source-map.md](source-map.md).

## 1. Escopo

Esta documentação descreve relações confirmadas no código de uma plataforma educacional privada e propõe como apresentá-las sem publicar o produto completo. Os caminhos citados pertencem ao repositório privado de origem e não são dependências deste projeto.

As quatro áreas escolhidas formam dois fluxos relacionados:

1. geração de atividade a partir de documento ou instrução textual;
2. processamento progressivo de páginas para leitura e revisão assistida.

O primeiro fluxo possui núcleo de persistência implementado. Partes mais recentes do segundo fluxo — alunos, snapshots V3, correções persistentes, lotes e relatórios — foram documentadas como validadas apenas em staging e, por isso, permanecem experimentais nesta apresentação.

## 2. Componentes reais

### Navegador

Responsabilidades confirmadas:

- seleção e validação inicial de arquivos;
- renderização progressiva de páginas PDF;
- edição e revisão do conteúdo normalizado;
- estado de interface e cancelamento;
- construção do payload de domínio;
- chamadas ao gateway de dados.

Evidências de origem:

- `site/app.js:1889` — início da geração de atividade por IA;
- `site/app.js:1961` — chamada ao gateway de geração;
- `site/app.js:1984` e `site/app.js:2040` — inserção da resposta no editor;
- `site/app.js:2644` — ação de salvamento revisado;
- `site/app.js:4339`–`4477` — inspeção e renderização de PDFs;
- `site/app.js:5347`–`5418` — processamento progressivo com liberação de recursos.

### Gateway de dados

`site/dados.js` oferece uma interface assíncrona comum para modo demonstrativo e Supabase. Os pontos mais relevantes para esta seleção são:

- `apiSupabase.gerarAtividadeIA` — invoca a Edge Function de geração;
- `apiSupabase.processarMaterialAtividade` — envia documento à extração segura;
- `apiSupabase.lerFolhaRespostas` — envia uma página preparada ao leitor multimodal;
- `apiSupabase.salvarConjunto` — usa exclusivamente a RPC transacional `salvar_atividade`.

O gateway não constitui uma API REST própria. Ele consome Supabase Auth, PostgREST, RPCs PostgreSQL e Edge Functions.

### Edge Functions

Responsabilidades confirmadas:

- autenticação do token no servidor;
- verificação de existência do perfil;
- leitura de segredos somente no ambiente server-side;
- validação e limitação de entradas;
- chamada ao provedor de LLM;
- normalização e limitação da saída antes de responder ao navegador.

Arquivos prioritários:

- `site/supabase/functions/gerar-atividade-ia/index.ts`;
- `site/supabase/functions/processar-material-atividade/index.ts`;
- `site/supabase/functions/ler-folha-respostas/index.ts`;
- `site/supabase/functions/gerar-textos-planejamento/index.ts`.

Os prompts completos não fazem parte do escopo publicável.

### PostgreSQL e Supabase

O núcleo selecionado usa:

- `auth.uid()` como identidade autoritativa;
- RLS para isolar dados por professor;
- `SECURITY INVOKER` na RPC de atividade;
- payloads JSONB com lista explícita de campos permitidos;
- transação única para atividade e questões;
- grants revogados para `PUBLIC` e `anon` e concedidos a `authenticated`;
- constraints de tipo, ordem, conteúdo e ownership.

Evidências principais:

- `site/atividade-contrato.js:108` — montagem dos argumentos canônicos;
- `site/dados.js:1336` — persistência sem fallback fragmentado;
- `site/supabase/migrations/20260810173000_criar_rpc_salvar_atividade.sql:11` — RPC atômica;
- `site/supabase/schema_individual.sql:285`–`324` — RLS e policies do núcleo.

## 3. Relação end-to-end confirmada

```mermaid
sequenceDiagram
    actor P as Pessoa usuária
    participant UI as Editor no navegador
    participant ING as Edge de ingestão
    participant LLM as Edge de LLM
    participant N as Normalizador
    participant RPC as RPC salvar_atividade
    participant DB as PostgreSQL + RLS

    P->>UI: Seleciona documento sintético
    UI->>ING: Arquivo + metadados limitados
    ING->>ING: Valida, limita e extrai texto
    ING-->>UI: Texto normalizado
    UI->>LLM: Contexto e parâmetros validados
    LLM->>LLM: Autentica e chama o provedor
    LLM->>N: Resposta estruturada
    N-->>UI: Atividade normalizada ou erro controlado
    UI-->>P: Exibe conteúdo editável
    P->>UI: Revisa e confirma
    UI->>RPC: Payload de atividade + questões
    RPC->>DB: Valida owner e grava atomicamente
    DB-->>UI: Resultado mínimo
```

Relações importantes:

- a ingestão segura pode anteceder a chamada de IA, mas não persiste o documento original;
- a geração por IA não chama a RPC de salvamento;
- a revisão humana é uma fronteira real entre geração e persistência;
- a RPC deriva o owner da sessão e rejeita campos não permitidos;
- erros de validação preservam o conteúdo do editor para nova tentativa.

## 4. Pipeline assíncrono

O módulo `site/folha-respostas-contrato.js` é independente de DOM, Supabase e IA. Ele implementa:

- `processarFilaComConcorrencia`: limite entre uma e quatro tarefas;
- `processarFluxoComBackpressure`: prepara e consome uma janela por vez;
- callbacks separados para falha de preparação e processamento;
- cancelamento cooperativo por `deveInterromper`;
- liberação garantida em `finally`;
- preservação da posição original dos resultados;
- retomada baseada em `sourceFileId + sourcePageIndex`, sem confiar em OCR ou nome de arquivo.

`site/leitor-robustez-contrato.js` complementa o fluxo com classificação de erros, backoff exponencial limitado, métricas, contadores mutuamente exclusivos e estimativa de tempo restante.

## 5. Fronteira entre implementado e experimental

| Parte | Classificação nesta vitrine | Motivo |
|---|---|---|
| Contratos puros de atividade | Implementado | usados pelo cliente e cobertos por testes locais/de integração no projeto de origem |
| RPC `salvar_atividade` e RLS do núcleo | Implementado | promovidos segundo o ledger local do projeto de origem |
| Ingestão TXT/DOCX/PDF | Implementado | Edge integrada ao fluxo de atividade |
| Geração estruturada de atividade | Implementado | fluxo completo até o editor e revisão humana |
| Algoritmo de backpressure/retry | Implementado | módulo puro integrado ao leitor e exercitado por suítes locais |
| Leitura multimodal de folhas V2 | Implementado no produto de origem | publicação exata não será reproduzida aqui |
| Snapshots V3, alunos e correções | Experimental | migrations documentadas como staging-only |
| Lotes persistentes, arquivo e relatórios BNCC | Experimental | dependem dos blocos staging-only |
| Correção de produção textual | Experimental | módulo posterior ao baseline e dependente de avaliação multimodal |

## 6. Decisões para a futura extração

- Preservar os contratos puros como núcleo independente.
- Substituir o gateway real por portas/interfaces e adaptadores mockados.
- Não transportar a configuração dual completa de `dados.js`.
- Não copiar o controlador monolítico `app.js`; extrair somente orquestração mínima aprovada.
- Publicar uma migration reduzida e autocontida, não a cadeia histórica inteira.
- Representar o LLM por fixtures gravadas e um adaptador opcional sem credencial padrão.
