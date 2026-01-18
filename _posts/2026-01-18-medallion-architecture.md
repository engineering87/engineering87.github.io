# Medallion Architecture for PDND Interoperability Data in Public Administration  
*(Bronze → Silver → Gold as a path to progressively higher data quality)*

When you work with **PDND-based interoperability**, it is tempting to think that the job ends when the e-service exchange is “correct” from a protocol standpoint: authentication works, the request reaches the provider, and a payload comes back. No, this is only the starting point.

What matters in Public Administration scenarios is what happens **after** the exchange: can the data be trusted, compared across time, reused by multiple processes, and evolved without breaking everything downstream? If interoperability is the highway, data quality is what determines whether the traffic is safe and sustainable.

This is why I want to adopt the **Medallion Architecture** as a first-class pattern for PDND data exchanges. Medallion (often described as **Bronze → Silver → Gold**) is not a technology choice; it is an **operating model** for improving data quality in stages. Instead of attempting to produce a “perfect” dataset immediately (which usually leads to brittle pipelines or hidden assumptions), Medallion establishes a controlled progression where each layer has a clear contract and a clear responsibility.

In practice, this layered approach solves three recurring problems that are particularly common in interoperability ecosystems:

First, **traceability and replayability**: PDND exchanges happen between multiple parties and evolve over time. When a contract changes, or when an issue is discovered months later, you need to be able to go back to the original exchanged payload and reprocess it with new rules. Without this, every correction becomes a one-off patch and historical data becomes inconsistent.

Second, **semantic stability**: even when providers follow the same interoperability rules, payload semantics can vary. Code sets can drift, optional fields can be missing, different versions can coexist, and interpretations can differ between organizations. Medallion gives you a place to define a stable internal meaning (Silver) that downstream systems can rely on, independently from how external payloads evolve.

Third, **reusability at scale**: once PDND data is available, it tends to be consumed by many different use-cases: reporting, controls, workflow automation, downstream services, auditing, and analytics. If every consumer cleans and normalizes data on its own, you end up with duplicated logic, conflicting numbers, and fragile processes. Medallion addresses this by centralizing data quality and publishing consumption-ready products (Gold) with explicit contracts.

The key insight is simple:

> **Medallion Architecture is a maturity path for interoperability data.**  
> It turns “data exchanged” into “data that multiple systems can trust”, while keeping evolution manageable.

This post keeps examples intentionally generic and focuses on how to interpret Bronze/Silver/Gold specifically in a PDND context, using high-level .NET design patterns to express the contracts between layers.

## Why Medallion is a good fit for PDND interoperability

Interoperability data naturally changes over time. Payloads can be refined, fields can be added, and semantics can be clarified. Without structure, these changes quickly force downstream consumers to either break or to implement their own ad-hoc interpretation logic, which leads to inconsistent results and fragile processes.

Medallion Architecture addresses this by giving you three well-defined “quality gates”:

Bronze preserves what was exchanged so you can always replay and reprocess. Silver standardizes and validates meaning through a canonical internal contract. Gold then packages that trusted meaning into consumption-ready data products aligned to real operational and business needs. The result is an interoperability pipeline that becomes more reliable as the ecosystem grows.

## Interpreting Bronze/Silver/Gold for PDND exchanges

### Bronze: “as exchanged” (interoperability truth)

The Bronze layer captures the PDND exchange **as it happened**, staying as close as possible to the source. Its purpose is not to improve the data; it is to preserve evidence and enable replay.

In practice, Bronze stores the original payload (as exchanged) together with minimal technical metadata to keep it traceable across time and systems. A useful design choice here is to avoid long method signatures and “flat” records; instead, model the exchange as an **envelope** that carries both metadata and payload. This keeps contracts stable when metadata evolves (new identifiers, environment markers, schema hashes, etc.) without forcing changes across the codebase.

```csharp
public sealed record PdndExchangeMetadata(
    string CorrelationId,
    DateTimeOffset ReceivedAtUtc,
    string EServiceId,
    string ProviderOrganization,
    string ContractVersion
);

public sealed record PdndBronzeExchange(
    PdndExchangeMetadata Meta,
    string Payload // raw payload as exchanged (e.g., JSON/XML as string)
);
```

A helpful mental model is simple: **Bronze is the truth you can always return to**, especially when rules change or issues are discovered later.

### Silver: “conformed and validated” (quality and standardization)

Silver is where “as exchanged” data becomes a **canonical internal representation** with stable semantics. This is the layer where data quality is actively increased and formalized.

The central concept is the **canonical contract**: your internal model that preserves meaning even when external payload versions evolve. In Silver you enforce schema and types, normalize formats and code sets, validate both syntax and semantics, and deal explicitly with idempotency/deduplication in a deterministic way. Silver is also where you make data quality visible by quarantining invalid or incomplete records instead of silently dropping them.

To keep the design clean and signatures stable, a useful approach is to pass cross-cutting concerns (reference data, policies, environment-specific rules) through a **processing context**, rather than adding parameters to every method. This makes the pipeline easier to evolve and test.

```csharp
public sealed record ProcessingContext(
    string Environment,
    IReferenceData ReferenceData,
    IPolicySet Policies
);

public sealed record ValidationResult(bool IsValid, string? Reason);

public interface ICanonicalMapper<in TIn, out TOut>
{
    TOut Map(TIn input, ProcessingContext ctx);
}

public interface IValidator<in T>
{
    ValidationResult Validate(T item, ProcessingContext ctx);
}
```

With those contracts in place, your Silver pipeline becomes readable and explicit about the quality boundary it enforces. Importantly, it stays stable even when you add new rules or enrichments, because those evolve inside `ProcessingContext` rather than in method signatures.

```csharp
public sealed class SilverPipeline<TBronze, TSilver>
{
    private readonly ICanonicalMapper<TBronze, TSilver> _mapper;
    private readonly IValidator<TSilver> _validator;

    public SilverPipeline(
        ICanonicalMapper<TBronze, TSilver> mapper,
        IValidator<TSilver> validator)
    {
        _mapper = mapper;
        _validator = validator;
    }

    public (TSilver? Valid, TSilver? Invalid, string? Reason) Process(
        TBronze bronze,
        ProcessingContext ctx)
    {
        var canonical = _mapper.Map(bronze, ctx);
        var result = _validator.Validate(canonical, ctx);

        return result.IsValid
            ? (canonical, default, default)
            : (default, canonical, result.Reason);
    }
}
```

### Gold: “domain-ready” (data products and consumption contracts)

Gold takes validated Silver data and turns it into **consumption-oriented datasets**, often referred to as data products. Gold does not necessarily make the data “more correct” than Silver; it makes it **more usable** for a specific audience and use-case.

In Gold you typically apply controlled enrichments (for example by joining reference data), define domain projections that match how processes and services consume the information, and introduce derived attributes or aggregates when they add clarity and value. The key architectural choice is to avoid a single “catch-all” dataset and instead publish targeted products with explicit contracts.

Here again, the same “clean signature” rule applies: keep your projector interfaces simple and push cross-cutting concerns into the context.

```csharp
public interface IGoldProjector<in TSilver, out TGold>
{
    TGold Project(TSilver silver, ProcessingContext ctx);
}

public sealed record GoldDataProductRow(
    string BusinessKey,
    DateOnly BusinessDay,
    string Category,
    string ProviderOrganization,
    string EServiceId
    // + fields shaped for a specific consumer/use-case
);
```

## The key PDND benefit: quality increases without breaking interoperability

A practical advantage of Medallion in PDND scenarios is that it allows exchanges to evolve safely. External contracts can change, but Bronze preserves the original payload for replay. Silver stabilizes internal meaning through canonical mapping and validation. Gold delivers consumption-ready data products whose contracts you control.

This prevents a common interoperability anti-pattern: each downstream consumer interprets the same PDND payload differently, re-implementing cleaning rules and code mappings in inconsistent ways. Over time that leads to fragile processes and conflicting numbers. Medallion keeps meaning centralized, explicit, and versionable.

## Operational principles that make it work

Treat Bronze as immutable evidence. Ensure Silver transformations are deterministic so reprocessing remains trustworthy. Treat external versions as explicit contracts and keep your canonical representation stable. Make quarantine a normal part of the pipeline, because visibility is how quality improves. Finally, design Gold as a set of purpose-driven data products rather than a single generic dataset.

## Conclusion

In PDND interoperability, the exchange is the beginning, not the end. Medallion Architecture provides a clean and repeatable path to convert “data exchanged across entities” into “data that multiple systems can trust”:

- **Bronze** preserves the truth of the exchange
- **Silver** stabilizes meaning through conformity and validation
- **Gold** delivers domain-ready data products aligned to real consumption needs
