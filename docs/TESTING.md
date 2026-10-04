# Estratégia de testes

`npm test` compila e executa node:test. O conjunto novo cobre compiler, domínios de decisão, perfis de processos, Gherkin, governança, citações, migração e init. A suíte herdada também roda contra o legado preservado.

`npm run check` verifica tipos e proíbe dependências de infraestrutura/CLI/compilador nas camadas domain/application. Não é uma prova exaustiva de arquitetura.

## O que cada verificação garante

| Verificação | Garante | Não garante |
| --- | --- | --- |
| `npm run check` | TypeScript compilável e fronteiras declaradas | comportamento em runtime ou CI remoto |
| `npm test` | regressão automatizada do CLI, compilador e domínio | execução de uma aplicação externa |
| `prd validate --strict` | schemas, referências e invariantes dos perfis | conformidade OMG completa |
| `prd test` | resultados dos casos de decisões tipadas | execução dos passos Gherkin |
| `prd conformance decision ID --runtime opa` | equivalência dos casos entre a semântica de referência e o adapter OPA | equivalência para entradas fora dos casos declarados |
| `prd citations check` | estado dos blocos e snapshots conhecidos | autenticidade do autor |

Ao adicionar um tipo ou alterar um contrato, atualize em conjunto o schema, o
perfil, uma fixture representativa, os testes e a documentação. Ao alterar a
canonicalização, preserve o verificador da versão anterior e crie uma nova
versão explícita; não regrave digests históricos silenciosamente.

A execução de decisões usa casos explícitos. A cobertura de cenários mede a existência de associação com ao menos um caso, não a execução de passos. O parser oficial Gherkin valida sintaxe; os bindings de aplicação são futuros.

Testes de regressão de digests e parsing verificam invariantes entre mudanças de formatação e de conteúdo. Recuperação é exercitada com journal simulado e conflitos de edição. Testes reais de power loss e NFS não foram feitos.

CI usa Node 22/24 em Linux. Antes de publicar um pacote, instale o tgz em prefixo limpo e teste init, validate e test a partir do binário instalado. O registro de execução desta entrega fica em VERIFICATION.md.

## Teste local de um pacote empacotado

O teste de distribuição deve usar um diretório fora do repositório de origem:

1. executar `npm pack`;
2. instalar o `.tgz` como `devDependency` em um projeto vazio;
3. executar `prd init`, `prd validate --strict` e `prd test`;
4. confirmar que os schemas, templates e exemplos foram incluídos no pacote.

Isso detecta referências acidentais ao workspace de desenvolvimento que uma
execução direta de `dist/` não detecta.


## Conformidade de runtimes de decisão

`evaluateDecision()` continua sendo a semântica de referência do perfil
`dmn-table/v1`. A porta `DecisionRuntime` permite executar os mesmos casos em um
runtime candidato sem mover a autoridade semântica para esse runtime.

```sh
prd conformance decision DEC-001 --runtime reference
prd conformance decision DEC-001 --runtime opa
```

O adapter OPA compila somente o subconjunto já suportado: tabela `UNIQUE`,
condições de igualdade, wildcard por condição omitida e saída escalar. Ele não
expande o perfil DMN. O executável `opa` é opcional e não é baixado pelo pacote.

### Suíte OPA local e no GitHub Actions

A política versionada em `opa/policies/dec_001.rego` é gerada a partir de
`examples/transfer/product/decisions/DEC-001.yaml`. Para reproduzir a suíte do
CI localmente, instale o executável `opa` no `PATH` e execute:

```sh
npm ci
npm run opa:generate
npm run opa:check
npm run opa:test
npm run opa:server:test
npm run opa:conformance
```

`opa:check` valida sintaxe estrita e formatação. `opa:test` executa os testes
unitários Rego. `opa:server:test` inicia
temporariamente `opa run --server`, aguarda o health check e valida os quatro
casos pelo endpoint REST `/v1/data/prd/decision/dec_001/result`.
`opa:conformance` exercita o adapter do CLI contra a mesma decisão. O job
`OPA / Rego` também regenera a política e falha quando o arquivo versionado está
desatualizado em relação ao YAML.
