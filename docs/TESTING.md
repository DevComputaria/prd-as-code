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
| `prd conformance decision ID --runtime opa` | equivalência dos casos declarados entre a referência e o adapter OPA | semântica fora do subconjunto `dmn-table/v1` |
| `prd conformance decision ID --runtime opa --parity` | paridade para chave extra/ausente, tipo, domínio, gap e overlap | conformidade DMN geral ou entradas arbitrárias |
| `npm run opa:report` | relatório JSON/Markdown da paridade entre a referência e o candidato OPA | execução do produto ou dos passos Gherkin |
| `npm run features:test` | parsing Gherkin, identidade única `@scenario_SCN-...` e vínculo com casos de decisão | execução de step definitions ou da aplicação |
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
prd conformance decision DEC-001 --runtime opa --parity
```

O adapter OPA compila somente o subconjunto já suportado: tabela `UNIQUE`,
condições de igualdade, wildcard por condição omitida e saída escalar. Ele não
executa o produto nem expande o perfil DMN. Antes de chamar o binário, o adapter
aplica a mesma validação de nomes, tipos e domínios de entrada usada por
`evaluateDecision()`. O Rego também emite esse contrato e estados distintos para
`unique`, `gap`, `overlap` e `invalid_input`.

Uma avaliação normal gera a policy uma vez e envia todos os casos em um único
`opa eval`, limitado por `PRD_OPA_TIMEOUT_MS` (5 segundos por padrão). O resultado
de conformidade registra a versão do binário. `--policy arquivo.rego` exige que o
artefato informado seja idêntico ao gerador para a especificação principal;
policies sintéticas das sondas de paridade continuam temporárias.

### Suíte OPA local e no GitHub Actions

A policy e o teste versionados em `opa/policies/` e `opa/tests/` são gerados a
partir de `examples/transfer/product/decisions/DEC-001.yaml`. O sufixo hash do
package impede que ids como `DEC-001` e `DEC_001` colidam. Para reproduzir a
suíte do CI localmente, instale OPA 1.4.2 no `PATH` e execute:

```sh
npm ci
npm run opa:generate
npm run opa:check
npm run opa:test
npm run opa:server:test
npm run opa:conformance
```

`opa:check` valida sintaxe estrita e formatação. `opa:test` executa os testes
Rego gerados, inclusive entradas inválidas. `opa:server:test` reserva uma porta
local livre, inicia temporariamente `opa run --server` e deriva casos, endpoint e
resultados esperados do mesmo YAML. `opa:conformance` usa a policy commitada para
os casos principais, ativa `--parity` e ainda cobre números `0`, `-1`, decimal,
inteiro acima de `2^53` e strings com aspas. GitHub Actions e Azure Pipelines
instalam OPA 1.4.2, regeneram `opa/` e falham se qualquer artefato divergir.

O job `OPA / Rego` também executa `npm run opa:report` e publica os arquivos JSON
e Markdown como o artefato `opa-conformance-report`, inclusive quando o job falha.
Uma action separada, `Features`, executa somente o parser oficial, exige exatamente
uma tag `@scenario_SCN-...` por cenário e confirma os vínculos por meio de
`prd test --require-bound-scenarios`. Ela publica `feature-binding-report`; nenhum
step Gherkin ou código de aplicação é executado por essa verificação.
