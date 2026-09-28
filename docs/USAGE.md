# Guia de uso

Este guia mostra o ciclo de vida de um produto no PRD as Code. Os comandos são
executados no diretório do produto, salvo quando `-C/--root` é informado.

## 1. Inicialize um produto

```sh
prd init minha-transferencia --ai copilot --profile product-as-code \
  --behaviors gherkin --language pt
cd minha-transferencia
```

O comando cria a configuração, os diretórios `product/` e `framework/`, exemplos
de artefatos e, quando solicitado, o kit opcional do Copilot em `.github/`. Ele
não sobrescreve arquivos existentes e não instala dependências. Em um repositório
já existente, instale o pacote CLI como `devDependency` e confirme que o
`package-lock.json` está versionado antes de ativar o workflow gerado.

## 2. Entenda a estrutura

| Diretório/arquivo | Uso |
| --- | --- |
| `intent.config.yaml` | Nome, idioma, raiz do produto e políticas |
| `product/` | Fonte de verdade dos requisitos e decisões |
| `product/**/*.yaml` | Artefatos tipados com schema e links |
| `product/**/*.feature` | Cenários Gherkin e tags de rastreabilidade |
| `notes/` | Documentos de apoio e citações, fora do modelo canônico |
| `framework/` | Cópia local dos contratos usados pelo produto |
| `.intent/snapshots/` | Snapshots necessários para verificar citações |
| `.intent/changes/` | Propostas, baselines e estado de revisão |
| `.intent/pending.json` | Journal temporário durante uma aplicação |

Snapshots e propostas fazem parte da história verificável e devem ser versionados.
O lock e estados transitórios indicados no `.gitignore` não devem ser commitados.

## 3. Escreva um artefato

Todo YAML começa com o envelope comum. Este é um requisito mínimo válido:

```yaml
apiVersion: intent.gitreverse/v1alpha1
kind: Requirement
metadata:
  id: REQ-TRANSFER-001
  title: Avaliar transferência
  status: draft
spec:
  profile: reqif-core/v1
  category: functional
  statement: A transferência deve ser avaliada antes do envio.
  acceptance:
    - Uma conta inativa produz um resultado de rejeição observável.
links:
  - relation: governed-by
    target: BR-TRANSFER-001
```

Use IDs estáveis e descritivos. Não reutilize um ID para outro conceito; quando
um artefato deixar de ser válido, marque-o como `deprecated` e crie uma nova
identidade se necessário. Campos desconhecidos são rejeitados pelos schemas.

Para conhecer os campos de cada tipo, consulte `framework/schemas/`; para
entender a semântica e as limitações, consulte `framework/profiles/`.

## 4. Valide antes de revisar

```sh
prd validate
prd validate --strict --citations
prd test --require-tests --require-bound-scenarios
```

A validação passa por schema, referências, tipos de links, formulações
suportadas, decisões finitas e estrutura de processos. O modo normal pode
preservar diagnósticos `unsupported` como avisos; `--strict` os trata como
falha e também bloqueia perguntas abertas que impedem aprovação. `prd test`
executa os casos tipados de `Decision`; não executa step definitions Gherkin.

Para investigar um artefato específico:

```sh
prd show REQ-TRANSFER-001
prd context REQ-TRANSFER-001 --depth 2 --format json
prd impact BR-TRANSFER-001
prd graph --format mermaid
```

`context` é apropriado para fornecer contexto limitado a uma ferramenta de IA:
ele reúne o subgrafo, os artefatos exatos, a baseline e os diagnósticos, sem
prometer relevância semântica perfeita.

## 5. Registre evidência e citações

```sh
prd cite REQ-TRANSFER-001 --into notes/decision.md
prd citations check
prd citations refresh notes/decision.md
```

Uma citação preserva conteúdo canônico e digest; ela não é uma paráfrase. `current`
significa que a fonte coincide, `stale` que a fonte mudou, `tampered` que o bloco
ou snapshot não coincide e `unresolved` que a fonte histórica não está disponível.
Atualize citações somente depois de revisar a mudança. Citações não autenticam o
autor nem substituem controle de acesso do repositório.

## 6. Revise mudanças com proposta

```sh
prd change new ajustar-elegibilidade --title "Ajustar elegibilidade"
mkdir -p drafts
cp product/decisions/DEC-001.yaml drafts/DEC-001.yaml
# edite drafts/DEC-001.yaml
prd change stage ajustar-elegibilidade \
  --target product/decisions/DEC-001.yaml --file drafts/DEC-001.yaml
prd change diff ajustar-elegibilidade
prd change check ajustar-elegibilidade
prd change approve ajustar-elegibilidade --by revisor
prd change apply ajustar-elegibilidade
```

Uma proposta guarda a baseline por bytes e caminhos. Se o produto mudar depois
do staging, a aprovação deixa de ser válida: faça um novo staging. `diff` mostra
arquivos completos antes/depois, não um patch para aplicação manual. `approve`
valida estritamente e o valor de `--by` é apenas um registro local, não uma
prova de identidade.

Se uma aplicação for interrompida, preserve os arquivos e execute `prd change
recover` após confirmar que não há outro processo usando o workspace. Conflitos
de recuperação devem ser resolvidos manualmente; não force a aplicação.

## 7. Integre ao CI

Uma pipeline deve instalar dependências com lockfile, compilar, validar e testar.
Uma sequência mínima é:

```sh
npm ci
npm run check
npm test
npm exec --no -- prd validate --strict --citations
npm exec --no -- prd test --require-tests --require-bound-scenarios
```

Em projetos que usam propostas, adicione `prd change check ID` no estágio que
avalia o candidato e faça `approve/apply` somente em um ambiente controlado.
Não confie em um agente para autoaprovar alterações nem trate a existência de
um cenário como prova de que a aplicação foi executada.

## Limites importantes

- Gherkin é analisado e rastreado; os passos não têm execução integrada.
- Processos são verificados estruturalmente; não existe motor BPMN.
- A tabela de decisão implementa o subconjunto documentado, com `UNIQUE`.
- Não há servidor MCP, autenticação de revisores ou conformidade OMG completa.
- A matriz oficial de escopo é `framework/capabilities.json`.