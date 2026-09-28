# language: pt
@process_PROC-001 @requirement_REQ-001 @rule_BR-001
Funcionalidade: Avaliar elegibilidade da transferência

  @scenario_SCN-001
  Cenário: Conta ativa e saldo suficiente
    Dado que a conta de origem está ativa
    E possui saldo suficiente
    Quando a elegibilidade é avaliada
    Então o resultado deve ser "ELEGIVEL"

  @scenario_SCN-002
  Cenário: Conta inativa
    Dado que a conta de origem está inativa
    E possui saldo suficiente
    Quando a elegibilidade é avaliada
    Então o resultado deve ser "CONTA_INATIVA"

  @scenario_SCN-003
  Cenário: Saldo insuficiente
    Dado que a conta de origem está ativa
    E não possui saldo suficiente
    Quando a elegibilidade é avaliada
    Então o resultado deve ser "SALDO_INSUFICIENTE"
