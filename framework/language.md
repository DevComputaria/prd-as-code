# Linguagem PRD as a Code v1alpha1

## Autoridade

YAML é a representação estruturada. Markdown com front matter usa o mesmo envelope; seu corpo integra o conteúdo canônico. Prosa sem front matter fica fora do diretório de produto, em notes/ ou docs/. Diagramas são derivados. Não existe XML nem importação de padrões XML neste perfil.

Os schemas publicados aqui são contratos próprios, inspirados nos metamodelos OMG; não são serializações oficiais nem declarações de conformidade com os padrões completos.

## Envelope

```yaml
apiVersion: intent.gitreverse/v1alpha1
kind: Requirement
metadata:
  id: REQ-001
  title: Validar solicitação
  status: draft
spec:
  profile: reqif-core/v1
  category: functional
  statement: A solicitação deve ser validada.
  acceptance:
    - Uma entrada inválida produz um resultado de rejeição observável.
links:
  - relation: governed-by
    target: BR-001
```

Campos desconhecidos são rejeitados. Os schemas não são baixados pela rede. Cada kind possui schema próprio; artifact.schema.json oferece a união para o editor. YAML usa parsing estrito, chaves únicas e aliases desabilitados.

## IDs, escopo e relações

IDs seguem PREFIXO-segmento, ex.: REQ-001 ou BR-TRANSFER-001. Os prefixos dependem do kind. Cada produto é um namespace isolado; referências entre repositórios não são resolvidas. A referência `PROC-001#avaliar` identifica um nó local de processo. Os demais elementos internos não têm fragmentos resolvidos nesta versão.

Relações: uses, depends-on, governed-by, performed-by, defines, satisfies, verifies, contains, related-to, realized-by, derived-from. Governed-by aponta para BusinessRule; performed-by para Actor; defines para Term; satisfies para Requirement; realized-by para Process/Decision/UseCase. A origem declara o vínculo uma única vez. O grafo deriva a navegação reversa e rejeita ciclos depends-on/parent, mas permite ciclos em outras relações.

Wiki links no corpo Markdown não são interpretados na linguagem nova. Use links tipados. A migração converte referências reconhecidas do legado em related-to.

## Canonicalização intent/v1

O snapshot contém `canonicalization`, `artifact` e `body`, serializados em JSON com chaves ordenadas recursivamente. CRLF vira LF durante parsing; corpo Markdown perde apenas novas linhas nas extremidades. Arrays preservam ordem. A ordem de chaves YAML e comentários não altera o digest; Unicode e espaços internos não são normalizados. Documentação em arquivo separado não é incluída implicitamente no digest de outro artefato.

SHA-256 identifica conteúdo, não identidade de autor. Digests do legado permanecem sob seu algoritmo anterior. O baseline das propostas é mais conservador: inclui bytes exatos e caminhos de todos os arquivos do produto, inclusive Gherkin, mais a configuração. Qualquer edição nesses bytes exige nova proposta.

## Níveis de verificação

1. Schema: formato.
2. Referências: IDs e tipos de vínculo.
3. Formulações: variáveis/roles/conceitos do subconjunto suportado.
4. Decisões: avaliação dos casos e exaustividade de domínios finitos declarados.
5. Processos: estrutura e alcançabilidade, sem execução.
6. Evidências: pin de conteúdo e metadados declarados, sem autenticação do produtor.

Provar equivalência SBVR/DMN ou inferir processos por exemplos não faz parte da implementação. Dados ausentes não são tratados automaticamente como falso.
