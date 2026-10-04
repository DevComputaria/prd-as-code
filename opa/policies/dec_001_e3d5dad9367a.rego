package prd.decision.dec_001_e3d5dad9367a

decision_id := "DEC-001"

input_names := ["contaAtiva", "saldoSuficiente"]

valid_input if {
	is_object(input)
	count(input) == count(input_names)
	every name in input_names {
		object.get(input, name, {"missing": true}) != {"missing": true}
	}
	is_boolean(input.contaAtiva)
	is_boolean(input.saldoSuficiente)
}

output_valid(value) if {
	is_string(value)
	value in ["ELEGIVEL", "CONTA_INATIVA", "SALDO_INSUFICIENTE"]
}

# Keeps the matches set defined for an empty or fully filtered rule table.
matches contains {"value": false, "ruleId": ""} if {
	false
}

matches contains {"value": "CONTA_INATIVA", "ruleId": "DROW-001"} if {
	valid_input
	input.contaAtiva == false
}

matches contains {"value": "SALDO_INSUFICIENTE", "ruleId": "DROW-002"} if {
	valid_input
	input.contaAtiva == true
	input.saldoSuficiente == false
}

matches contains {"value": "ELEGIVEL", "ruleId": "DROW-003"} if {
	valid_input
	input.contaAtiva == true
	input.saldoSuficiente == true
}

evaluation := {"status": "invalid_input"} if {
	not valid_input
}

evaluation := {"status": "gap", "ruleIds": []} if {
	valid_input
	count(matches) == 0
}

evaluation := {"status": "overlap", "ruleIds": rule_ids} if {
	valid_input
	count(matches) > 1
	rule_ids := sort([rule.ruleId | some rule in matches])
}

evaluation := {"status": "invalid_output", "ruleId": item.ruleId} if {
	valid_input
	count(matches) == 1
	item := matches[_]
	not output_valid(item.value)
}

evaluation := {"status": "unique", "value": item.value, "ruleId": item.ruleId} if {
	valid_input
	count(matches) == 1
	item := matches[_]
	output_valid(item.value)
}

result := item if {
	evaluation.status == "unique"
	item := {"value": evaluation.value, "ruleId": evaluation.ruleId}
}

batch := [outcome |
	some item in input
	outcome := evaluation with input as item
]
