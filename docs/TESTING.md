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
