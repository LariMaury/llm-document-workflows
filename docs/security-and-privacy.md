# Segurança e privacidade

## 1. Objetivo

Esta seleção demonstra decisões de segurança sem transportar a superfície operacional da plataforma original. A execução local falha de forma controlada e opera somente com dados sintéticos, fixtures e componentes em memória.

## 2. Ativos protegidos

- credenciais e identificadores de ambientes reais;
- prompts privados e regras pedagógicas proprietárias;
- documentos enviados por usuários;
- nomes, matrículas e vínculos de estudantes;
- respostas, notas, transcrições e feedbacks;
- questões, templates e materiais curriculares protegidos;
- identidade visual e dados institucionais;
- logs e metadados operacionais.

## 3. Controles confirmados no projeto de origem

### Identidade e autorização

- autenticação Supabase por sessão;
- validação do token dentro das Edge Functions;
- owner derivado de `auth.uid()` no banco;
- RLS habilitada nas tabelas do núcleo;
- RPC `salvar_atividade` com `SECURITY INVOKER`;
- execução revogada para `PUBLIC` e `anon`;
- testes A/B/anônimo no projeto de origem.

### Minimização de dados

- documentos usados pela geração são processados em memória;
- o pipeline de correção foi desenhado para não armazenar o scan original;
- lotes persistem identidade física, estado e resultado estruturado;
- métricas técnicas não precisam conter resposta ou imagem;
- o cliente libera Base64 após o consumo da janela ativa.

### Integridade

- atividade e questões são salvas na mesma transação;
- campos aceitos pela RPC usam allowlist;
- snapshots de emissão têm hash e triggers de imutabilidade;
- idempotência evita duplicação de emissões e lotes;
- finalização distingue rascunho, revisão e estado imutável.

### Entrada não confiável

- limite de tamanho do arquivo;
- validação do alfabeto Base64;
- proteção contra quantidade excessiva de entradas ZIP;
- limite de expansão descompactada;
- rejeição de ZIP64 no extrator atual;
- limite de páginas e timeouts de PDF;
- sanitização restritiva do HTML das questões.

## 4. Riscos identificados

| Risco | Impacto | Tratamento na vitrine |
|---|---|---|
| configuração real copiada por engano | acesso indevido ou exposição operacional | nenhuma configuração de ambiente é versionada |
| chave anônima apontando para produção | exposição desnecessária do projeto real | nenhum endpoint real está incluído |
| abuso de funções pagas | custo e indisponibilidade | não existem adaptadores ou chamadas externas |
| logs de saída do modelo | conteúdo pedagógico ou pessoal em observabilidade | sem telemetria; saída CLI contém somente métricas sintéticas |
| demo guardando senha em `localStorage` | reutilização acidental de senha real | não há autenticação nem uso de `localStorage` |
| dependências sem integridade | supply-chain e quebra de reprodutibilidade | versões fixadas, lockfile, `npm ci` e auditoria registrada |
| XSS em templates HTML | execução de conteúdo não confiável | a vitrine não renderiza DOM ou templates HTML |
| documentos hostis | CPU, memória e parser abuse | limites, magic bytes, timeout e testes de entradas inválidas |
| prompt injection | saída inadequada ou exfiltração contextual | nenhum provedor ou ferramenta é chamado; fixture passa por normalização e revisão |
| correção automatizada incorreta | dano pedagógico | não há correção de respostas reais nem alegação de acurácia |

## 5. Modelo de ameaça resumido

### Fronteiras de confiança

1. documento fornecido pelo usuário → não confiável;
2. navegador → parcialmente confiável, nunca autoridade de ownership;
3. Edge Function → fronteira autenticada, mas ainda processa entrada hostil;
4. provedor de LLM → terceiro externo e probabilístico;
5. normalizador → reduz formato, não garante verdade pedagógica;
6. revisão humana → decisão editorial;
7. PostgreSQL/RLS → autoridade de identidade e integridade persistente.

### Ameaças prioritárias

- falsificação de owner no payload;
- acesso cruzado entre contas;
- gravação parcial após falha;
- duplicidade por retry;
- arquivo compactado adversarial;
- resposta do LLM com estrutura inesperada;
- vazamento de documento ou prompt em log;
- persistência automática sem revisão;
- reaproveitamento de artefatos reais na demonstração.

## 6. Política de dados da demonstração

- nomes fictícios claramente marcados;
- escolas, turmas e documentos inventados;
- conteúdo pedagógico original criado para o exemplo;
- PDFs gerados pelo próprio repositório-vitrine;
- nenhuma cópia de fixture física da plataforma;
- nenhuma telemetria remota por padrão;
- nenhum arquivo temporário é criado pela demonstração;
- respostas de LLM mantidas em fixtures versionadas e revisadas.

## 7. Retenção e observabilidade da demonstração

| Item | Comportamento implementado |
|---|---|
| arquivo sintético carregado | somente durante o processo local |
| payload Base64 testado | somente durante a chamada local |
| resposta fixture de LLM | versionada, sem PII |
| relatório | métricas sintéticas limitadas, sem documento ou conteúdo privado |
| resultado normalizado | mantido em memória durante a execução |
| persistência | estado em memória descartado ao encerrar o processo |

## 8. Condições para qualquer demonstração online futura

- projeto isolado e descartável;
- nenhuma reutilização de credencial ou endpoint da plataforma privada de origem;
- rate limit e quota de custo;
- política de privacidade específica;
- CSP e headers de segurança;
- dependências travadas e auditadas;
- revisão de logs;
- exclusão automatizada de dados;
- consentimento explícito para qualquer documento enviado.
