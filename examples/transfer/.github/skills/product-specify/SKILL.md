---
name: product-specify
description: Criar uma proposta integrada de vocabulário, regras, requisitos, decisões e processos.
---

1. Leia [a linguagem](../../../framework/language.md), [o schema](../../../framework/schemas/artifact.schema.json) e as capacidades.
2. Consulte `prd list` e `prd context ID`. Reutilize vocabulário e IDs.
3. Execute descoberta e resolva decisões de negócio ausentes. Registre perguntas bloqueantes quando necessário.
4. Crie `prd change new SLUG --title "Motivo"` antes de alterar o produto aceito.
5. Escreva os arquivos candidatos em drafts/ e prepare cada arquivo com `prd change stage SLUG --target product/caminho.yaml --file drafts/arquivo.yaml`.
6. Rode `prd change check SLUG` e corrija causas reais. Limite o ciclo a três tentativas antes de apresentar o bloqueio.
7. Não enfraqueça regras, não apague referências e não altere schemas para silenciar erros.
8. Rode `prd change diff SLUG`; apresente a proposta para aprovação humana.
9. Não invoque approve/apply por iniciativa própria. Registre testes de decisão que deverão rodar após aplicação ou em checkout isolado da proposta.
