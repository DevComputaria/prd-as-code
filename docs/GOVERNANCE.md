# Mudanças, citações e recuperação

## Propostas

```sh
prd change new ajustar-politica --title "Ajustar política"
mkdir -p drafts
cp product/decisions/DEC-001.yaml drafts/DEC-001.yaml
# Edite o rascunho e seus casos esperados quando a decisão de negócio justificar.
prd change stage ajustar-politica --target product/decisions/DEC-001.yaml --file drafts/DEC-001.yaml
prd change diff ajustar-politica
prd change check ajustar-politica
prd change approve ajustar-politica --by revisor
prd change apply ajustar-politica
prd test --require-tests
prd citations check
```

O diff mostra before/after completos; não é um patch para aplicar manualmente. Os comandos check, approve e apply executam os casos de decisão sobre o candidato, antes de alterar o produto. A aprovação também exige validação estrita. Casos ausentes não são criados automaticamente; exija a política de cobertura em CI. O revisor local não é autenticado e os passos Gherkin não são executados.

Uma proposta aprovada só aplica contra os mesmos bytes e caminhos do produto/configuração. Restaging limpa aprovação. Não há force-apply. Para baseline modificada, crie nova proposta. Operações usam arquivos completos e podem combinar YAML, Markdown e Gherkin.

## Falhas

Cada arquivo é substituído por rename de temporário no mesmo diretório. O journal `.intent/pending.json` armazena before/after e proposta aprovada antes da primeira alteração. Erros tratados tentam rollback. Após encerramento abrupto, verifique o processo e remova apenas um lock comprovadamente obsoleto; depois rode `prd change recover`.

A recuperação inspeciona todos os arquivos antes de alterar qualquer um; mudanças externas fora dos estados before/after causam RECOVERY_CONFLICT. Preserve a edição externa e resolva antes de repetir. O journal não é uma transação fsync nem uma garantia de atomicidade global; use worktrees isolados e evite leitores não cooperativos durante aplicação.

## Citações

`cite ID --into notes/design.md` cria um bloco de conteúdo canônico JSON em blockquote, delimitado por comentários intent:cite, com ID e digest. Não é uma paráfrase. Os snapshots ficam em `.intent/snapshots/` e devem ser versionados.

Current: quote e fonte combinam. Stale: quote intacto, fonte mudou. Tampered: delimitadores, quote ou snapshot divergente. Unresolved: fonte ou evidência histórica ausente. Um digest desconhecido não prova alteração maliciosa. Citações em blocos de código cercados por crases/tildes são ignoradas.

`citations refresh` só atualiza blocos intactos. `policies.requireCitations: true` faz a ausência total de citações falhar. Ainda não há inventário por documento; remover todos os marcadores só é detectado pela política global quando o total fica zero.

Hashes não autenticam autores. Proteja branches e use revisão externa. Não conceda ao agente o papel de revisor só porque ele pode executar approve.
