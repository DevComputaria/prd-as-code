# Escrita controlada e recuperável

Status: aceito para 0.2.0-alpha.1.

## Decisão

Toda mutação pública nativa usa lock, reload, baseline e validação. Aplicação multi-arquivo usa journal e rollback, sem alegar atomicidade global ou fsync. Recuperação recusa edições externas.
