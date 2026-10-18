# Quantum

Source: https://xq.stoplight.io/docs/xqmsg/ae10da785de65-quantum

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_service` · Source URI: `/reference/Quantum.json`

### Quantum Generator
In order to reduce the amount of data the quantum server emits, the entropy is sent as a base64-encoded hex string. While the hex string itself can be used as entropy, to retrieve the actual bits ( if required ), the string should be decoded from base-64, and each hex character in the sequence converted to its 4-bit binary representation.


<!--
title: "Recover raw entropy bits"
lineNumbers: true

-->
```js
function characterHexToBin(hex){
    return (parseInt(hex, 16).toString(2)).padStart(4, '0');
}

function toEntropyBits(data){
    return atob(data).split('')
    .map(  characterHexToBin )
    .join('');
}

// Convert server results to bits with the toEntropyBits method.
console.log( toEntropyBits("NmFkZTI5MDVm") );
// => 011010101101111000101001000001011111
```

<!--
title: "Recover raw entropy bits"
lineNumbers: true

-->
```scala
def characterHexToBin( a:Char ) = {
    "000" + Integer.parseInt(a.toString,16
    ).toBinaryString takeRight 4
}

def toEntropyBits( data:String ) = {
    new String(java.util.Base64.getDecoder.decode(data.getBytes ))
      .foldLeft(""){  _ + characterHexToBin(_) }
  }

// Convert server results to bits with the new implicit method.
println( toEntropyBits("NmFkZTI5MDVm") )
// => 011010101101111000101001000001011111
```


## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "undefined",
  "version": "2.0",
  "name": "Quantum",
  "description": "### Quantum Generator\nIn order to reduce the amount of data the quantum server emits, the entropy is sent as a base64-encoded hex string. While the hex string itself can be used as entropy, to retrieve the actual bits ( if required ), the string should be decoded from base-64, and each hex character in the sequence converted to its 4-bit binary representation.\n\n\n<!--\ntitle: \"Recover raw entropy bits\"\nlineNumbers: true\n\n-->\n```js\nfunction characterHexToBin(hex){\n    return (parseInt(hex, 16).toString(2)).padStart(4, '0');\n}\n\nfunction toEntropyBits(data){\n    return atob(data).split('')\n    .map(  characterHexToBin )\n    .join('');\n}\n\n// Convert server results to bits with the toEntropyBits method.\nconsole.log( toEntropyBits(\"NmFkZTI5MDVm\") );\n// => 011010101101111000101001000001011111\n```\n\n<!--\ntitle: \"Recover raw entropy bits\"\nlineNumbers: true\n\n-->\n```scala\ndef characterHexToBin( a:Char ) = {\n    \"000\" + Integer.parseInt(a.toString,16\n    ).toBinaryString takeRight 4\n}\n\ndef toEntropyBits( data:String ) = {\n    new String(java.util.Base64.getDecoder.decode(data.getBytes ))\n      .foldLeft(\"\"){  _ + characterHexToBin(_) }\n  }\n\n// Convert server results to bits with the new implicit method.\nprintln( toEntropyBits(\"NmFkZTI5MDVm\") )\n// => 011010101101111000101001000001011111\n```\n",
  "termsOfService": "https://xqmsg.co/terms",
  "contact": {
    "name": "Support",
    "url": "https://xqmsg.co/contact-us",
    "email": "support@xqmsg.com"
  },
  "extensions": {},
  "infoExtensions": {},
  "tags": [
    {
      "id": "a3e58072b0e31",
      "name": "Generate"
    }
  ],
  "summary": "All services related to quantum entropy generation.",
  "license": {
    "name": "Copyright (c) XQ Message Inc. 2019-2022. All Rights Reserved.",
    "identifier": ""
  },
  "servers": [
    {
      "id": "672150f96b007",
      "url": "https://quantum.xqmsg.net/",
      "name": "Quantum"
    }
  ]
}
```
