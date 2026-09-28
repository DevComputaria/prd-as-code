# Contribuição

Use branches curtas e PRs pequenos sobre trunk. Adote Conventional Commits. Toda alteração de contrato exige schema, perfil, fixture e teste atualizados; uma mudança de canonicalização precisa de nova versão e verificador histórico.

Execute npm ci, npm run check e npm test. Não atualize golden expectations para esconder regressão. Diferencie implementado, unsupported e inconclusivo nas saídas.

Review: conferir dependências entre camadas, preservação de identidade, diagnósticos acionáveis, falhas de recuperação, comportamento do CLI instalado e honestidade das garantias documentadas.

O código legacy/v0 deve receber apenas correções de compatibilidade/segurança necessárias. Não amplie os novos perfis dentro dele.
