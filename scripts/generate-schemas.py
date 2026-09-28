import json
from pathlib import Path
r=Path(__file__).resolve().parents[1] / 'framework/schemas';r.mkdir(parents=True,exist_ok=True)
def obj(p,req=None): return {'type':'object','properties':p,'required':list(p) if req is None else req,'additionalProperties':False}
def arr(v,minimum=0):return {'type':'array','items':v,'minItems':minimum}
s={'type':'string','minLength':1}; ident={'type':'string','pattern':'^[A-Z][A-Z0-9]*-[A-Za-z0-9][A-Za-z0-9-]*$'}
ref={'type':'string','pattern':'^[A-Z][A-Z0-9]*-[A-Za-z0-9][A-Za-z0-9-]*(#[A-Za-z0-9_-]+)?$'}
scalar={'type':['string','number','boolean']};scalar_map={'type':'object','additionalProperties':scalar}
def const(v):return {'const':v}
link=obj({'relation':{'enum':['uses','depends-on','governed-by','performed-by','defines','satisfies','verifies','contains','related-to','realized-by','derived-from']},'target':ref})
expr={'oneOf':[obj({'factRef':ident,'bindings':{'type':'object','additionalProperties':s}}),obj({'not':{'$ref':'#/$defs/expression'}}),obj({'all':arr({'$ref':'#/$defs/expression'},1)}),obj({'any':arr({'$ref':'#/$defs/expression'},1)}),obj({'implies':obj({'if':{'$ref':'#/$defs/expression'},'then':{'$ref':'#/$defs/expression'}})})]}
variable=obj({'name':s,'type':{'enum':['boolean','number','string']},'values':dict(arr(scalar,1),uniqueItems=True)},['name','type'])
plain=obj({'profile':const('product-core/v1'),'description':s})
specs={k:plain for k in ['Actor','Journey','UseCase','BoundedContext']}
specs['Term']=obj({'profile':const('sbvr-core/v1'),'definition':s,'designations':arr(s,1)},['profile','definition'])
specs['FactType']=obj({'profile':const('sbvr-core/v1'),'reading':s,'roles':arr(obj({'name':s,'conceptRef':ident}),1)})
specs['BusinessRule']=obj({'profile':const('sbvr-core/v1'),'statement':s,'formulation':obj({'modality':{'enum':['necessity','obligation','prohibition','permission']},'forEach':obj({'variable':s,'conceptRef':ident}),'assertion':{'$ref':'#/$defs/expression'}})},['profile','statement'])
specs['Requirement']=obj({'profile':const('reqif-core/v1'),'category':{'enum':['functional','quality','constraint']},'statement':s,'acceptance':arr(s,1),'parentRef':ident,'attributes':scalar_map,'externalRefs':arr(obj({'system':s,'identifier':s}))},['profile','category','statement','acceptance'])
specs['Decision']=obj({'profile':const('dmn-table/v1'),'hitPolicy':const('UNIQUE'),'inputs':arr(variable,1),'output':variable,'rules':arr(obj({'id':s,'when':scalar_map,'then':scalar}),1),'cases':arr(obj({'id':s,'scenario':ident,'input':scalar_map,'expected':scalar},['id','input','expected']))})
node=obj({'id':s,'type':{'enum':['startEvent','endEvent','task','businessRuleTask','exclusiveGateway']},'title':s,'decisionRef':ident},['id','type'])
specs['Process']=obj({'profile':const('process-basic/v1'),'nodes':arr(node,2),'flows':arr(obj({'id':s,'from':s,'to':s,'label':s,'default':{'type':'boolean'}},['id','from','to']),1),'scenarios':arr(ident)},['profile','nodes','flows'])
specs['Behavior']=obj({'profile':const('behavior-core/v1'),'given':arr(s,1),'when':arr(s,1),'then':arr(s,1)})
specs['Evidence']=obj({'profile':const('evidence/v1'),'subjectRef':ident,'subjectDigest':{'type':'string','pattern':'^sha256:[a-f0-9]{64}$'},'commit':s,'producer':s,'executedAt':s,'outcome':{'enum':['passed','failed','inconclusive']},'resultPath':s},['profile','subjectRef','subjectDigest','commit','producer','executedAt','outcome'])
specs['OpenQuestion']=obj({'profile':const('product-core/v1'),'question':s,'blocking':{'type':'boolean'},'suggestions':arr(s)},['profile','question','blocking'])
meta=obj({'id':ident,'title':s,'status':{'enum':['draft','active','deprecated']}})
def artifact(kind,spec):return obj({'apiVersion':const('prd.devcomputaria/v1alpha1'),'kind':const(kind),'metadata':meta,'spec':spec,'links':arr(link)},['apiVersion','kind','metadata','spec'])
umbrella={'$schema':'http://json-schema.org/draft-07/schema#','$id':'https://prd.devcomputaria/schemas/artifact','$defs':{'expression':expr},'oneOf':[artifact(k,v) for k,v in specs.items()]}
# IDs are identifiers, not remotely fetched schemas; validation always loads local files.
(r/'artifact.schema.json').write_text(json.dumps(umbrella,ensure_ascii=False,indent=2)+'\n')
for k,v in specs.items():
 schema={'$schema':'http://json-schema.org/draft-07/schema#','$defs':{'expression':expr},**artifact(k,v)}
 (r/(k+'.schema.json')).write_text(json.dumps(schema,ensure_ascii=False,indent=2)+'\n')
config=obj({'apiVersion':const('prd.devcomputaria/v1alpha1'),'name':s,'language':{'enum':['pt','en']},'product':s,'policies':obj({'requireCitations':{'type':'boolean'}})})
(r/'config.schema.json').write_text(json.dumps(config,indent=2)+'\n')
