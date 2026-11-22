# Interview Q&A

## Step 1

**Why does the health API return 503 when MongoDB or Redis is unavailable?**

The API can accept HTTP requests while a dependency is down. The readiness response reports each dependency individually and uses 503 when either probe fails.

**How do you test dependency failures without running infrastructure?**

The Express app receives two probe functions. The Supertest suite supplies probes that resolve or reject, exercising routing, CORS, validation, and error responses through HTTP.

**Why use a single-node MongoDB replica set locally?**

It provides the replica-set behavior required for future transaction work. Compose initializes the member and waits until it can accept writes.
