# Perfil sbvr-core/v1

Term declara definition e designations opcionais. FactType declara uma reading e roles com conceptRef. BusinessRule declara statement e, opcionalmente, uma formulation.

A formulation tem modalidade necessity, obligation, prohibition ou permission; uma variável universal em forEach; e uma árvore de factRef/bindings, all, any, not e implies. Neste alpha, todos os papéis de um fato devem ser vinculados à única variável e possuir o mesmo tipo de conceito. Navegação e quantificadores adicionais são rejeitados pelo schema.

O compilador verifica nomes e tipos. Não avalia mundos possíveis, obrigações, permissões ou violações. Statement é explicação revisada; equivalência entre prosa e árvore não é provada. Uma regra sem formulation é diagnosticada como unsupported e não passa aprovação estrita.

Necessity não é obligation. Uma obrigação pode ser violada no mundo observado. Nunca converta uma condição necessária em suficiente ao produzir uma decisão.

Referência semântica: https://www.omg.org/spec/SBVR/1.5
