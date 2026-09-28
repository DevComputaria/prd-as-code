# Perfil gherkin/v1

Arquivos .feature usam o parser oficial @cucumber/gherkin. O init gera português ou inglês; `--language en` muda os cenários, não traduz automaticamente toda a documentação de exemplo.

Cada cenário recebe exatamente uma tag @scenario_SCN-ID. Tags de ligação: @process_PROC-ID, @requirement_REQ-ID, @rule_BR-ID. São convenções do framework, não semântica nativa Cucumber. Tags herdadas de Feature/Rule são consideradas. Background integra a lista de passos contextualizados.

Scenario Outline é reconhecido pelo parser, mas os bindings por linha de Examples ainda não existem: diagnóstico GHERKIN_OUTLINE_NOT_BOUND e falha no modo estrito. Use cenários simples para o alpha.

DEC-... cases[].scenario vincula um caso explícito a um cenário. `test --require-bound-scenarios` exige pelo menos um caso por cenário, não prova cobertura de todos os passos ou caminhos. Os textos de passos não são interpretados nem executados. Binding automático, testes contra aplicações e geração determinística de processos são evoluções futuras.

Referência: https://cucumber.io/docs/gherkin/reference/
