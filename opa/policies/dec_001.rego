package prd.decision.dec_001

matches contains {"value": "CONTA_INATIVA", "ruleId": "DROW-001"} if {
	input.contaAtiva == false
}

matches contains {"value": "SALDO_INSUFICIENTE", "ruleId": "DROW-002"} if {
	input.contaAtiva == true
	input.saldoSuficiente == false
}

matches contains {"value": "ELEGIVEL", "ruleId": "DROW-003"} if {
	input.contaAtiva == true
	input.saldoSuficiente == true
}

result := item if {
	count(matches) == 1
	item := matches[_]
}
