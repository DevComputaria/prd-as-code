# PRD as a Code

[![CI](https://github.com/DevComputaria/prd-as-code/actions/workflows/ci.yml/badge.svg)](https://github.com/DevComputaria/prd-as-code/actions/workflows/ci.yml)

**Product Requirements Document as Code em YAML, Markdown e Gherkin.** Framework TypeScript e CLI `prd` para vocabulário, regras, requisitos, decisões, processos e evidências versionadas.

> Status: **alpha** · CLI local · pacote npm **ainda não publicado** (`@devcomputaria/prd-as-code`).

Versão **0.2.0-alpha.1**. Um monólito modular, distribuído como um pacote npm. Este projeto evolui um protótipo independente anterior; não é o ProductShape original e não declara compatibilidade com seu formato.

## Começar

Requer Node.js 22+.

```sh
npm ci
npm run check
npm test
npm link

prd init meu-produto --ai copilot --profile product-as-code --behaviors gherkin --language pt
cd meu-produto
prd validate --strict
prd test --require-tests --require-bound-scenarios
prd impact BR-001
prd context REQ-001 --depth 2
prd graph --format mermaid
```

O fluxo recomendado é: **inicializar → modelar → validar → revisar → aplicar**.
Os arquivos do produto são a fonte de verdade; o grafo, os digests e os relatórios
de impacto são derivados deles. Comece pelo [guia de uso](docs/USAGE.md) se esta
for a primeira vez que você trabalha com PRD as Code.

### Instalação para desenvolvimento

`npm ci` instala as versões fixadas no lockfile. `npm run check` faz a verificação
de tipos e das fronteiras arquiteturais; `npm test` recompila o projeto e executa
a suíte nativa e a regressão do legado. O `npm link` do exemplo acima cria um
atalho local para o executável `prd`, sem publicar o pacote.

Para conferir uma instalação empacotada, gere o arquivo com `npm pack` e instale-o
como `devDependency` em um diretório separado. O pacote inclui `dist`, schemas,
perfis, templates, exemplos e documentação; ele não inclui o `node_modules` do
projeto de desenvolvimento.

Sem instalação global, execute `node dist/interfaces/cli/main.js` a partir deste repositório. O pacote não foi publicado no npm. Para instalar em outro projeto, use o arquivo `.tgz` fornecido ou gere um com `npm pack`; instale esse arquivo como dependência de desenvolvimento e versione o lockfile.

```sh
npm install --save-dev /caminho/devcomputaria-prd-as-code-0.2.0-alpha.1.tgz
npm exec --no -- prd validate --strict
```

## O que está entregue

- Treze tipos de artefato com schemas locais e front matter opcional em Markdown.
- Perfis inspirados em SBVR, ReqIF, DMN e BPMN, nativos em YAML; nenhum XML é requerido.
- Compilador: parsing, schemas, referências, tipos de vínculos e formulações suportadas.
- Tabelas de decisão `UNIQUE`, condições de igualdade tipadas e análise exaustiva de domínios finitos.
- Processos acíclicos com validação de conexões, referências a decisões e alcançabilidade.
- Parser oficial Gherkin; identidade e rastreabilidade por tags, com exemplos pt/en.
- Casos de decisão ligados a cenários; os passos Gherkin não são executados pelo framework.
- Grafo, impacto e contexto estruturado para agentes.
- Propostas, revisão por digest, baseline, escrita com lock e journal recuperável.
- Citações `current`, `stale`, `tampered`, `unresolved` e atualização explícita.
- `init` com agente, instruções, cinco templates de skills e workflow de CI para Copilot.
- Migração aditiva do nosso protótipo anterior e CLI legado isolado.

A [matriz de capacidades](framework/capabilities.json) é o contrato de escopo. **Não há conformidade OMG completa, motor BPMN, FEEL, prova modal, execução de step definitions, servidor MCP ou autenticação de revisores nesta versão.**

### Como os dados se relacionam

Um artefato possui identidade (`kind` e `metadata.id`), conteúdo (`spec`) e
ligações tipadas (`links`). Por exemplo, um `Requirement` pode ser governado por
uma `BusinessRule`, realizado por um `Process` e satisfeito por uma `Decision`.
Essas ligações alimentam `graph`, `trace`, `impact` e `context`; elas não executam
o negócio nem substituem uma revisão humana.

O arquivo `.feature` é descoberto junto com os artefatos e seus cenários são
identificados por tags como `@scenario_SCN-001`. Um caso de decisão pode apontar
para um cenário, permitindo rastreabilidade sem afirmar que os passos Gherkin
foram executados.

## Tipos e perfis

| Tipo | Prefixo | Perfil |
| --- | --- | --- |
| Actor | ACT | product-core/v1 |
| Journey | JRN | product-core/v1 |
| UseCase | UC | product-core/v1 |
| BoundedContext | CTX | product-core/v1 |
| Term | TERM | sbvr-core/v1 |
| FactType | FACT | sbvr-core/v1 |
| BusinessRule | BR | sbvr-core/v1 |
| Requirement | REQ | reqif-core/v1 |
| Decision | DEC | dmn-table/v1 |
| Process | PROC | process-basic/v1 |
| Behavior | BEH | behavior-core/v1 |
| Evidence | EVD | evidence/v1 |
| OpenQuestion | Q | product-core/v1 |

Cenários Gherkin usam `SCN-...` e não duplicam um arquivo YAML de identidade. O tipo Behavior preserva cenários Given/When/Then estruturados do legado, enquanto `.feature` é o formato preferido para novos cenários.

## Comandos

| Comando | Função |
| --- | --- |
| `init [diretório] --ai copilot --language pt` | Cria exemplo e integração sem sobrescrever arquivos |
| `capabilities` | Lista perfis e limites implementados |
| `validate --strict --citations` | Validação e política de citações |
| `list`, `show ID` | Consulta artefatos |
| `graph --format mermaid` | Exporta visualização do grafo |
| `trace ID --direction both --depth 2` | Vizinhança do grafo |
| `impact ID` | Dependentes transitivos |
| `context ID --depth 2` | Subgrafo, fontes, digests e diagnósticos para agentes |
| `test --require-tests --require-bound-scenarios` | Executa casos de decisões e exige vínculos de cenários |
| `decision evaluate ID --input '{...}'` | Avalia uma tabela suportada |
| `decision analyze ID` | Analisa domínios finitos |
| `cite ID --into notes/design.md` | Preserva snapshot e cita conteúdo |
| `citations check`, `citations refresh arquivo.md` | Verifica ou atualiza citações intactas |
| `change new SLUG --title MOTIVO` | Captura baseline |
| `change stage SLUG --target product/arquivo.yaml --file drafts/arquivo.yaml` | Prepara arquivo |
| `change stage SLUG --target product/arquivo.yaml --delete` | Prepara exclusão |
| `change show`, `change diff`, `change check` | Inspeção e validação do candidato |
| `change approve SLUG --by REVISOR`, `change apply SLUG` | Aprovação local e aplicação |
| `change recover` | Rollback de aplicação interrompida |
| `migrate --dry-run` | Planeja conversão do nosso formato antigo |
| `legacy ...` | Executa os comandos preservados do protótipo v0 |

Globais: `-C/--root`, `--json`, `--help`, `--version`. JSON de resultados vai para stdout; erro operacional vai para stderr. Códigos: 0 sucesso, 1 verificação negativa, 2 erro de uso/operação. `validate --strict` falha em diagnósticos `unsupported`; modo normal distingue esses casos de erros estruturais. `change approve` sempre valida estritamente. `change check`, `approve` e `apply` executam os casos de decisão do candidato.

### Saída e automação

Use `--json` em scripts e CI; não faça parsing da saída humana. Um comando que
encontra problemas de validação ou testes retorna código 1. Comando inválido,
arquivo ausente ou falha operacional retorna código 2. Em CI, uma combinação
usual é:

```sh
prd validate --strict --citations
prd test --require-tests --require-bound-scenarios
prd citations check
```

Consulte a tabela completa de relações, canonicalização e níveis de verificação
em [framework/language.md](framework/language.md). A referência operacional com
exemplos de criação e revisão está em [docs/USAGE.md](docs/USAGE.md).

## Exemplo integrado

[examples/transfer](examples/transfer) contém um produto didático completo:

- 11 artefatos: cliente, contexto, termo, dois fatos, regra, requisito, decisão, processo, caso de uso e jornada.
- 3 cenários Gherkin e 4 casos de decisão, cobrindo as quatro combinações booleanas.
- Regra de condição necessária: elegibilidade implica conta ativa.
- Requisito didático define explicitamente a suficiência de conta ativa + saldo; o exemplo não representa política real de autorização financeira.

```sh
npm run intent:validate
npm run intent:test
npm run demo
```

## Copilot

Abra o produto gerado no VS Code, selecione o agente **Product Author** e use as skills de descoberta, comportamento, processo, especificação e revisão. Leia [docs/COPILOT.md](docs/COPILOT.md).

O `init` apenas prepara os arquivos; não invoca o Copilot, não instala extensões e não interpreta uma solicitação de negócio. Os templates usam capacidades reais deste alpha. Seus arquivos `SKILL.md.template` são recursos do projeto; não instalam skills pessoais no ChatGPT.

O workflow gerado pressupõe que o CLI foi instalado localmente como devDependency e que existe `package-lock.json`. Faça isso antes de habilitá-lo. Em repositórios que já têm arquivos nos destinos, init aborta sem sobrescrever. Escolha um diretório vazio ou integre os templates manualmente.

## Estrutura e decisões

- [Estrutura completa](docs/STRUCTURE.md)
- [Arquitetura](docs/ARCHITECTURE.md)
- [Linguagem](framework/language.md)
- [Perfis](framework/profiles/)
- [Governança e recuperação](docs/GOVERNANCE.md)
- [Compatibilidade e migração](docs/MIGRATION.md)
- [Testes e evidências](docs/TESTING.md)
- [Guia de uso](docs/USAGE.md)
- [Segurança](SECURITY.md)
- [Roadmap](docs/ROADMAP.md)
- [ADRs](docs/adr/)

Licença MIT. Desenvolvimento: Conventional Commits, mudanças pequenas e revisão de contratos. Formatos da linguagem alpha ainda podem mudar; migrações devem ser explícitas e digests antigos devem continuar verificáveis.
