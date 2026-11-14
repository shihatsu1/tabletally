# Security policy

TableTally keeps score for card games. It stores no payment data and no accounts, but it does hold each table's hands while they are played and must only send each phone its own cards. Please report anything that breaks that, or anything that lets someone change a table they are not host of, read another table, or take a table down.

## Reporting a problem

Please do **not** open a public issue. Use GitHub's private reporting instead: on the repository page open **Security**, then **Report a vulnerability**. Include what you did, what you saw, and the smallest steps that show it.

You should get an answer within a week. Once a fix is released you are welcome to write about it, and we are happy to credit you.

## In scope

- Seeing another player's cards before the end of a hand, or predicting a deal.
- Acting as the host (or another player) without that phone's identity or the host key.
- Reading a table you do not have the code for, or changing its history.
- Making the Worker or a table's Durable Object fail or grow without bound from outside.

## Out of scope

- Someone at your table reading your phone over your shoulder.
- Guessing a live table's six-letter code by brute force within the published rate limits (about 887 million codes, 60 lookups a minute per address).
- Problems that need a malicious browser extension or a compromised phone.
