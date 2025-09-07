# Building Resilient Distributed Systems with MassTransit in .NET
In today’s software landscape, applications rarely live in isolation. 
Modern systems need to talk to each other: services exchange data, workflows span multiple applications, and events need to propagate across boundaries.
But this interconnectedness comes with challenges:
- *How can we avoid brittle point-to-point integrations?*
- *How can we ensure messages aren’t lost when something goes down?*
- *How can we scale without reinventing the wheel each time?*

This is where [**MassTransit**](https://github.com/MassTransit/MassTransit), a free, open-source distributed application framework for .NET, steps in.

## Why MassTransit?
At its core, MassTransit abstracts away the complexity of messaging systems (RabbitMQ, Kafka or Azure Service Bus) and lets developers focus on business logic instead of boilerplate.
With MassTransit you get:
- **Decoupling**: services don’t need to know about each other’s implementation details.
- **Reliability**: messages are queued and retried automatically.
- **Scalability**: horizontal scaling becomes straightforward since multiple consumers can process from the same queue.
- **Patterns out of the box**: publish/subscribe, request/response, sagas for long-running workflows.

It’s like getting a well-tested messaging toolkit built on top of proven transport engines.

## A Simple Example in .NET
Let’s start with a basic scenario: a service that publishes a `EventSubmitted` event, and another service that processes it.

### Define a Message Contract
```csharp
public record EventSubmitted(Guid EventId, string Body);
```

### Configure MassTransit with RabbitMQ
```csharp
services.AddMassTransit(x =>
{
    x.AddConsumer<EventSubmittedConsumer>();

    x.UsingRabbitMq((context, cfg) =>
    {
        cfg.Host("rabbitmq://localhost");
        cfg.ConfigureEndpoints(context);
    });
});
```

### Implement a Consumer
```csharp
public class EventSubmittedConsumer : IConsumer<EventSubmitted>
{
    public async Task Consume(ConsumeContext<EventSubmitted> context)
    {
        Console.WriteLine($"Processing event {context.Message.EventId} for {context.Message.Body}");
        // Business logic goes here
    }
}
```

### Publish an Event
```csharp
await bus.Publish(new EventSubmitted(
    Guid.NewGuid(),
    "BODY_HERE"
));
```

So, the publishing service doesn’t care which component listens. The consumer picks up the event, processes it, and everything is safely routed via RabbitMQ.

## Beyond Basics: Sagas and Workflows
In many public sector scenarios, processes do not operate within a single request/response cycle. 
Consider a citizen requesting a benefit certificate. The system must verify the documents first, conduct a background check, and only then make a decision. 
Each of those steps can be performed by separate services and may take time.
If those workflows are manually managed then services tend to be large, complex services with conditional logic, retries, and fragile state. 
MassTransit provides a solution to this complexity in the form of sagas. A **SAGA** is a state machine that is aware of the lifecycle of a request and responds to events like “Documents Verified” or “Background Check Complete”.
The durability and simplicity of sagas is what makes them so useful. 
The current state is persisted in a database, and as long as the request is still open, if the system restarts the process will continue as though it never left. 
Developers do not need to worry about lifecycle management. They only need to define the events of interest, a class to hold the request's current state and a state machine that details how the events will transition the workflow. 
MassTransit orchestrates the correlation, persistence, and reliability so you can focus on the business rules.

MassTransit handles all the difficult work behind the curtain:
- it deals with identification of each workflow instance as well as correlation with the right messages
- it saves your state in the database of your choice (SQL Server, PostgreSQL, MongoDB, or any other)
- it also takes care of concurrency and retries so you can concentrate on business logic modeling rather than plumbing code.

Developers can now model the complex business process just by the few lines of configuration and state machine definition. 
Essentially, rather than painstakingly writing thousands of lines of orchestration code, you simply specify how your process should change and it is MassTransit that ensures it as reliable, distributed and resilient by design.
Sagas are extremely beneficial to those types of domains where processes, are involved in multiple asynchronous steps and have to be very careful not to lose any part of the process such as e-commerce, finance, telecom, and healthcare. 
By adopting sagas, you make your workflows explicit, auditable, and easy to extend over time.
In fact, sagas convert the fast-orchestrated, haphazard, ad-hoc mode to a lucid, event-driven flow. 
In .NET, MassTransit pattern acceptance is not only possible but also surprisingly easy.

### Sample SAGA with MassTransit in .NET
**Scenario**: a citizen submits a request for a family benefits certificate. 
The process spans multiple back-office steps: document verification, background checks, and final approval. 
Each step is asynchronous and possibly handled by different services.

### Messages (events/commands)
```csharp
public record BenefitRequestSubmitted(Guid RequestId, string CitizenFiscalCode);
public record DocumentsVerified(Guid RequestId, bool Passed, string? Notes = null);
public record BackgroundCheckCompleted(Guid RequestId, bool Passed, string? Notes = null);
public record RequestApproved(Guid RequestId);
public record RequestRejected(Guid RequestId, string Reason);
```

### Saga state
```csharp
using MassTransit;

public class BenefitRequestState : SagaStateMachineInstance
{
    public Guid CorrelationId { get; set; }      // MassTransit saga key
    public string CurrentState { get; set; } = default!;
    public string CitizenFiscalCode { get; set; } = default!;
    public bool? DocsOk { get; set; }
    public bool? BackgroundOk { get; set; }
    public string? LastNotes { get; set; }
    public DateTime StartedAtUtc { get; set; }
}
```

### State machine (orchestration)
```csharp
using MassTransit;

public class BenefitRequestStateMachine : MassTransitStateMachine<BenefitRequestState>
{
    public State Submitted { get; private set; }
    public State Verifying { get; private set; }
    public State Checking { get; private set; }
    public State Completed { get; private set; }

    public Event<BenefitRequestSubmitted> RequestSubmitted { get; private set; }
    public Event<DocumentsVerified> DocsVerified { get; private set; }
    public Event<BackgroundCheckCompleted> BgcCompleted { get; private set; }

    public BenefitRequestStateMachine()
    {
        InstanceState(x => x.CurrentState);

        Event(() => RequestSubmitted, x => x.CorrelateById(c => c.Message.RequestId));
        Event(() => DocsVerified,      x => x.CorrelateById(c => c.Message.RequestId));
        Event(() => BgcCompleted,      x => x.CorrelateById(c => c.Message.RequestId));

        Initially(
            When(RequestSubmitted)
                .Then(ctx =>
                {
                    ctx.Instance.CitizenFiscalCode = ctx.Data.CitizenFiscalCode;
                    ctx.Instance.StartedAtUtc = DateTime.UtcNow;
                })
                .TransitionTo(Submitted)
                // kick off first back-office step (document verification)
                .Publish(ctx => new /* command to verifier */ BenefitRequestSubmitted(
                    ctx.Instance.CorrelationId, ctx.Instance.CitizenFiscalCode))
        );

        During(Submitted,
            When(DocsVerified)
                .Then(ctx =>
                {
                    ctx.Instance.DocsOk = ctx.Data.Passed;
                    ctx.Instance.LastNotes = ctx.Data.Notes;
                })
                .IfElse(ctx => ctx.Data.Passed,
                    thenBinder => thenBinder.TransitionTo(Verifying)
                        // request background check only if docs ok
                        .Publish(ctx => new /* command to background-check svc */ DocumentsVerified(
                            ctx.Instance.CorrelationId, passed: true)),
                    elseBinder => elseBinder.Finalize().Publish(ctx =>
                        new RequestRejected(ctx.Instance.CorrelationId, "Document verification failed")))
        );

        During(Verifying,
            When(BgcCompleted)
                .Then(ctx =>
                {
                    ctx.Instance.BackgroundOk = ctx.Data.Passed;
                    ctx.Instance.LastNotes = ctx.Data.Notes;
                })
                .IfElse(ctx => ctx.Data.Passed && ctx.Instance.DocsOk == true,
                    thenBinder => thenBinder.TransitionTo(Completed).Publish(ctx =>
                        new RequestApproved(ctx.Instance.CorrelationId)),
                    elseBinder => elseBinder.Finalize().Publish(ctx =>
                        new RequestRejected(ctx.Instance.CorrelationId, "Background check failed")))
        );

        // When saga reaches Completed (approved) or gets Finalized (rejected), it’s removed from storage:
        SetCompletedWhenFinalized();
    }
}
```

### EF Core persistence & MassTransit config
```csharp
using MassTransit;
using Microsoft.EntityFrameworkCore;

public class BenefitSagaDbContext : SagaDbContext
{
    public BenefitSagaDbContext(DbContextOptions options) : base(options) { }

    protected override IEnumerable<ISagaClassMap> Configurations
        => new[] { new BenefitRequestStateMap() };
}

public class BenefitRequestStateMap : SagaClassMap<BenefitRequestState>
{
    protected override void Configure(EntityTypeBuilder<BenefitRequestState> entity, ModelBuilder model)
    {
        entity.Property(x => x.CurrentState);
        entity.Property(x => x.CitizenFiscalCode);
        entity.Property(x => x.DocsOk);
        entity.Property(x => x.BackgroundOk);
        entity.Property(x => x.LastNotes);
        entity.Property(x => x.StartedAtUtc);
    }
}

builder.Services.AddDbContext<BenefitSagaDbContext>(opt =>
    opt.UseSqlServer(builder.Configuration.GetConnectionString("SagaDb")));

builder.Services.AddMassTransit(x =>
{
    x.AddSagaStateMachine<BenefitRequestStateMachine, BenefitRequestState>()
     .EntityFrameworkRepository(r =>
     {
         r.ConcurrencyMode = ConcurrencyMode.Pessimistic;
         r.AddDbContext<DbContext, BenefitSagaDbContext>((_, cfg) => { /* configured above */ });
     });

    x.UsingRabbitMq((ctx, cfg) =>
    {
        cfg.ConfigureEndpoints(ctx);
    });
});
```

### Kicking off the workflow
Anywhere in your system (like an API endpoint), publish the initial event:

```csharp
[HttpPost("requests")]
public async Task<IActionResult> Submit([FromServices] IBus bus, [FromBody] string fiscalCode)
{
    var id = Guid.NewGuid();
    await bus.Publish(new BenefitRequestSubmitted(id, fiscalCode));
    return Accepted(new { requestId = id });
}
```

## Where MassTransit Shines
- **Microservices architectures**: where decoupling is essential.
- **High-throughput systems**: thanks to message batching, retries, and concurrency control.
- **Event-driven applications**: publish/subscribe patterns for real-time updates.
- **Legacy modernization**: gradually replacing point-to-point integrations with robust messaging.

## Conclusion
MassTransit allows .NET teams to construct resilient, scalable, and decoupled systems while staying above the level of low-level messaging details. 
Teams do not need to know anything about queues, exchanges, and retry loops, and can focus on creating business value. 
If your system is constantly threatened by tight coupling, message loss, or integration spaghetti code, you will want to check out MassTransit. 
With some really simple configuration, you could be taking your architecture to the next level and into the event-driven world.
