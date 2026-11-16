# Segurança e privacidade

## 1. Objetivo

Esta seleção deve mostrar decisões de segurança sem transportar a superfície operacional da plataforma original. A demonstração pública será construída para falhar de forma segura e operar com dados sintéticos e serviços mockados.

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
| configuração real copiada por engano | acesso indevido ou exposição operacional | usar somente arquivos `.example` com valores fictícios |
| chave anônima apontando para produção | exposição desnecessária do projeto real | nenhum endpoint real será incluído |
| abuso de funções pagas | custo e indisponibilidade | mocks por padrão; quota obrigatória antes de qualquer adaptador real |
| logs de saída do modelo | conteúdo pedagógico ou pessoal em observabilidade | logging estruturado sem payload e testes de redaction |
| demo guardando senha em `localStorage` | reutilização acidental de senha real | não copiar o mecanismo de autenticação do modo demo |
| dependências por CDN sem integridade | supply-chain e quebra de reprodutibilidade | manifesto, lockfile e build local na futura adaptação |
| XSS em templates HTML | execução de conteúdo não confiável | APIs seguras, escaping central e testes específicos |
| documentos hostis | CPU, memória e parser abuse | limites, magic bytes, timeout e corpus de arquivos adversariais sintéticos |
| prompt injection | saída inadequada ou exfiltração contextual | conteúdo isolado, schema estrito, sem ferramentas privilegiadas e revisão humana |
| correção automatizada incorreta | dano pedagógico | nunca finalizar sem revisão; rotular como sugestão |

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
- limpeza automática dos arquivos temporários locais;
- respostas de LLM mantidas em fixtures versionadas e revisadas.

## 7. Retenção e observabilidade propostas

| Item | Retenção proposta |
|---|---|
| arquivo sintético carregado | somente durante o processo local |
| Base64 de página | somente na janela ativa |
| resposta fixture de LLM | versionada, sem PII |
| logs | evento, duração, categoria de erro e ID sintético; nunca payload |
| resultado normalizado | memória ou fixture sintética |
| banco local opcional | recriado por seed sintético |

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
