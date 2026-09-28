# Estrutura refatorada

Nome: PRD as a Code. Executável: `prd`. Pacote único: `@marcialwushu/prd-as-code`.

## Mapa rápido

O repositório separa o motor do framework, os produtos de exemplo e os artefatos
de documentação. `src/` contém implementação; `framework/` contém contratos
de linguagem; `templates/` contém o que `prd init` distribui; `product/` e
`examples/` são conteúdo de produto. Essa separação permite validar um produto
sem importar o código da CLI e evita que exemplos sejam confundidos com schemas.

## Módulos e responsabilidades

| Caminho | Responsabilidade |
| --- | --- |
| `src/domain/` | Artefatos, digests, decisões e grafo; sem I/O de arquivos |
| `src/application/` | Casos de uso, citações, propostas e recuperação |
| `src/application/ports/` | Contratos de compilador/workspace e interfaces futuras de aprovação/evidência |
| `src/compiler/` | YAML/Markdown/Gherkin, schemas e semântica dos perfis |
| `src/infrastructure/filesystem/` | Caminhos, escrita, descoberta de projeto e lock |
| `src/infrastructure/scaffold/` | Init com assets locais e prevenção de sobrescrita |
| `src/infrastructure/legacy/` | Migração aditiva |
| `src/interfaces/cli/` | Commander, help, JSON, códigos de saída |
| `src/legacy/v0/` | Implementação anterior preservada e isolada |
| `src/bootstrap.ts` | Composição das dependências e carregamento dos schemas |
| `src/index.ts` | API pública TypeScript |
| `framework/schemas/` | 13 schemas de artefatos, envelope e configuração |
| `framework/profiles/` | Semântica e limitações dos perfis |
| `framework/capabilities.json` | Matriz de capacidades verificável por ferramentas |
| `templates/product/` | Modelo inicial YAML e cenários Gherkin pt/en |
| `templates/copilot/` | Instruções, agente, cinco skills e workflow renderizados pelo init |
| `examples/transfer/` | Produto integrado gerado pelo init |
| `tests/` | Regressão do legado e testes nativos |
| `scripts/` | Demo, geração de schemas e verificação das fronteiras |
| `docs/adr/` | Decisões arquiteturais e justificativas |
| `.github/workflows/` | CI do framework com Node 22 e 24 |
| `azure-pipelines.yml` | Alternativa de CI em Azure Pipelines |
| `dist/` | JavaScript, declarações e sourcemaps compilados |

## Projeto de produto gerado

`intent.config.yaml` define nome, idioma, raiz de produto e política de citações. `product/` contém o modelo; `framework/` carrega os contratos locais. `.github/` contém o kit opcional do Copilot. `.intent/changes/` e `.intent/snapshots/` surgem conforme propostas/citações são criadas; devem ser versionadas. O lock é transitório e ignorado pelo Git.

O diretório `notes/` é deliberadamente separado de `product/`: documentos de
apoio podem conter explicações e citações, mas não entram implicitamente no
digest de um artefato. Cenários `.feature` vivem sob a raiz configurada do
produto e são indexados por tags; não precisam de um YAML de identidade duplicado.

Para uma descrição do ciclo operacional, consulte [docs/USAGE.md](USAGE.md).

## Evolução

As portas ApprovalProvider e EvidenceRunner são contratos de extensão, sem implementação de autenticação ou execução de aplicação neste alpha. MCP permanece no roadmap. Novos adaptadores devem chamar os casos de uso existentes e respeitar as mesmas verificações, sem criar um segundo motor de regras.

## Inventário de fontes

- `src/application/citations.ts`
- `src/application/ports/approval-provider.ts`
- `src/application/ports/compiler.ts`
- `src/application/ports/evidence-runner.ts`
- `src/application/ports/workspace.ts`
- `src/application/product-service.ts`
- `src/bootstrap.ts`
- `src/compiler/compile.ts`
- `src/compiler/semantics.ts`
- `src/domain/decisions.ts`
- `src/domain/digest.ts`
- `src/domain/graph.ts`
- `src/domain/model.ts`
- `src/index.ts`
- `src/infrastructure/filesystem/workspace.ts`
- `src/infrastructure/legacy/migrate.ts`
- `src/infrastructure/scaffold/init.ts`
- `src/interfaces/cli/main.ts`
- `src/legacy/v0/changes.ts`
- `src/legacy/v0/citations.ts`
- `src/legacy/v0/cli.ts`
- `src/legacy/v0/fs.ts`
- `src/legacy/v0/index.ts`
- `src/legacy/v0/model.ts`
- `src/legacy/v0/scaffold.ts`
- `src/legacy/v0/types.ts`
