package prd.decision.dec_001_test

import data.prd.decision.dec_001.result

cases := [
	{
		"id": "CASE-001",
		"input": {"contaAtiva": true, "saldoSuficiente": true},
		"expected": {"value": "ELEGIVEL", "ruleId": "DROW-003"},
	},
	{
		"id": "CASE-002",
		"input": {"contaAtiva": false, "saldoSuficiente": true},
		"expected": {"value": "CONTA_INATIVA", "ruleId": "DROW-001"},
	},
	{
		"id": "CASE-003",
		"input": {"contaAtiva": true, "saldoSuficiente": false},
		"expected": {"value": "SALDO_INSUFICIENTE", "ruleId": "DROW-002"},
	},
	{
		"id": "CASE-004",
		"input": {"contaAtiva": false, "saldoSuficiente": false},
		"expected": {"value": "CONTA_INATIVA", "ruleId": "DROW-001"},
	},
]

test_declared_decision_cases if {
	every case in cases {
		actual := result with input as case.input
		actual == case.expected
	}
}

test_incomplete_input_is_undefined if {
	not result with input as {"contaAtiva": true}
}
