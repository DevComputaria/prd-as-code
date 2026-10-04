package prd.decision.dec_001_e3d5dad9367a_test

import data.prd.decision.dec_001_e3d5dad9367a.evaluation

decision_cases := [
	{"id": "CASE-001", "input": {"contaAtiva": true, "saldoSuficiente": true}, "expected": {"value": "ELEGIVEL", "ruleId": "DROW-003"}},
	{"id": "CASE-002", "input": {"contaAtiva": false, "saldoSuficiente": true}, "expected": {"value": "CONTA_INATIVA", "ruleId": "DROW-001"}},
	{"id": "CASE-003", "input": {"contaAtiva": true, "saldoSuficiente": false}, "expected": {"value": "SALDO_INSUFICIENTE", "ruleId": "DROW-002"}},
	{"id": "CASE-004", "input": {"contaAtiva": false, "saldoSuficiente": false}, "expected": {"value": "CONTA_INATIVA", "ruleId": "DROW-001"}},
]

invalid_inputs := [
	{"contaAtiva": true, "saldoSuficiente": true, "__unexpected": true},
	{"saldoSuficiente": true},
	{"contaAtiva": "__wrong_type__", "saldoSuficiente": true},
]

test_declared_decision_cases if {
	every case in decision_cases {
		actual := evaluation with input as case.input
		actual.status == "unique"
		actual.value == case.expected.value
		actual.ruleId == case.expected.ruleId
	}
}

test_input_contract if {
	every invalid_input in invalid_inputs {
		actual := evaluation with input as invalid_input
		actual.status == "invalid_input"
	}
}
