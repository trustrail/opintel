# Introduction

Source: https://xq.stoplight.io/docs/xqmsg/ab9c86ba2c5d8-introduction

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `article` · Source URI: `/docs/EncryptionApiIntroduction.md`

## Published article

# Introduction
The Encryption API tutorial shows you how to store an encryption key in the XQ key store and use the encryption key to encrypt a message.
<!-- theme: warning -->
> #### This tutorial is not a sandbox!
>
> Any operations in this tutorial behave as if you executed them from our own server.

### What to expect in this tutorial
This tutorial contains five sections. Each section contains details on the API call required to complete the section of the tutorial. After finishing this tutorial, you will be able to use your stored encryption key to encrypt a message. 

Refer to the following descriptions for an overview of each section of the tutorial: 

#### Section 1 - Creating the subscriber
In this section of the tutorial you will create a subscriber. The subscriber is an email address that is authorized to use an encryption key.

#### Section 2 *(Optional)* - Supply Entropy to your encryption key
In this section you can supply entropy to your encryption key. Your key is a random string of bits used by an encryption algorithm for rewriting data so it appears to be random. Supplying entropy to your encryption key adds an extra layer of security.

#### Section 3 - Creating & Storing the key packet
In this section you will create an encrypted packet containing the encryption key that you want to protect, a list of authorized users, and set how long it is allowed to be used. The server returns a locator token, the locator token is used by the subscriber or recipients to retrieve the secret key in the future.

#### Section 4 - Encrypting a message
In this section you will encrypt a message using your encryption key.
