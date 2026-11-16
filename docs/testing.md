# Testes e resultados reproduzíveis

## Ambiente verificado

- Data: 16 de novembro de 2026.
- Node.js: `v24.13.0`.
- npm: `11.6.2`.
- Sistema: Windows.
- Serviços externos: nenhum.
- Credenciais: nenhuma.

## Comandos

```bash
npm ci --ignore-scripts
npm test
npm run demo
```

## Resultado final observado

```text
tests:     36
passed:    36
failed:     0
cancelled:  0
skipped:    0
todo:       0
duration:   2271.9535 ms
```

A duração pertence à execução local registrada e não deve ser interpretada como benchmark.

## Auditoria de dependências

O `npm audit --omit=dev` identificou inicialmente uma vulnerabilidade moderada em `fflate 0.8.2`. A dependência foi atualizada para a correção compatível `0.8.3`. A verificação final retornou **0 vulnerabilidades conhecidas**.

As dependências diretas `fflate 0.8.3` e `unpdf 1.8.0` declaram licença MIT. O projeto não incorpora seu código-fonte e registra as condições no `NOTICE.md`.

## Cobertura comportamental

| Componente | Casos exercitados |
|---|---|
| LLM simulado | JSON puro e cercado por Markdown, tipos permitidos, distribuição, questões inválidas, códigos BNCC, revisão humana |
| Ingestão | TXT, DOCX e PDF sintéticos; Base64; extensão; vazio; tamanho; divergência de tamanho; ZIP corrompido; truncamento; timeout; limite de páginas |
| Contratos | valores monetários, distribuição de centavos, BNCC, payload, alternativas, gabarito, pontuação, aprovação humana, commit e rollback |
| Assíncrono | ordem dos resultados, concorrência máxima, janelas, liberação em falha, cancelamento, classificação, backoff e limite de retries |
| Integração | fluxo completo executado duas vezes e comparado por igualdade estrutural |

## Falha encontrada durante a implementação

A primeira execução terminou com 35 aprovações e 1 falha. O relatório expunha a ordem temporal de liberação das tarefas concorrentes; essa ordem é legitimamente não determinística. O artefato foi corrigido para ordenar os identificadores apenas na apresentação. A concorrência e a ordem dos resultados continuam sendo testadas separadamente.

## Limites da evidência

- Os testes exercitam somente este repositório-vitrine.
- Nenhum teste da plataforma privada de origem foi executado nesta etapa.
- Não houve PostgreSQL, Supabase, RLS, staging, produção ou provedor de IA em execução.
- O rollback é uma simulação determinística em memória, não uma transação de banco.
- A extração PDF/DOCX usa arquivos criados em memória pela própria demonstração.
