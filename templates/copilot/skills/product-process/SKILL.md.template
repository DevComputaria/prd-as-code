---
name: product-process
description: Propor processos YAML a partir de requisitos e cenários, mantendo explícitas as decisões de modelagem.
---

1. Leia [o perfil de processos](../../../framework/profiles/process.md) e [o perfil de decisões](../../../framework/profiles/decision.md).
2. Consulte os cenários e conceitos existentes. Distinga precondições, atividades e resultados.
3. Faça perguntas quando responsabilidades ou caminhos não estiverem definidos.
4. Modele somente startEvent, endEvent, task, businessRuleTask e exclusiveGateway. Não use paralelismo, temporizadores, loops ou compensação neste perfil.
5. Use decisionRef em businessRuleTask. Gateways precisam de uma saída default e rótulos nas demais.
6. Relacione cenários; rode change check. Não declare que o processo é executável ou livre de deadlock.
7. Entregue justificativa de modelagem e lacunas identificadas.
