# Migração e compatibilidade

O executável novo é exclusivamente `prd`. Não instala alias prodshape, evitando colisão com @prodshape/cli.

```sh
prd -C ../produto-antigo legacy validate
prd -C ../produto-antigo migrate --dry-run
prd -C ../produto-antigo migrate
prd -C ../produto-antigo validate
prd -C ../produto-antigo legacy citations check
```

A migração reconhece apenas o formato do protótipo independente v0 deste repositório. Não reconhece ProductShape oficial.

Cria intent.config.yaml e intent-product/; preserva prodshape.json, product/, .prodshape/ e documentos com citações antigas. Os IDs são mantidos e os digests antigos são registrados no mapa `.intent/migrations/prodshape-v0.json`. Algoritmos diferentes não produzem necessariamente o mesmo digest.

Todos os artefatos novos entram em draft. Requisitos recebem categoria funcional provisória e um critério que solicita revisão; regras narrativas precisam de formulação estruturada e são diagnosticadas como unsupported em strict. Não existe aprovação semântica automática.

As duas representações não se sincronizam. O legado fica como histórico verificável; novas alterações devem ocorrer na nova definição. Citações antigas continuam a referenciar o baseline legado e não detectam mudanças na cópia nova; substitua-as deliberadamente por citações nativas após a revisão. Uma migração de citações com comprovação de equivalência é trabalho futuro.

A migração preflight recusa destinos existentes e escreve a configuração por último. Uma falha tratada remove somente os arquivos novos escritos naquela execução. Em hard crash anterior ao commit marker, inspecione os arquivos novos antes de repetir. Não é uma transação cross-format com journal completo.
