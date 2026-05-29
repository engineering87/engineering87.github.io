# Breaking Things on Purpose: From Reliability Math to Chaos Engineering in .NET

I have lost count of the pull requests I approved that wrapped a flaky call in a retry policy. They all look responsible. Someone noticed an intermittent failure, added a circuit breaker and a timeout, wrote a sentence about improving resilience, and we merged it. The code sits in production, calm and reassuring, and mostly nobody finds out whether it works because the specific failure it was written for either never arrives or comes at three in the morning when no one is watching the right dashboard.

That is the quiet problem with resilience. It is easy to write and rarely tested under the conditions that justify it. We end up with a kind of theatre: defensive code that looks like safety but has never actually caught anything.

I want to approach that problem from two directions. The first is mathematical because the numbers explain something intuition gets wrong: why distributed systems fail far more often than the quality of their parts suggests and where failure tends to hide. The second is practical because once you believe the math you still have to prove your defences work. In .NET that proof now has a very direct form.

## Fault, error, failure

A little precision about words pays off later. A fault is the underlying defect or bad condition: a bug, a dropped packet, a thread pool with nothing left to give. When a fault becomes active it produces an error, an incorrect piece of internal state. When that error reaches the system's edge it becomes a failure, something a user or caller can see going wrong. Resilience is breaking that chain before the last link. A retry catches an error before it surfaces. A circuit breaker keeps a fault in something you depend on from turning into a wave of failures in something that depends on you.

<pre class="mermaid">
flowchart LR
    F["Fault: latent defect"] -->|becomes active| E["Error: bad internal state"]
    E -->|reaches the edge| FL["Failure: visible to caller"]
    RET["Retry"] -. catches .-> E
    CB["Circuit breaker"] -. stops the cascade .-> FL
    style FL fill:#fde2e2,stroke:#c0392b
</pre>

The kind of fault matters more than people expect. A transient fault is brief and fixes itself, a blip on the network. A persistent fault stays until something changes. A fail-stop fault is the honest kind: the component dies and goes silent. The nasty one is the gray failure, where the component is technically alive, passes its health check, and is slow or quietly wrong. Most resilience mistakes come from applying a mitigation designed for one kind of fault to another.

## What reliability actually costs

If a component fails at a roughly steady rate, its reliability over time decays exponentially:

```
R(t) = e^(-λt)
```

with λ the failure rate and a mean time to failure of `1 / λ`. More useful day to day is availability, the slice of time the thing is actually usable:

```
A = MTBF / (MTBF + MTTR)
```

There is a whole engineering philosophy in that fraction. You can increase availability by making failures rarer, the MTBF term, or by recovering faster, the MTTR term. Chasing rarer failures runs into diminishing returns quickly. Recovering faster does not. That is why we focus on failover, quick restarts, and automated recovery rather than the fantasy of a system that never breaks. We are not trying to avoid failure but to shorten our time spent inside it.

## Why the nines erode

Here is where intuition tends to fail. Picture a request that only succeeds if every service it touches succeeds. For independent components that is a series system, and the reliabilities multiply:

```
R_system = R_1 * R_2 * ... * R_n
```

Give every service the same availability `a` and the system lands at `a^n`. That exponent is unforgiving. Take a perfectly respectable 99.9% per service, three nines, and string fifty of them along a critical path:

```
0.999 ^ 50  ≈  0.9512   (about 95.1%)
0.999 ^ 100 ≈  0.9048   (about 90.5%)
```

Each service on its own is excellent. Compose a hundred of them and you get about 90.5%, which means roughly 832 hours of downtime a year. More than a month. The nines you report per service are not the nines your users experience, and every synchronous dependency you add to a request quietly drags that product down.

You only have two real weapons against the exponent. Shorten the chain so `n` is smaller. Or break the independence with redundancy, so the request survives as long as any one replica answers. In a parallel arrangement it is the failures that multiply instead:

```
R_parallel = 1 - (1 - r_1)(1 - r_2)...(1 - r_k)
```

Redundancy is the mathematical opposite of a series chain, which is exactly why it is the strongest lever we have.

<pre class="mermaid">
flowchart TB
    subgraph S["Series chain: all must succeed"]
        direction LR
        C1["Client"] --> A1["Service A"] --> B1["Service B"] --> D1["Service C"]
    end
    subgraph P["Redundancy: any one suffices"]
        direction LR
        C2["Client"] --> R1["Replica 1"]
        C2["Client"] --> R2["Replica 2"]
        C2["Client"] --> R3["Replica 3"]
    end
</pre>

## Slow is a failure too

Latency hides the same trap. Say each backend call has a 1% chance of being slow, one unlucky call in a hundred. A request that fans out to a hundred backends and waits on all is slow if even one is slow:

```
P(at least one slow) = 1 - (1 - 0.01) ^ 100  ≈  0.634
```

A 1% tail at the leaf becomes a 63% tail at the request. Jeffrey Dean and Luiz Andre Barroso made this famous as the tail at scale. The consequence is blunt: p99 latency in a single component is not an edge case once you fan out, it is the normal experience. Any serious treatment of resilience must count slow as a failure mode because at scale that is how it behaves.

## When a retry helps, and when it is a loaded gun

Retries feel like free insurance, and at first the math agrees. If each attempt fails independently with probability `p`, then `k` attempts all fail with probability `p^k`. So you eventually succeed with probability:

```
P(success within k attempts) = 1 - p^k
```

A transient fault that fails one time in five gives you `1 - 0.2^3 = 0.992` across three attempts. Lovely. But the key words are independently and stable, and they are easy to miss. The attempts must be independent and `p` must stay roughly the same between them. Both hold for a genuine transient fault. Neither holds when the dependency is down, where `p` is close to 1, `p^k` stays close to 1, and your retries do nothing except pile more load onto a service already drowning. That is the anatomy of a retry storm: a small outage turned large by the very code meant to protect us. The equation that justifies the retry forbids it in the moment that feels most desperate.

## Spreading the herd

Even a well-judged retry can hurt if the timing is naive. When every client that failed at the same instant retries after the same fixed delay, the retries arrive together, a thundering herd pounding the recovering service in synchronised waves. Exponential backoff spreads those waves over time. Jitter, a random nudge added to each delay, scatters clients so their retries stop lining up. The idea is almost too simple to write down, but on a service trying to come back up, the difference between synchronised and scattered retries is the difference between recovery and a second collapse.

## The circuit breaker is a bet

Strip away the metaphor and a circuit breaker is a small statistical decision. It watches outcomes over a window, estimates a failure rate, and trips when that estimate crosses a threshold, but only after seeing enough samples to take the estimate seriously. A 100% failure rate across two requests is noise. The same rate across two hundred is a verdict. Seeing the breaker as a sampling decision makes tuning less guesswork: too short a window or too low a sample floor trips on noise; too long and it keeps feeding traffic to something already dead.

<pre class="mermaid">
stateDiagram-v2
    [*] --> Closed
    Closed --> Closed: calls succeed
    Closed --> Open: failure ratio exceeds threshold (enough samples)
    Open --> HalfOpen: break duration elapses
    HalfOpen --> Closed: trial call succeeds
    HalfOpen --> Open: trial call fails
</pre>

## Where the math runs out

Everything so far is analytical and earns its keep by telling you where to look: long synchronous chains, fan-out tails, retries aimed at persistent faults, breakers tuned on too little data. What it cannot do is tell you the truth because every formula assumes independence and real outages are correlated. A shared database, a common dependency, a host that runs out of memory, a deployment that rolls out everywhere at once. These actually take systems down and are precisely the events the clean product-of-probabilities models leave out. Real failure is emergent. It lives in the interactions: timeouts that stack, retry budgets that quietly exhaust, breakers that trip on the wrong signal at the wrong moment.

You cannot think your way to confidence about behaviour like that. You have to cause it. That is the point of chaos engineering, and there is a clean way to read it: where reliability models compute the system's response to failure on paper, chaos engineering measures it in the field. You inject a fault with some probability per call, an injection rate like a weighted coin, and watch whether your retries, breakers, and timeouts do what the math promised. The injection rate is the experiment. The behaviour under it is the evidence.

## Breaking things in .NET

What makes this practical in .NET is that both halves of the job, building resilience and then trying to break it, now live in the same library. Polly v8 is a ground-up rewrite around one composable idea, the `ResiliencePipeline`. It pulled in fault-injection features that used to live in the separate Simmy project, rebranding them from Monkey to Chaos. Microsoft added an official layer on top with the `Microsoft.Extensions.Http.Resilience` package, the recommended replacement for the older `Microsoft.Extensions.Http.Polly`.

One honest caveat before the code. The snippets below show the Polly v8 API as I understand it. They convey shape rather than to be copied blindly. Pin the exact NuGet versions and compile and run them in your own project before publishing anything, since runtime behaviour depends on the installed version and I have not executed these in your environment.

A pipeline composes strategies in order, and the ones you add first sit furthest out, closest to the caller. Retry, circuit breaker, and a timeout look like this:

```csharp
var pipeline = new ResiliencePipelineBuilder<HttpResponseMessage>()
    .AddRetry(new RetryStrategyOptions<HttpResponseMessage>
    {
        ShouldHandle = new PredicateBuilder<HttpResponseMessage>()
            .Handle<HttpRequestException>()
            .HandleResult(r => (int)r.StatusCode >= 500),
        MaxRetryAttempts = 3,
        Delay = TimeSpan.FromMilliseconds(200),
        BackoffType = DelayBackoffType.Exponential,
        UseJitter = true                     // scatter the herd
    })
    .AddCircuitBreaker(new CircuitBreakerStrategyOptions<HttpResponseMessage>
    {
        FailureRatio = 0.5,                  // trip above a 50% failure rate
        MinimumThroughput = 10,              // but only with enough samples
        SamplingDuration = TimeSpan.FromSeconds(30),
        BreakDuration = TimeSpan.FromSeconds(15),
        ShouldHandle = new PredicateBuilder<HttpResponseMessage>()
            .Handle<HttpRequestException>()
            .HandleResult(r => (int)r.StatusCode >= 500)
    })
    .AddTimeout(TimeSpan.FromSeconds(10))
    .Build();
```

If you read that configuration next to the math, it stops being boilerplate. `UseJitter` cures synchronised retries. `FailureRatio` and `MinimumThroughput` are the breaker's threshold and sample floor that keep it from trusting noise.

For HTTP clients there is a one-liner that bundles the sensible defaults together:

```csharp
builder.Services.AddHttpClient<CatalogClient>(c =>
        c.BaseAddress = new Uri("https://api.example.com"))
    .AddStandardResilienceHandler();
```

That single handler sets up a rate limiter, a total request timeout, retry with exponential backoff, a circuit breaker, and a per-attempt timeout, and you can reconfigure any piece of it.

Now the other half. The chaos strategies, `AddChaosFault`, `AddChaosLatency`, `AddChaosOutcome`, and `AddChaosBehavior`, inject exceptions, delays, bad results, and arbitrary side effects. The ordering trips people up: the chaos goes on the inside, added last, so it sits right next to the real call and the resilience strategies you added earlier wrap around it. That is the point. You want your retry and breaker to see the injected fault and react to it.

<pre class="mermaid">
flowchart TB
    CALLER["Caller"] --> RETRY
    subgraph RETRY["Retry (outermost)"]
        subgraph BREAKER["Circuit breaker"]
            subgraph TIMEOUT["Timeout"]
                subgraph CHAOS["Chaos injection (innermost)"]
                    CALL["Real HTTP call"]
                end
            end
        end
    end
    style CHAOS fill:#fff3cd,stroke:#b8860b
</pre>

The chaos lives next to the real call, so every resilience strategy you added earlier wraps around it and gets a chance to respond.

```csharp
var pipeline = new ResiliencePipelineBuilder<HttpResponseMessage>()
    // outer: the resilience strategies under test
    .AddRetry(/* ...as above... */)
    .AddCircuitBreaker(/* ...as above... */)
    // inner: the chaos we inject to test them
    .AddChaosLatency(new ChaosLatencyStrategyOptions
    {
        InjectionRate = 0.10,                // a weighted coin: 10% of calls
        Latency = TimeSpan.FromSeconds(5)
    })
    .AddChaosFault(new ChaosFaultStrategyOptions
    {
        InjectionRate = 0.05,
        FaultGenerator = new FaultGenerator()
            .AddException(() => new TimeoutException("Chaos: injected timeout"))
    })
    .AddChaosOutcome(new ChaosOutcomeStrategyOptions<HttpResponseMessage>
    {
        InjectionRate = 0.05,
        OutcomeGenerator = new OutcomeGenerator<HttpResponseMessage>()
            .AddResult(() => new HttpResponseMessage(HttpStatusCode.InternalServerError))
    })
    .Build();
```

Those `InjectionRate` values are the experiment's parameters. Ten percent latency injection asks a direct question and waits for an answer: when one call in ten goes slow, does the timeout fire, does the retry recover, and does the tail behave as the fan-out math predicted?

Injecting faults blindly into production would be reckless, so the strategies come with a switch. You gate them by environment and start the injection rate low. The official guidance is sensible: chaos always on in test environments at a modest rate, and in production only for designated test users at a lower rate. The `Enabled` flag and per-environment configuration give you that control.

```csharp
.AddChaosFault(new ChaosFaultStrategyOptions
{
    InjectionRate = 0.05,
    EnabledGenerator = args =>
        ValueTask.FromResult(env.IsDevelopment() || IsTestUser(args.Context)),
    FaultGenerator = new FaultGenerator()
        .AddException(() => new TimeoutException("Chaos: injected timeout"))
})
```

Start in development with a high rate to surface obvious gaps quickly. Move to staging at a realistic rate. Only then, and behind a user gate, let a thin trickle of chaos reach production, where correlated, emergent failures the math could never model finally get a chance to show themselves.

## What you are left with

The math gives you the shape of the danger. Series composition is why the nines you report are not the nines anyone feels. The tail-at-scale formula is why slow counts as broken. The retry equation tells you the precise conditions under which a retry is help rather than a loaded gun. The breaker is a bet about a sampling window dressed up as a switch. All of it is worth knowing, and none of it is proof, because the failures that really hurt are the correlated ones the formulas politely ignore. Chaos engineering is how you turn the model into evidence, and Polly v8 lets you write the resilience and inject the faults that test it inside one pipeline. That is what closes the gap between the resilience you think you have and the resilience you can actually show.

---

### References and further reading

These back the technical claims above. Check the exact bibliographic details and the current package versions before citing them in a finished piece.

- Polly documentation, Chaos engineering: https://www.pollydocs.org/chaos/
- .NET Blog, Resilience and chaos engineering: https://devblogs.microsoft.com/dotnet/resilience-and-chaos-engineering/
- .NET Blog, Building resilient cloud services with .NET 8: https://devblogs.microsoft.com/dotnet/building-resilient-cloud-services-with-dotnet-8/
- NuGet, Microsoft.Extensions.Http.Resilience: https://www.nuget.org/packages/Microsoft.Extensions.Http.Resilience
- Jeffrey Dean and Luiz Andre Barroso, "The Tail at Scale," Communications of the ACM, 2013 (verify the exact reference)
- The reliability and availability formulas are standard results from reliability engineering
