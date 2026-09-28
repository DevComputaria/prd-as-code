# Perfil dmn-table/v1

Tabela com hitPolicy UNIQUE. Inputs e output têm nome, tipo boolean/number/string e values opcionais. Regras possuem ID, when (mapa de igualdade exata) e then (valor escalar). Condição omitida funciona como wildcard; não existe string mágica "-". Valores numéricos usam Number do JavaScript, sem semântica decimal financeira.

As entradas de avaliação devem fornecer exatamente todos os nomes declarados, tipos corretos e valores do domínio. Null e entradas extras são rejeitados. Exatamente uma regra deve corresponder; zero gera DECISION_GAP, duas ou mais DECISION_OVERLAP. Não há eval de código nem FEEL.

Para booleans, o domínio é false/true quando values não é definido. Para number/string, a análise exaustiva precisa de values explícitos. O limite é 4096 combinações; acima disso o resultado é inconclusivo, não sucesso. A garantia de cobertura vale apenas para o domínio declarado.

cases[] registra input, expected e scenario opcional. O teste executa a tabela; associar um ID Gherkin não executa nem prova a equivalência da prosa com o caso.

Referência conceitual: https://www.omg.org/spec/DMN/1.5
