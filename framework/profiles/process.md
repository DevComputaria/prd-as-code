# Perfil process-basic/v1

Inspirado em um subconjunto BPMN: startEvent, endEvent, task, businessRuleTask e exclusiveGateway. Há exatamente um início e pelo menos um fim. IDs de nós e de fluxos são únicos nos respectivos conjuntos. Tarefas e início têm uma saída; fim nenhuma; gateway exclusivo pelo menos duas.

Gateway exige uma saída default e rótulos nas demais. Os rótulos são descritivos, não expressões executadas. businessRuleTask requer decisionRef. Toda atividade é alcançável a partir do início; ciclos são diagnosticados como não suportados.

Não há paralelismo, mensagens, lanes/pools, temporizadores, compensação, subprocessos, loops ou runtime de tokens. Validade estrutural não prova ausência de deadlock em BPMN geral. Mermaid é uma visualização do grafo de artefatos, não exportação BPMN.

Gherkin ajuda a propor caminhos e exemplos; Dado não implica tarefa, E não implica paralelismo e Então não implica evento de fim. Processos distintos podem satisfazer os mesmos cenários. Copilot deve explicitar e submeter as escolhas de modelagem.

Referência: https://www.omg.org/spec/BPMN/2.0.2
