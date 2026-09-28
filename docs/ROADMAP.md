# Roadmap por critérios de saída

## Entregue nesta estrutura 0.2

CLI, compiler, schemas, perfis limitados, init com Copilot, modelo de exemplo, governança, citações e migração preservando legado.

## 0.3 — Verificação do candidato

Adicionar testes de propriedade; análise incremental; inventário de citações por documento; suporte revisado a Outline. Saída: ampliar a cobertura semântica e medir regressões incrementais. O alpha já bloqueia approve/apply quando os casos de decisão do candidato falham.

## 0.4 — Execução e evidências

Adaptadores reais para step definitions e resultados de CI; manifest de evidência com commit/digest; comparação diferencial de decisões. Saída: distinguir formalmente testes do modelo e testes da aplicação nas APIs e relatórios.

## 0.5 — Integrações

Servidor MCP read-only inicialmente, provedor autenticado de aprovação de PR e documentação de compatibilidade com Copilot. Saída: mesmos casos de uso e mesmas garantias de concorrência da CLI.

## Pesquisa posterior

FEEL, perfis de processos mais expressivos, SBVR com múltiplas variáveis, RDF/OWL e políticas externas. Cada expansão requer semântica especificada e fixtures; nenhuma dessas capacidades é simulada por texto de prompt.
