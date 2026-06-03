# Software Transactional Memory in .NET: Designing Composable Concurrency
Every system that shares mutable state between threads has to answer one question: how do concurrent operations agree on what the state is. Most of the time we answer it with locks, and most of the time that is enough. The trouble starts when the answer has to hold across several pieces of state at once, because that is where lock-based designs stop composing and start leaking their ordering rules into every corner of the codebase.

I have been working on this problem in a library called [STMSharp](https://github.com/engineering87/stmsharp), a Software Transactional Memory engine for .NET that I recently consolidated and released as 3.0.0. This article is partly about STM as an architectural choice and partly about the specific design decisions I made bringing it to .NET. I will also show the benchmarks, including the ones that contradicted what I expected, because the honest numbers are the most useful part.

## Concurrency is an architecture problem before it is a code problem

When people talk about thread safety they usually picture a single method and a single lock. That framing hides the real difficulty. Consider a small example: a transfer that moves an amount from one account to another.

```csharp
lock (accountA)
{
    lock (accountB)
    {
        accountA.Balance -= amount;
        accountB.Balance += amount;
    }
}
```

This method is correct. The problem is that its correctness depends on something outside the method. If another thread runs the same transfer in the opposite direction and takes the locks in the opposite order, the two threads can each hold one lock and wait forever for the other. The fix every textbook gives is to acquire locks in a globally consistent order, for example by account id. That works, but look at what just happened: a correctness rule that belongs to the whole system now has to be remembered and respected by every developer who writes any code that locks more than one account, in any method, forever.

This is the part that does not scale. Adding a lock is cheap. Keeping a global lock-ordering invariant alive across a growing codebase, across people who join and leave the team, across refactors that move code around, is expensive and fragile. The bugs it produces are the worst kind, because they appear only under specific timing and never in the tests.

The landscape of alternatives is familiar. Immutable data sidesteps the problem by removing shared mutation, which is excellent when it fits and awkward when state genuinely has to change in place. The actor model serializes state behind a single owner, which composes well but reshapes the whole program around message passing. Lock-free data structures give you specific high-performance primitives at the cost of being extraordinarily hard to write and verify. Software Transactional Memory occupies a different point in that space: it keeps shared mutable state and ordinary imperative code, and moves the coordination problem off the developer and into a runtime.

## What STM actually proposes

The idea comes straight from databases. You group a set of reads and writes into a transaction, the runtime runs it in isolation against a consistent view of memory, and at the end it either commits the whole thing atomically or detects a conflict and runs it again. You never name a lock. You describe what should happen, and the engine works out how to make it happen without violating consistency.

Here is the transfer again, expressed as an STM transaction in STMSharp:

```csharp
using STMSharp.Core;

var accountA = new STMVariable<int>(100);
var accountB = new STMVariable<int>(0);

await STMEngine.Atomic(tx =>
{
    var a = tx.Read(accountA);
    var b = tx.Read(accountB);
    tx.Write(accountA, a - 10);
    tx.Write(accountB, b + 10);
});
```

There is no lock and no ordering rule for the developer to maintain. If another transaction changes either account before this one commits, the engine notices, throws away the tentative work, and re-runs the block against fresh values. Only a consistent result is ever published. The ordering discipline that the lock-based version spread across the whole codebase now lives in one place, inside the engine, written once and verified once.

## Why I built it on .NET

STM has a long history in research and in languages like Haskell and Clojure, where it fits naturally because those languages already lean on immutability and controlled effects. .NET is a more pragmatic, mutable-by-default environment, and that is exactly why I found it interesting to build there.

The .NET concurrency toolbox is rich at the edges and thin in the middle. At one end you have `lock`, `Monitor`, and `Interlocked` for low-level mutual exclusion. At the other you have higher-level constructs like `Channel<T>`, the TPL, and the actor frameworks. What is missing from the standard library is a general way to make several independent pieces of shared state change together atomically without hand-writing the locking. That is the gap STMSharp aims at.

The platform also gives you the right primitives to implement it well. `Interlocked.CompareExchange` provides the atomic compare-and-swap the commit protocol needs. Records make the configuration object immutable and cheap to copy. The memory model, with `Volatile` reads and writes, gives precise control over visibility without dropping to unsafe code. And modern .NET runs the whole thing fast enough that the overhead, which I will quantify honestly below, stays in a range where the model is usable for real workloads, not just a research demo.

## The architecture

At a high level the library is layered. A public surface sits on top of a transactional context, which drives a core protocol over the shared variables and a global clock.

<pre class="mermaid">
flowchart TB
    subgraph Public["Public surface"]
        E[STMEngine<br/>Atomic / TryAtomic]
        O[StmOptions]
        D[STMDiagnostics]
    end
    subgraph Context["Transactional context"]
        I[ITransaction<br/>non-generic, per-call generic Read/Write]
        L[ITransaction&lt;T&gt; legacy<br/>via adapter]
    end
    subgraph Core["Core protocol"]
        S[StmTransaction<br/>read / write / commute buffers]
        VAR[STMVariable&lt;T&gt;<br/>value + 64-bit version-lock word]
        CLK[GlobalVersionClock]
    end
    DICT[TransactionalDictionary&lt;TKey,TValue&gt;]
    E --> I
    L -.adapts to.-> I
    E --> O
    I --> S
    S --> VAR
    S --> CLK
    VAR --> CLK
    DICT --> VAR
    E --> D
</pre>

The piece worth dwelling on is `STMVariable<T>`. Each variable holds its value together with a single 64-bit word that packs both a lock flag and a version number. The lowest bit is the lock, the rest is the version. Packing them together means a reader sees the lock state and the version in one atomic read, so it can never observe a version that belongs to a different lock state. The versions are not per-variable counters; they are stamps handed out by one process-wide clock, which makes any two versions across any two variables directly comparable. That comparability is the whole trick: a transaction can tell whether a variable changed since it started just by comparing stamps.

While it runs, a transaction touches no shared memory. It records what it reads in a read set, what it intends to write in a write set, and any deferred commutative operations in a commute set. These are plain arrays scanned in a loop rather than dictionaries, which for the handful of variables a typical transaction touches is both faster and lighter on the garbage collector.

### The transaction lifecycle

The flow of a single transaction is short. It samples a version, runs your code against a consistent snapshot, and then either commits or, if a read it depended on changed, throws the attempt away and runs again within its retry budget.

<pre class="mermaid">
flowchart TD
    A([Start: sample version, run delegate]) --> B{Snapshot consistent<br/>through commit?}
    B -->|Yes| C([Publish writes, stamp version])
    B -->|No| D{Attempts below budget?}
    D -->|Yes| E[Backoff and retry] --> A
    D -->|No| F([Fail: throw or return false])
</pre>

The detail that makes this safe to use with ordinary code is what happens on a bad read. When a transaction reads a variable whose version moved past its snapshot, it does not press on with stale data. It unwinds immediately and retries. This property is called opacity, and it means a transaction that is going to abort never runs your application logic on an inconsistent view. It cannot be tricked into an exception or an infinite loop by a concurrent commit, which is why you do not have to write defensive code inside a transaction.

### The commit protocol

The interesting work is at commit. A read-only transaction, or one that turned out to write nothing, has nothing to publish and commits for free, since every read was already checked against the start version. A read-write transaction goes through four steps.

<pre class="mermaid">
sequenceDiagram
    participant T as Transaction
    participant V as STMVariable write set
    participant C as GlobalVersionClock
    Note over T: Read set already validated<br/>against start version
    T->>V: 1. Lock write set in total Id order (CAS per variable)
    T->>C: 2. Advance clock once to obtain write version
    T->>V: 3. Revalidate read set against live version-lock word
    alt a read variable is locked or its version is newer
        T->>V: Release held locks
        Note over T: Abort and retry
    else read set still consistent
        T->>V: 4. Publish buffered values
        T->>V: Release each lock, stamping the new version
        Note over T: Commit succeeds
    end
</pre>

Locking several variables at once is where the deadlock question comes back, and the answer is the same total ordering that the manual lock-based transfer needed. The commit always takes its locks in increasing id order, so two committers can never form a wait cycle, and the one holding the lowest-id lock is always able to finish. The difference from the hand-written version is that the developer never sees this rule. It is a property of the engine, established in one place.

## Composing transactions

Because transactions compose, the library can offer coordination that is genuinely awkward with raw locks.

`Retry` lets a transaction wait for a condition instead of polling for it. When the delegate calls `Retry`, the engine parks the transaction on the variables it has read and wakes it when one of them is committed by someone else.

```csharp
await STMEngine.Atomic(tx =>
{
    var count = tx.Read(queueCount);
    if (count == 0)
        tx.Retry();          // wait until something changes the queue

    tx.Write(queueCount, count - 1);
});
```

`OrElse` runs one transaction, and if it blocks, runs an alternative instead, which is how you compose two blocking operations into one. `Commute` handles updates that commute with each other, such as increments, by deferring the operation to commit time and applying it to the live committed value under the lock, so two increments of the same variable do not treat each other as a conflict. And `TryAtomic` is the variant for hot loops that reports a failed commit through its return value rather than an exception:

```csharp
bool committed = await STMEngine.TryAtomic(tx =>
{
    tx.Write(counter, tx.Read(counter) + 1);
});
```

## The benchmarks, including the surprises

I measured STMSharp against a plain lock with BenchmarkDotNet, on an Intel Core Ultra 7 155H on .NET 10. The baseline is a single `lock` around a plain field, which is the reference every .NET developer already has in their head. I want to show these numbers rather than describe them, because they are the part that decides when the library is the right tool.

The first workload is the worst case for optimistic concurrency: many threads hammering a single shared counter, where there is no independent work to parallelize. Each thread performs a thousand increments.

| Threads | `lock` baseline | STMSharp read-modify-write | STMSharp `Commute` |
| ------- | --------------- | -------------------------- | ------------------ |
| 4       | 261 µs          | 653 µs (about 2.5x)        | 2.94 ms (about 11x) |
| 16      | 1.14 ms         | 3.14 ms (about 2.8x)       | 37.7 ms (about 33x) |

The lock wins, clearly, and it should. On a single contended field there is nothing for STM to gain and a real overhead for it to pay. The read-modify-write transaction lands at roughly two to three times the lock, which is the honest cost of the optimistic machinery on the worst possible workload.

The `Commute` column is the result that surprised me, and it is worth being open about it. I expected commute to be competitive here, since commuting increments do not conflict with each other logically. It was the opposite: commute was the slowest of the three by a wide margin. The cause is a fix I made earlier. Commute transactions had been hitting a livelock, losing a non-blocking race for the commit lock and exhausting their retry budget, so I changed the lock acquisition to wait in order rather than abort. That removed the livelock and is correct, but under sixteen threads all contending the same lock, waiting in order turns into busy-waiting: fifteen cores spin while one makes progress. Commute stays correct, the conservation invariant holds in every run, but on a single hot variable it is the wrong tool. Its real value is on commutative updates spread across many variables, where the threads are not all serialized on one lock.

The allocation picture reinforces the same conclusion. Across these workloads STMSharp allocates on the order of a couple of thousand times what the lock allocates per operation, because each attempt builds a transaction object and its buffers. An uncontended allocation profile of a single read-modify-write of an `int` puts the bulk of that cost in the transaction object and its read set, with the boxing of the value itself a small fraction:

| Scenario | Allocated per operation |
| -------- | ----------------------- |
| Value-type write (`int`) | 536 B |
| Reference-type write (`string`) | 512 B |
| Read-only | 368 B |

So value boxing is about 24 bytes, a small slice, while the transaction object and its read set dominate. That measurement is why allocation reduction, not de-boxing, is the work that would actually move the numbers, and it is the next thing on the roadmap.

The lesson I keep relearning on this project is to distrust my own performance intuition. I was wrong about disjoint access, I was wrong twice about commute, and each time a benchmark corrected me before the wrong belief turned into a permanent design decision. If you build anything in this space, measure first, and be willing to revert a change the numbers do not support.

## So when is STM the right choice

The decision is not subtle once the numbers are on the table.

Reach for a lock when you are guarding a single field or a small critical section, especially a hot one. It is simpler to read, simpler to reason about, and faster. STM has nothing to offer there, and pretending otherwise would be dishonest.

Reach for STM when the problem is structural rather than local: when an operation has to update several pieces of shared state together atomically, when you want to wait on a condition without hand-rolling lock ordering and signaling, or when you want a concurrency model whose guarantees are written down and checked rather than implied by convention. That is where moving the coordination into the engine pays for its overhead, because the alternative is the fragile, codebase-wide ordering discipline that this article started with.

Two practical rules matter inside transactions. Prefer immutable values, because mutating a referenced object without going through `Write` bypasses the version tracking and breaks isolation. And keep side effects out of the body or make them idempotent, because a transaction can run more than once.

## Closing

STM is not a faster lock. It is a different answer to the question of how concurrent operations agree on shared state, one that trades a measurable per-operation overhead for composition. The ordering rules that lock-based code scatters across a whole system are pulled into one engine, established once, and backed by a consistency model you can read.

STMSharp 3.0.0 is that idea consolidated for .NET. It targets `net8.0` and `net10.0`, it is MIT licensed, and it is on NuGet. The consistency model, an architecture document, and the full benchmark methodology are in the repository, and I would rather you check the reasoning than take my summary on faith.

The project is at [github.com/engineering87/stmsharp](https://github.com/engineering87/stmsharp).
