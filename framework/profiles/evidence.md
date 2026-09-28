# Perfil evidence/v1

Evidence declara subjectRef, subjectDigest, commit, producer, executedAt e outcome. O compilador verifica se o artefato existe e ainda possui o digest citado. Metadados são declarações: não há verificação de assinatura, commit remoto, produtor ou execução.

Os resultados de `prd test --json` podem ser preservados como relatório. A API EvidenceRunner é um contrato futuro para execução da aplicação; não há adaptador concreto entregue. Não confunda o relatório do avaliador de decisões com evidência de produção.
