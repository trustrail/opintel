# Storing Multiple Keys

Source: https://xq.stoplight.io/docs/xqmsg/5a6b030c8b55e-storing-multiple-keys

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `article` · Source URI: `/docs/StoringMultipleKeys.md`

## Published article

# Storing Multiple Keys
<!-- theme: warning -->
> #### This tutorial is not a sandbox!
>
> Any operations here behave as if you executed them from our own server.

Encrypting a batch of records one key at a time means one round trip per key. XQ offers two ways to store many key packets in a single request, and the right one depends on whether those packets share a policy.

| You need | Use | Metadata |
|----------|-----|----------|
| Many keys, same recipients and expiry | [`/packet/add`](../reference/Subscription.json/paths/~1packet~1add/post) with `keys` | One set, shared by every key |
| Many keys, each with its own policy | [`/packet/batch`](../reference/Subscription.json/paths/~1packet~1batch/post) | Per key |

Both return one locator token per key, in the same order the keys were submitted.

Before starting, you will need an access token. See the [Encryption Tutorial](./EncryptionApiTutorial.md) for authorizing a user, or the [Device Certificate Tutorial](./DeviceCertificateTutorial.md) if the caller is a device.

<!-- theme: info -->
> #### Store keys with their algorithm prefix
>
> Keys are stored with a 2-character prefix identifying the algorithm: `.B` for OTP, `.1` for AES-256-GCM, `.2` for AES-256-CTR. On retrieval the prefix is authoritative. Omitting it forces a fallback that can silently select the wrong algorithm for your ciphertext.

## Section 1 - Storing Multiple Keys That Share a Policy

This is the same `/packet/add` endpoint used to store a single key. The only difference is that `keys` (plural array) replaces `key`, and the response changes shape accordingly.

Every packet created this way shares the recipients, expiry, type, and metadata given in the request. Send either `key` or `keys` — not both.

```params json_schema
{
  "title": "/packet/add",
  "type": "object",
  "properties": {
    "api-key":{
      "type": "string",
      "description": "[General API key](https://manage.xqmsg.com/applications)"
    },
    "authorization":{
      "type": "string",
      "description": "authToken returned in /exchange response. Prefix the auth token with \"Bearer\""
    },
    "keys": {
      "type": "string",
      "description": "The secret keys that the user wants to protect, each carrying its 2-character algorithm prefix. One packet is created per key."
    },
    "recipients": {
      "type": "string",
      "description": "Comma-delimited list of email addresses or phone numbers who are allowed to access the keys. Applies to every key in the request."
    },
    "expires": {
      "type": "string",
      "description": "Number of hours that these keys will remain valid for. After this time, they will no longer be accessible."
    },
    "type": {
      "type": "string",
      "description": "A value indicating the type of data that is being encrypted. Accepts either the string form (\"file\", \"msg\", \"chat\", \"form\", \"data\") or the numeric equivalent (1 = \"file\", 2 = \"msg\", 3 = \"chat\", 4 = \"form\", 5 = \"data\")."
    },
    "meta": {
      "type": "object",
      "description": "Any additional meta information about the keys. Shared by every key in the request."
    }
  },
  "required": ["api-key", "authorization", "keys", "recipients", "expires"]
}
```
----
```request http
{
  "method": "POST",
  "url": "https://subscription.xqmsg.net/v2/packet/add",
  "headers": {
    "Content-Type": "application/json",
    "api-key": "123",
    "authorization":"Bearer xyz123"
  },
  "body": {
    "meta": {
      "subject": "nightly-batch",
      "meta": null
    },
    "type": 5,
    "recipients": "alice@example.com,bob@example.com",
    "expires": "24",
    "keys": [".1aaa...", ".1bbb...", ".1ccc..."]
  }
}
```

> A successful response returns a JSON object rather than a bare string: `{"tokens": ["<token1>", "<token2>", "<token3>"]}`. Note the difference from the single key form, which returns the token on its own.

`tokens[i]` corresponds to `keys[i]`. Verify that the returned count matches the number of keys you sent before pairing them with your ciphertexts — a mismatch means some packets were not created, and pairing them positionally would associate your data with the wrong keys.

<!-- theme: info -->
> #### The meta shape differs from the single key form
>
> When storing one key, metadata is usually sent as `{"subject", "title", "labels"}`. The multi-key form sends `{"subject", "meta"}`. Both are free-form objects, so this is a convention rather than a hard requirement, but it is worth matching if you want your packets to look consistent in the dashboard.

## Section 2 - Storing Multiple Keys With Individual Metadata

When each key needs its own title, labels, recipients, or expiry, use `/packet/batch`. The request is a list of `entries`, and each entry is a complete packet definition.

The typical use is database or field-level encryption, where one key protects a single column and the label identifies what that column holds.

<!-- theme: warning -->
> #### `expires` means something different here
>
> This is the only packet endpoint where `expires` is paired with a `unit` field. `"expires": 1, "unit": "days"` means one day. On every other endpoint, `expires` is a count of hours.

```params json_schema
{
  "title": "/packet/batch",
  "type": "object",
  "properties": {
    "api-key":{
      "type": "string",
      "description": "[General API key](https://manage.xqmsg.com/applications)"
    },
    "authorization":{
      "type": "string",
      "description": "authToken returned in /exchange response. Prefix the auth token with \"Bearer\""
    },
    "entries": {
      "type": "object",
      "description": "The key packets to create. Each entry sets its own key, recipients, expires, unit, type, and meta."
    }
  },
  "required": ["api-key", "authorization", "entries"]
}
```
----
```request http
{
  "method": "POST",
  "url": "https://subscription.xqmsg.net/v2/packet/batch",
  "headers": {
    "Content-Type": "application/json",
    "api-key": "123",
    "authorization":"Bearer xyz123"
  },
  "body": {
    "entries": [
      {
        "type": "database",
        "meta": {"title": "users.ssn", "labels": ["pii"]},
        "key": ".1aaa...",
        "recipients": ["svc@example.com"],
        "expires": 1,
        "unit": "days"
      },
      {
        "type": "database",
        "meta": {"title": "users.dob", "labels": ["pii"]},
        "key": ".1bbb...",
        "recipients": ["svc@example.com"],
        "expires": 1,
        "unit": "days"
      }
    ]
  }
}
```

> A successful response returns `{"tokens": ["<token1>", "<token2>"]}`, with one token per entry in submission order.

As with the multi-key form, check the returned count against the number of entries you sent.

## Section 3 - Retrieving the Keys

Fetching keys one at a time undoes the round-trip savings. Send the whole list of locator tokens to `/keys` instead and get them all back in one call.

Reference: [`POST /keys`](../reference/Validation.json/paths/~1keys/post)

```params json_schema
{
  "title": "/keys",
  "type": "object",
  "properties": {
    "api-key":{
      "type": "string",
      "description": "[General API key](https://manage.xqmsg.com/applications)"
    },
    "authorization":{
      "type": "string",
      "description": "authToken returned in /exchange response. Prefix the auth token with \"Bearer\""
    }
  },
  "required": ["api-key", "authorization"]
}
```
----
```request http
{
  "method": "POST",
  "url": "https://validation.xqmsg.net/v2/keys",
  "headers": {
    "Content-Type": "application/json",
    "api-key": "123",
    "authorization":"Bearer xyz123"
  },
  "body": ["<token1>", "<token2>", "<token3>"]
}
```

> The request body is a bare JSON array of locator tokens, not an object. A successful response returns `{"exported": [{"<token1>": ".1aaa..."}, {"<token2>": ".1bbb..."}]}`.

Two things to handle on the response:

`exported` is an array of single-entry objects rather than one token-to-key map, so flatten it before use.

Tokens the caller is not authorized for are **omitted rather than reported as errors**. The response can be shorter than the request with no failure signal, so compare the returned count against what you asked for.

To retrieve a single key instead, see [`/key/{locatorToken}`](../reference/Validation.json/paths/~1key~1{Locator}/get) in the [Decryption Tutorial](./DecryptionApiTutorial.md).

## Choosing Between Them

Both endpoints cost one round trip, so the decision is about the access policy rather than performance.

Use the multi-key form of `/packet/add` when the keys are interchangeable from an access standpoint — a batch of messages for the same recipients, a set of files in one upload, records written in a single job.

Use `/packet/batch` when the packets need to be distinguishable later. Per-key labels are what make keys findable and auditable in the dashboard, and they cannot be added retroactively without re-creating the packet.

<!-- theme: info -->
> #### Prefer group recipients for long-lived keys
>
> Both endpoints accept group addresses of the form `{group_id}@_`, which resolve at key-retrieval time rather than at packet-creation time. Adding someone to the group grants access to every packet ever issued to it, with no re-encryption and no per-packet grant calls. Enumerated recipients are fixed at creation, and changing them means one [`/grant`](../reference/Validation.json/paths/~1grant~1{token}/post) or [`/revoke`](../reference/Validation.json/paths/~1revoke~1{token}/patch) call per packet. See [Key Authorization Policies](./KeyAuthorization.md).

