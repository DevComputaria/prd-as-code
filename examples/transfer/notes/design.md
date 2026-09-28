

<!-- intent:cite {"version":1,"id":"BR-001","digest":"sha256:d6c280ed2a9dd38426ec527fc8a5877bbcd419caeb0cbc35df71a02c41f51e41"} -->
> {
>   "artifact": {
>     "apiVersion": "intent.gitreverse/v1alpha1",
>     "kind": "BusinessRule",
>     "metadata": {
>       "id": "BR-001",
>       "status": "active",
>       "title": "Conta de origem ativa"
>     },
>     "spec": {
>       "formulation": {
>         "assertion": {
>           "implies": {
>             "if": {
>               "bindings": {
>                 "transfer": "t"
>               },
>               "factRef": "FACT-001"
>             },
>             "then": {
>               "bindings": {
>                 "transfer": "t"
>               },
>               "factRef": "FACT-002"
>             }
>           }
>         },
>         "forEach": {
>           "conceptRef": "TERM-001",
>           "variable": "t"
>         },
>         "modality": "obligation"
>       },
>       "profile": "sbvr-core/v1",
>       "statement": "Toda transferência elegível deve ter conta de origem ativa."
>     }
>   },
>   "body": "",
>   "canonicalization": "intent/v1"
> }
<!-- /intent:cite -->

<!-- intent:cite {"version":1,"id":"REQ-001","digest":"sha256:804ce961a3274c0ba80055752b46fc8a66475f610235ef76ad002a75fec5e572"} -->
> {
>   "artifact": {
>     "apiVersion": "intent.gitreverse/v1alpha1",
>     "kind": "Requirement",
>     "links": [
>       {
>         "relation": "governed-by",
>         "target": "BR-001"
>       },
>       {
>         "relation": "realized-by",
>         "target": "PROC-001#avaliar"
>       }
>     ],
>     "metadata": {
>       "id": "REQ-001",
>       "status": "active",
>       "title": "Avaliar conta e saldo"
>     },
>     "spec": {
>       "acceptance": [
>         "Conta inativa resulta em CONTA_INATIVA.",
>         "Conta ativa sem saldo suficiente resulta em SALDO_INSUFICIENTE.",
>         "Conta ativa com saldo suficiente resulta em ELEGIVEL."
>       ],
>       "attributes": {
>         "priority": "high"
>       },
>       "category": "functional",
>       "profile": "reqif-core/v1",
>       "statement": "Neste exemplo didático, a transferência é elegível quando a conta está ativa e possui saldo suficiente."
>     }
>   },
>   "body": "",
>   "canonicalization": "intent/v1"
> }
<!-- /intent:cite -->
