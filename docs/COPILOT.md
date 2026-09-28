# Copilot como autor assistido

## Instalação

Rode `prd init produto --ai copilot --language pt`. O scaffold instala arquivos no repositório alvo, não skills pessoais do ChatGPT. No VS Code, confirme a descoberta das customizações e selecione Product Author.

As skills são: product-discover, product-behavior, product-process, product-specify e product-review. Podem ser selecionadas pelo mecanismo de skills do ambiente; `/product-specify` é a invocação esperada quando o cliente exibe a skill como slash command.

## Exemplo de solicitação

"Especifique a elegibilidade de uma transferência com conta ativa e saldo suficiente. Consulte o vocabulário existente. Registre perguntas sobre saldo reservado e tarifas. Proponha cenários positivos e negativos e um processo simples, sem executar a aplicação."

O agente deve procurar termos, registrar dúvidas, criar rascunhos, preparar uma proposta e validar o candidato. A presença de uma pergunta bloqueante impede aprovação estrita. Cenários ajudam na modelagem; não determinam unicamente um processo.

## Limites de automação

A definição de agente não fixa nomes de ferramentas que variam entre harnesses; configure leitura, edição e terminal conforme o cliente e as políticas locais. Instruções não são sandbox nem autenticação. Nunca use o campo --by como prova de identidade.

O CLI deve estar instalado localmente e pinado. O workflow gerado usa npm ci e npm exec --no, evitando instalar implicitamente um pacote não pinado. O init não cria package-lock nem instala dependências de um repositório que não possui package.json; faça a instalação do arquivo tgz antes de usar esse workflow.

## Hooks

Não é instalado um hook genérico que promete comportamento idêntico entre ambientes. Escolha o harness e sua versão, depois configure um hook para chamar `prd validate --json` sobre os arquivos aplicados. Para rascunhos, use `change check ID`; validar o baseline não valida o candidato. Hooks são feedback local; CI é a verificação reproduzível.

## MCP

Proposta futura: product_context, artifact_get, proposal_validate, impact_analyze e decision_test, usando os mesmos casos de uso. Não há servidor MCP nesta entrega. Nunca anunciar ferramentas que não foram implementadas.

## Avaliação das skills

Use solicitações com ambiguidade, referência inexistente, gateway injustificado e tentativa de alterar o schema para passar. Critérios: preservar hipóteses como perguntas; reutilizar conceitos; citar diagnósticos reais; não confundir ligação com prova; não autoaprovar. A suíte verifica formato/links dos templates, mas não mede desempenho real de modelos Copilot.

Fontes de integração consultadas em 2026-09-27:
- https://code.visualstudio.com/docs/agent-customization/custom-agents
- https://code.visualstudio.com/docs/agent-customization/agent-skills
- https://code.visualstudio.com/docs/agent-customization/custom-instructions

Os templates usam arquivos de agente, instruções e skills. Compatibilidade e descoberta devem ser verificadas no cliente usado pela equipe.
