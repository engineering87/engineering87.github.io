# Cell‑Based Architecture: pragmatic isolation at scale
Large systems fail for predictable reasons: shared bottlenecks, shared state, and shared deployment units. Even when services are “small”, the operational failure domain often remains one big bucket.
A cell-based architecture breaks that bucket into smaller ones. The workload is replicated into isolated cells and traffic is partitioned across them, so failures and rollouts can be managed cell by cell.

This article keeps the idea simple and practical. You’ll get a clear definition, reasons to use (and not use) the approach, and a generic .NET reference you can adapt to almost any context.

## What a “cell” really is
A cell is not “a microservice” and it’s not “a region”. A cell is a **self‑sufficient slice of your workload** that can serve a subset of traffic on its own.
Think of it as a small copy of the system’s operational shape: API entry points, background workers if you have them, a cache if you need it, and this is the part people often underestimate **its own state** or a clearly separated state partition. The cell should be something you can scale, deploy, throttle, and even drain out of rotation without breaking the global system.

A typical view looks like this:

<pre class="mermaid">
flowchart LR
  U[Clients] --> R[Cell Router / Gateway]
  R --> C0[Cell 00: API + Workers + Cache + Data partition]
  R --> C1[Cell 01: API + Workers + Cache + Data partition]
  R --> C2[Cell 02: API + Workers + Cache + Data partition]
  R --> CX[...]
</pre>

The router decides which cell receives a request. The decision is usually driven by a **partition key**: tenant id, account id, region, cohort, or any other stable attribute that matches how your traffic naturally splits.

## What cell‑based architecture is not
It helps to be explicit about what CBA doesn’t magically solve.
It isn’t a synonym for microservices. You can have dozens of microservices and still have one shared database and one shared failure domain. It also isn’t automatically “multi‑region”; cells can live inside a single region if your main goal is isolation rather than geo redundancy.
And it isn’t Domain‑Driven Design. DDD partitions by meaning, ownership, and business language. Cells partition by operational isolation and blast radius. They can coexist nicely, but they answer different questions.

## Why teams adopt it
The main value of CBA is not theoretical elegance. It’s everyday operational safety.
When you isolate the workload into cells, you get failure containment almost for free. If cell‑03 is having trouble maybe a bad deployment, maybe a hot tenant, maybe a misbehaving downstream dependency you can reduce or remove traffic to that one cell while the rest keeps working. Capacity may go down, but the system doesn’t collapse into a single global incident.
Deployments become calmer as well. Instead of releasing to the whole fleet, you release to a single “canary cell”, observe, and then promote. This sounds like canary deployments in general, but the difference is that a cell gives you a bounded unit where not only the API binaries change, but also the local cache, queues, workers, and data partition behave together. You are testing a full slice of reality.
Finally, scaling becomes more predictable. If load spikes are localized, often true, in multi‑tenant systems you can scale the impacted cells without resizing everything else, which is healthier for cost and for operational focus.

## When it’s worth the cost
Cell‑based architecture is most compelling when your workload already “wants” to be partitioned.
If you serve multiple tenants or customer groups with different behaviors, CBA gives you a clean way to prevent one from hurting the others. If you operate in a regulated or mission‑critical environment where a broad outage is unacceptable, cells provide an isolation boundary that is easy to reason about in incident response. And if deployments are routinely stressful because a change can take down too much at once, the canary‑cell rollout model is a concrete way to reduce risk without slowing delivery.
In other words, CBA shines when you can answer two questions with confidence: “what is my partition key?” and “can I keep state isolated per partition?”

## When you should *not* use it
CBA is not cheap. The thing you gain independence comes from the thing you pay duplication.

If your system is small enough that failures are manageable with simpler patterns, cells are likely overkill. If your traffic does not partition naturally, routing becomes arbitrary, and you’ll spend your time arguing about why a request should go to cell‑04 rather than cell‑07. If you cannot isolate state and you’re not ready to change that, cells won’t deliver their promise; you’ll end up with replicated stateless tiers all depending on the same stateful bottleneck.

A good practical check is this: if your “cells” share a database in a way that allows a global lock, a global schema migration, or a global saturation to take everything down, then you don’t have cell isolation yet. You have replicas.

## The part that makes or breaks the design: state
People often start from routing and deployments because they’re visible and exciting. The real architecture work is state.
The cleanest model is database per cell, because it gives you true isolation and straightforward failure boundaries. The more common compromise is a shard per cell: same database technology, but strict partitioning so that each cell owns its slice. Some teams start with a shared database and a strong partitioning discipline as a transition phase, but you should treat that as a temporary step. Shared state tends to reintroduce shared fate over time.
State isolation also implies a mindset shift: cross‑cell synchronous calls should be rare. When information needs to flow between partitions, asynchronous integration (events, outbox/inbox patterns, projections) keeps the isolation boundary intact.

## A generic .NET reference: the shape of the solution
This section stays deliberately use‑case‑agnostic. Whether you run on Kubernetes, VMs, or managed services, the logical responsibilities remain the same.
You’ll typically have a **cell router** at the edge and a replicated **cell workload** behind it. A control plane is optional at the beginning, but it becomes valuable once you need rebalancing and operational automation.
In .NET, a pragmatic router can be built with **YARP** (Yet Another Reverse Proxy). YARP is a production‑grade reverse proxy that supports routing, transforms, health checks, and dynamic configuration.

The basic idea is simple:

1. determine a partition key for the request (for example, `X-Tenant-Id`)
2. compute or look up a cell id
3. route to the cell’s backend cluster
4. make telemetry and failure handling cell‑aware

## Routing strategy: hashing first, mapping later
There are two common ways to assign cells.
A deterministic hash is the easiest place to start. It requires no lookup store and it gives you stable placement across restarts. The trade‑off is rebalancing: moving a tenant between cells becomes a project.
A lookup table (tenant → cell) is more flexible. It enables hot‑tenant isolation and controlled migrations, but it introduces a dependency you must make highly available and fast. In practice, teams often start with hashing and later add a mapping layer once operational needs demand it.
The reference below uses hashing because it’s the smallest thing that can work.

## Building the Cell Router in .NET with YARP

### Minimal proxy configuration

Here is a minimal `appsettings.json` excerpt that defines one cluster per cell. The addresses are placeholders; in Kubernetes they could be service DNS names, elsewhere they can be regular endpoints.

```json
{
  "ReverseProxy": {
    "Routes": {
      "all": {
        "ClusterId": "byCell",
        "Match": { "Path": "/{**catch-all}" }
      }
    },
    "Clusters": {
      "cell-00": {
        "Destinations": { "d1": { "Address": "http://cell-00-api/" } }
      },
      "cell-01": {
        "Destinations": { "d1": { "Address": "http://cell-01-api/" } }
      }
    }
  }
}
```

For a large number of cells you will not want to hardcode routes and clusters. You’ll generate them from a config store or service discovery. But starting simple helps you validate the pattern quickly.

### Assigning a cell id in middleware
The router needs to compute a cell for each request. The snippet below reads a partition key from `X-Tenant-Id`, hashes it, and injects `X-Cell-Id`. This is intentionally generic: replace the header with whatever key makes sense in your system.

```csharp
using System.Security.Cryptography;
using System.Text;

public sealed class CellAssignmentMiddleware
{
    private readonly RequestDelegate _next;
    private readonly int _cellCount;

    public CellAssignmentMiddleware(RequestDelegate next, int cellCount) =>
        (_next, _cellCount) = (next, cellCount);

    public async Task Invoke(HttpContext ctx)
    {
        var key = ctx.Request.Headers["X-Tenant-Id"].ToString();

        if (string.IsNullOrWhiteSpace(key))
        {
            ctx.Response.StatusCode = StatusCodes.Status400BadRequest;
            await ctx.Response.WriteAsync("Missing X-Tenant-Id.");
            return;
        }

        var cellId = ComputeCellId(key, _cellCount); // "cell-03"
        ctx.Items["cell.id"] = cellId;
        ctx.Request.Headers["X-Cell-Id"] = cellId;

        await _next(ctx);
    }

    private static string ComputeCellId(string key, int cellCount)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(key));
        var value = BitConverter.ToInt32(bytes, 0) & int.MaxValue;
        var idx = value % cellCount;
        return $"cell-{idx:00}";
    }
}
```

### Routing to the correct cell
A straightforward technique is to have one route per cell that matches on `X-Cell-Id`. It is verbose but it is extremely easy to understand and debug. Later, once you have a control plane, you can switch to dynamic routing.

```json
{
  "ReverseProxy": {
    "Routes": {
      "cell00": {
        "ClusterId": "cell-00",
        "Match": {
          "Path": "/{**catch-all}",
          "Headers": [{ "Name": "X-Cell-Id", "Values": ["cell-00"] }]
        }
      },
      "cell01": {
        "ClusterId": "cell-01",
        "Match": {
          "Path": "/{**catch-all}",
          "Headers": [{ "Name": "X-Cell-Id", "Values": ["cell-01"] }]
        }
      }
    }
  }
}
```

### Wiring the router

```csharp
var builder = WebApplication.CreateBuilder(args);

builder.Services.AddReverseProxy()
    .LoadFromConfig(builder.Configuration.GetSection("ReverseProxy"));

var app = builder.Build();

app.UseMiddleware<CellAssignmentMiddleware>(cellCount: 10);
app.MapReverseProxy();

app.Run();
```

This is enough to demonstrate the core behavior: a request enters the router, gets assigned a cell, and is forwarded to the correct backend.

## What changes inside the cell workload
Your APIs and workers inside a cell should feel like normal .NET services, with one important constraint: they must be cell‑aware for state and telemetry.
If you run on Kubernetes, the simplest approach is to inject `CELL_ID` as an environment variable. On VMs, it can come from configuration. Either way, treat the cell id as part of the service identity.
From there, select the correct data partition. The cleanest pattern is to resolve connection settings from a small “cell context” service. Whether that context picks a different connection string, schema, or shard key depends on your storage strategy, but the principle is the same: a cell must not quietly drift into shared state.


## Making observability cell‑aware (and why it matters)
Once you introduce cells, incident response becomes “which cell is sick?”. That only works if your telemetry carries `cell.id` consistently.
In .NET, OpenTelemetry is a practical default. Add the cell id as a resource attribute at startup, so every trace and metric inherits it. The exporters and backend are your choice; the key is that cell identity becomes a first‑class dimension.

```csharp
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;

var cellId = Environment.GetEnvironmentVariable("CELL_ID") ?? "cell-unknown";

builder.Services.AddOpenTelemetry()
    .ConfigureResource(r => r.AddService("sample.cell.api")
        .AddAttributes(new Dictionary<string, object> { ["cell.id"] = cellId }))
    .WithTracing(t => t
        .AddAspNetCoreInstrumentation()
        .AddHttpClientInstrumentation()
        .AddOtlpExporter());
```

Even if you do not adopt OpenTelemetry today, keep the idea: every log line, trace, metric, and alert should know which cell it belongs to.


## Rollouts that don’t spike your blood pressure
The most satisfying “cell moment” is the day you stop doing big‑bang releases.
A simple operational loop is enough. Deploy the new version to one canary cell. Route a small cohort to it (or only internal traffic). Watch the basics: error rate, latency, saturation, and any business signals that matter. If it looks healthy, promote to the next cells in waves.
If it doesn’t look healthy, drain the canary cell and roll back without impacting global traffic. You still have work to do, but you’ve turned a platform‑wide incident into a contained issue.

## A short note on DDD
It’s common to worry that cells “fight” Domain‑Driven Design. In practice they don’t, as long as you don’t try to force one partitioning dimension to do everything.
DDD tells you how to structure business ownership and boundaries. Cells tell you how to contain operational failures. Sometimes a cell will contain multiple bounded contexts because the partition key is tenant or region rather than domain. Other times a single bounded context might be replicated across cells. That is fine. The design becomes confusing only when you pretend these are the same concept.

## What “good” looks like in practice
You know your cell‑based architecture is real when a broken cell behaves like a capacity issue, not like a correctness issue. You can drain it, keep the rest serving, and your operational tools can tell you, within minutes, what went wrong and where.
If you can’t confidently drain a cell, or if draining a cell breaks global behavior, you’re not done yet. The main value of CBA is not the diagram; it’s the operational control it gives you on a bad day.

## Conclusion
Once the basic pattern works, you’ll almost certainly want two upgrades.
First, introduce a mapping layer so you can move tenants between cells without changing hash functions. Second, automate the lifecycle: provisioning a new cell should be infrastructure‑as‑code, not a weekend project.
But don’t start there. Start with a single router, a handful of cells, strict state separation, and cell‑aware telemetry. If those four pieces hold, you’ll have a platform you can grow with confidence.
