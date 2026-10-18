# Data Flow

Source: https://xq.stoplight.io/docs/xqmsg/nuwp758yspf9r-data-flow

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `article` · Source URI: `/docs/DataFlow.md`

## Published article

---
stoplight-id: nuwp758yspf9r
---

# Data Flow

![sequence-diagram.png](https://stoplight.io/api/v1/projects/cHJqOjExNzMyNA/branches/YnI6MTMyNTcwNzc/images/%2Fassets%2Fimages%2Fsequence-diagram.png)

## Encryption Sequence

1. Authenticate identity to XQ in order to initiate the encryption process.
2. Optionally request quantum-generated entropy for enhanced randomness.
3. Create a secure encryption key and use it to encrypt the data.
4. Store the encryption key, and associated policies securely.
5. Obtain a unique locator token for key and policy retrieval.
6. Complete the encryption process by storing the associated locator token.

## Decryption Sequence

1. Receiver will receive XQ encrypted data.
2. Authenticate identity to XQ in order to initiate the decryption process.
3. Provide locator token and authentication credentials in order to receive the decryption key.
4. At the edge location utilize the decryption key to decrypt the encrypted data.

