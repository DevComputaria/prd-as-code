# Verificação da entrega

Executada em 2026-10-04, Linux, Node.js 24.19.0, npm 11.9.0 e OPA 1.4.2.

- TypeScript strict e fronteiras domain/application: passaram.
- `npm test`: 64 testes, 64 passaram, zero falhas.
- OPA/Rego: formatação e check estrito passaram; 2 testes Rego passaram; 4
  casos passaram pelo servidor HTTP; paridade OPA passou em 11/11 sondas do
  exemplo, 4/4 casos numéricos e 1/1 caso com aspas.
- Exemplo integrado: 11 artefatos, 3 cenários e 4 casos de decisão; validação estrita e casos passaram.
- Demo: init, validação, citação, proposta, aprovação, aplicação, stale e refresh/current passaram.
- Pacote npm gerado e instalado em diretório independente. Binário instalado criou projeto em inglês com kit Copilot, validou estritamente e executou os 4 casos com todos os cenários vinculados.
- Metadados das cinco skills e links relativos no scaffold: verificados pela suíte.
- Links locais da documentação: resolvidos.
- Duas citações nativas no exemplo: current.

Não executados nesta sessão: sessão real do Copilot, CI remoto desta branch,
Azure Pipelines, Windows/macOS ou Node 22. A matriz de CI declara Node 22/24,
sem afirmar resultado de jobs remotos. Não há publicação no npm.

A suíte não é prova de conformidade OMG ou correção de processos em execução. Consulte framework/capabilities.json e os perfis para o escopo exato.
