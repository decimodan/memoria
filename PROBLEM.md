# Session Consistency Evaluator

Necesito diseñar un sistema de Consistencia Consistency Evaluator, que tiene que resolver algo como lo siguiente:

Session

|

|

|

  

Session Processor

- Summary
- Facts
- Sentiment
- Risk

|

|

|

Consistency Evaluator

- Transcript
- Context Loaded
- Summary
- Facts Extracted
- Sentiment
- Risk Flag



El evaluador buscaria categorias concretas como:

- CONTRADICTION
- SUMMARY_DISTORTION
- RISK_MISMATCH



Y devolver algo estructurado como:  
{

"consistent": false,

"issues": [

{

"type": RISK_MISMATCH,

"confidence": 0.9,

"source": "Example"

}

]

}



El ejemplo de un fact esta en [session.md](http://session.md) y el objetivo es evaluarlo