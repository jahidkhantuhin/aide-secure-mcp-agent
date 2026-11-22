# Interview Q&A

## Step 1

**Why does the health API return 503 when MongoDB or Redis is unavailable?**

The API can accept HTTP requests while a dependency is down. The readiness response reports each dependency individually and uses 503 when either probe fails.

**How do you test dependency failures without running infrastructure?**

The Express app receives two probe functions. The Supertest suite supplies probes that resolve or reject, exercising routing, CORS, validation, and error responses through HTTP.

**Why use a single-node MongoDB replica set locally?**

It provides the replica-set behavior required for future transaction work. Compose initializes the member and waits until it can accept writes.

## Step 2

**What prevents an anonymous visitor from reading another workspace?**

The API verifies the HMAC on the HTTP-only cookie and derives the MongoDB session lookup from that cookie. Caller-supplied IDs do not select a workspace.

**How do you enforce limits when requests arrive concurrently?**

MongoDB checks the count and token balance and applies both updates in a single document operation. The TTL index removes expired records in the background, and each lookup also checks the expiry date.

**How do you keep owner signup private?**

The HTTP app exposes sign-in, sign-out, and identity. The registration command creates the owner directly through Better Auth, and the database enforces a unique owner slot.

## Step 3

**How can a tool apply a preview when MCP is stateless?**

Calendar writes carry the event ID and revision. Mail sends carry the draft ID and contents. A fresh protocol server can validate either against the provider without reading transport session state.

**How are read tools and previews tested?**

The official SDK client calls each tool, and the contract suite compares provider snapshots before and after reads and previews. Write tests check stale calendar revisions and repeated mail sends.

**What changes when the mock provider is replaced?**

The tools bind to typed calendar and mail interfaces. A replacement provider implements those contracts. Authorization and approval have to be enforced independently of annotations.
