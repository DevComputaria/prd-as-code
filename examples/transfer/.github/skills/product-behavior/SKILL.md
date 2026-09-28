---
name: product-behavior
description: Criar ou revisar cenários Gherkin relacionados aos requisitos do produto.
---

1. Leia [o perfil Gherkin](../../../framework/profiles/gherkin.md) e os requisitos relacionados.
2. Use # language: pt ou en; atribua uma tag @scenario_SCN-... única por cenário.
3. Adicione tags @requirement_REQ-..., @rule_BR-... e @process_PROC-... apenas para IDs existentes ou incluídos na proposta.
4. Escreva contexto, evento e resultado observável. Inclua caminho positivo, negativo e limites acordados.
5. Se houver casos de decisão, associe cada cenário por ID no campo cases[].scenario. Os inputs e expected devem ser explícitos.
6. Valide a proposta. Informe que `prd test` executa casos de decisão, não step definitions nem aplicação.
7. Não converta And/E em paralelismo e não infira gateways apenas pelo número de cenários.
