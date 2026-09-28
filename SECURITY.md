# Segurança e limites de confiança

Os modelos são dados. YAML não executa código; decisões usam igualdade tipada sem eval. Schemas são locais. O framework não acessa rede para resolver IDs, não autentica revisores e não prova que evidências declaradas correspondem a execuções reais.

O filesystem recusa saída da raiz e symlinks. Escritores da aplicação usam lock exclusivo e validação de baseline. Isso não elimina races de editores/processos que ignoram o lock; use worktree isolado para automação.

Snapshots e propostas são protegidos por digest contra divergência acidental, não contra um autor capaz de reescrever todos os artefatos. Proteção de branch, revisão, permissões e proveniência de pacote ficam no sistema de desenvolvimento.

Cenários, dados de exemplos e fontes de descoberta podem conter conteúdo sensível. O envio ao Copilot segue as políticas da organização. Os templates orientam o agente a tratar texto de produto como conteúdo, não como instrução para executar comandos embutidos.

Não inclua segredos ou dados reais de clientes nos exemplos. O exemplo de elegibilidade é didático e não implementa política financeira real. Vulnerabilidades devem ser tratadas no repositório privado do mantenedor; nenhum canal público de reporte foi provisionado nesta entrega.
