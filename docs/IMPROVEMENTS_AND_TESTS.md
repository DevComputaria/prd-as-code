# Análise do Repositório: Melhorias e Novos Testes

Este documento apresenta uma análise detalhada da arquitetura, compilador, domínio, CLI e governança do **PRD as Code** (`@devcomputaria/prd-as-code`), identificando oportunidades de melhorias técnicas e novos testes automatizados para fortalecer o framework.

---

## 1. Visão Geral do Projeto

O **PRD as Code** é um framework TypeScript monolítico e modular (Node.js 22+) que provê vocabulário, regras, requisitos, decisões, processos e evidências versionadas através do CLI `prd`. O sistema utiliza um compilador nativo que lê arquivos YAML e Gherkin (`.feature`), valida schemas AJV, constrói um grafo de dependências e avalia tabelas de decisão DMN (`dmn-table/v1`).

---

## 2. Melhorias Recomendadas

### 2.1 Compilador e Parsing
1. **Suporte a Execução de Rows em Scenario Outlines (Gherkin)**:
   - *Situação Atual*: O compilador detecta `Scenario Outline` e emite um aviso `GHERKIN_OUTLINE_NOT_BOUND` sem associar as linhas da tabela de `Examples` a casos de teste.
   - *Melhoria*: Expandir o parser para que cada linha de um `Examples` gere uma instância de cenário associada com tags derivadas ou parâmetros específicos.
2. **Localização Precisa de Erros em Arquivos YAML/Front Matter**:
   - *Situação Atual*: Quando ocorre erro de schema AJV ou sintaxe em YAML, os diagnósticos nem sempre informam a linha e coluna exatas do campo inválido.
   - *Melhoria*: Integrar os metadados de AST do pacote `yaml` aos erros de validação AJV para indicar linha e coluna exatas do erro na CLI e IDEs.
3. **Expansão de Expressões SBVR em BusinessRules**:
   - *Situação Atual*: Regras narrativas sem `formulation` são marcadas como `unsupported`.
   - *Melhoria*: Expandir o schema `sbvr-core/v1` para suportar quantificadores múltiplos (ex.: `forAll` combinado com `thereExists`) e expressões lógicas compostas (`and`, `or`, `implies`).

### 2.2 Domínio e Avaliação de Decisões
1. **Suporte a Tipos Complexos e Intervalos DMN**:
   - *Situação Atual*: Suporta apenas escalar boolean, number, string com igualdade exata.
   - *Melhoria*: Adicionar suporte a tipos de data/hora (`date-time`) e condições de intervalo (ex.: `10..50`, `< 100`, `>= 0`) na avaliação de decisões.
2. **Novas Politicas de Decisão (Hit Policies)**:
   - *Situação Atual*: Suporta apenas Hit Policy `UNIQUE`.
   - *Melhoria*: Adicionar suporte às hit policies `FIRST`, `PRIORITY` e `COLLECT` no runtime de referência e nos adapters.

### 2.3 CLI e Experiência do Desenvolvedor (DX)
1. **Comando Watch (`prd watch`)**:
   - *Melhoria*: Implementar `--watch` no `validate` e `test` para revalidar/testar automaticamente alterações nos arquivos do diretório `product/`.
2. **Relatórios Visuais no Terminal e Saídas Coloridas**:
   - *Melhoria*: Adicionar formatadores de tabela e suporte a cores (ANSI styles) na CLI para saídas humanas mais legíveis.
3. **Autocomplete Shell Completion**:
   - *Melhoria*: Adicionar gerador de scripts de autocompletar para Bash/Zsh (`prd completion`).

### 2.4 Governança, Mudanças e Citações
1. **Aprovações Múltiplas (M-of-N Reviewers)**:
   - *Situação Atual*: A proposta armazena apenas um aprovador em `change.approval`.
   - *Melhoria*: Permitir política configurable de aprovação (ex.: exigir 2 ou mais aprovadores antes de aplicar o `apply`).
2. **Exportação/Importação de Bundles de Mudança**:
   - *Melhoria*: Permitir exportar um `change` como um arquivo zip/tarball assinado contendo os rascunhos para ser revisado em CI ou PRs do GitHub.

### 2.5 Performance e Escalabilidade
1. **Cache de Compilação baseado em Hashes de Arquivos**:
   - *Melhoria*: Evitar recalcular compilação inteira quando apenas um arquivo do produto foi alterado, utilizando cache parcial baseado em hash/mtime.

---

## 3. Novos Testes Recomendados

### 3.1 Testes Baseados em Propriedades (Property-Based Testing)
1. **Gerador de Tabelas de Decisão Aleatórias**:
   - Gerar matrizes de decisão sintéticas válidas e verificar se a análise finita (`analyzeDecision`) identifica corretamente lacunas (`DECISION_GAP`) e sobreposições (`DECISION_OVERLAP`).
2. **Validação de Invariantes em Grafos Apressados**:
   - Gerar grafos de artefatos aleatórios para testar a detecção de ciclos de dependência (`DEPENDENCY_CYCLE`).

### 3.2 Testes de Casos de Borda do Compilador e Gherkin
1. **Tags Múltiplas ou Inválidas de Cenário**:
   - Testar arquivos `.feature` com mais de uma tag `@scenario_` ou tags malformadas (ex.: `@scenario_123` em vez de `@scenario_SCN-001`).
2. **Tags de Relação Inválidas no Gherkin**:
   - Testar cenários Gherkin com tags como `@requirement_REQ-INVALID` ou `@rule_` apontando para IDs não existentes ou com tipos trocados.
3. **Arquivos com Encoding Especial e Unicode BOM**:
   - Testar se o compilador lida corretamente com arquivos salvos em UTF-8 com BOM (`\uFEFF`) e com diferentes quebras de linha (`\r\n` vs `\n`).

### 3.3 Testes de Concorrência e Sistema de Arquivos
1. **Acesso Concorrente ao Lock System**:
   - Testar comportamento quando múltiplos processos tentam adquirir `.intent/lock` simultaneamente.
2. **Recuperação de Interrupções de Disco durante `apply`**:
   - Testar falhas simuladas de escrita na metade da aplicação de um batch de arquivos para verificar o isolamento e rollback via journal `.intent/pending.json`.

### 3.4 Testes de Segurança e Paridade OPA
1. **Sanitização de Nomes e Strings no Gerador OPA**:
   - Testar se caracteres especiais, aspas ou nomes de regras contendo caracteres reservados em Rego não causam injeção de código na geração de policies OPA.
2. **Paridade em Valores Numéricos Limite**:
   - Testar paridade entre o runtime de referência e OPA para valores extremos como `Number.MAX_SAFE_INTEGER`, números decimais de alta precisão e valores negativos.

---

## 4. Próximos Passos
- Implementar testes de casos de borda em `tests/native.test.mjs` cobrindo validações Gherkin e verificações estritas do compilador.
