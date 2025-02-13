# Mastering CQRS in .NET: A Practical Guide
**Command Query Responsibility Segregation (CQRS)** is a pattern that is commonly encountered while building applications that are easy to maintain and readily scalable, and it is a pattern that we often deal with in application development and maintenance.
It is a design paradigm that distinguishes between the write and read features of an application, such as making the application perform better, readability of the code, and providing provisions for facilitating complicated business rules as needed.
We will explore CQRS ideas in this article, as well as how to apply them in practical examples using.NET.

## Understanding the Basics of CQRS
CQRS is a basic principle when commands (actions responsible for changing the state of the system) and queries (actions responsible for fetching data without changing the state) don't share the same model. Such separation permits optimizing each path for its intended purpose.
Assume that you're building a product catalog system. The logic for adding a product (a command) can differ quite a lot to retrieving the details of a product (a query).
CQRS allows one to take care of these constraints independently, hence, making your application much easier to scale and maintain.

## Why Use CQRS?
The appeal of CQRS lies in the clarity and flexibility it introduces. 
By splitting responsibilities, you can:

- Optimize the query side for performance by using read replicas or denormalized views.
- Scale the write side independently if it has high traffic.
- Simplify your domain logic by focusing on one responsibility at a time.

But CQRS is not for every project. While it shines in systems with complex business rules or high scalability needs, it might be overkill for simple CRUD applications.

## Designing a CQRS System
Imagine a large-scale event management system that processes events in real time. These events might represent system telemetry, user activity, or log data from various services. The system needs to:

- Write events at a very high frequency to ensure no data is lost, even under heavy load.
- Retrieve historical event data efficiently for reporting, analytics, or troubleshooting.

In such scenarios, using a single model for both write and read operations can lead to bottlenecks and overly complex code. CQRS allows you to decouple these concerns, optimizing for both scenarios independently.

### Defining the Models
Let’s explore how you can define separate models for commands and queries in a CQRS system, using a .NET implementation as an example.

### Command Model
Commands are used to perform actions that modify the state of the system. They encapsulate all the data required for a specific action and are handled by a command handler. Here's how you might define a command to add an event:

```csharp
public class AddEventCommand
{
    public Guid EventId { get; set; }
    public string EventName { get; set; }
    public DateTime EventDate { get; set; }
}
```

A command handler processes the command and applies the necessary changes to the system:

```csharp
public class AddEventCommandHandler
{
    private readonly IEventRepository _repository;

    public AddEventCommandHandler(IEventRepository repository)
    {
        _repository = repository;
    }

    public async Task Handle(AddEventCommand command)
    {
        var newEvent = new Event
        {
            Id = command.EventId,
            Name = command.EventName,
            Date = command.EventDate
        };

        await _repository.AddEventAsync(newEvent);
    }
}
```

### Query Model
Queries are used to fetch data and should not alter the state of the system. Here's an example query to retrieve event details:

```csharp
public class GetEventDetailsQuery
{
    public Guid EventId { get; set; }
}
```

A query handler processes the query and retrieves the requested data:

```csharp
public class GetEventDetailsQueryHandler
{
    private readonly IReadOnlyEventRepository _repository;

    public GetEventDetailsQueryHandler(IReadOnlyEventRepository repository)
    {
        _repository = repository;
    }

    public async Task<EventDetailsDto> Handle(GetEventDetailsQuery query)
    {
        var eventDetails = await _repository.GetEventByIdAsync(query.EventId);
        return new EventDetailsDto
        {
            EventId = eventDetails.Id,
            EventName = eventDetails.Name,
            EventDate = eventDetails.Date
        };
    }
}
```

### Example Repository Interfaces
To support this separation of concerns, you can define different repository interfaces for commands and queries:

```csharp
// Command Repository
public interface IEventRepository
{
    Task AddEventAsync(Event event);
    // Other write operations
}

// Query Repository
public interface IReadOnlyEventRepository
{
    Task<Event> GetEventByIdAsync(Guid eventId);
    // Other read operations
}
```

## Integrating CQRS Handlers in ASP.NET Core
In an ASP.NET Core application, the CQRS handlers can be exposed through controllers:

```csharp
[ApiController]
[Route("api/events")]
public class EventsController : ControllerBase
{
    private readonly AddEventCommandHandler _addEventHandler;
    private readonly GetEventDetailsQueryHandler _getEventHandler;

    public EventsController(
        AddEventCommandHandler addEventHandler,
        GetEventDetailsQueryHandler getEventHandler)
    {
        _addEventHandler = addEventHandler;
        _getEventHandler = getEventHandler;
    }

    [HttpPost]
    public async Task<IActionResult> AddEvent([FromBody] AddEventCommand command)
    {
        await _addEventHandler.Handle(command);
        return Ok("Event added successfully.");
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetEventDetails(Guid id)
    {
        var query = new GetEventDetailsQuery { EventId = id };
        var result = await _getEventHandler.Handle(query);

        return result != null ? Ok(result) : NotFound("Event not found.");
    }
}
```

You need to register each handler and its dependencies in the `Program.cs` or `Startup.cs` file:

```csharp
var builder = WebApplication.CreateBuilder(args);

// Register dependencies
builder.Services.AddScoped<AddEventCommandHandler>();
builder.Services.AddScoped<GetEventDetailsQueryHandler>();

// Register repositories
builder.Services.AddScoped<IEventRepository, EventRepository>();
builder.Services.AddScoped<IReadOnlyEventRepository, ReadOnlyEventRepository>();

var app = builder.Build();
app.MapControllers();
app.Run();
```

## Enhancing with MediatR
For better decoupling and maintainability, you can integrate `MediatR`. This library abstracts the interaction between controllers and handlers.

### Refactoring with MediatR
MediatR automatically registers handlers if they are located in the same assembly as the startup project. Ensure that your AddEventCommandHandler and GetEventDetailsQueryHandler implement the appropriate MediatR interfaces:

**Command handler:**

```csharp
using MediatR;

public class AddEventCommandHandler : IRequestHandler<AddEventCommand>
{
    private readonly IEventRepository _repository;

    public AddEventCommandHandler(IEventRepository repository)
    {
        _repository = repository;
    }

    public async Task<Unit> Handle(AddEventCommand command, CancellationToken cancellationToken)
    {
        var newEvent = new Event
        {
            Id = command.EventId,
            Name = command.EventName,
            Date = command.EventDate
        };

        await _repository.AddEventAsync(newEvent);
        return Unit.Value;
    }
}
```

**Query handler:**

```csharp
using MediatR;

public class GetEventDetailsQueryHandler : IRequestHandler<GetEventDetailsQuery, EventDetailsDto>
{
    private readonly IReadOnlyEventRepository _repository;

    public GetEventDetailsQueryHandler(IReadOnlyEventRepository repository)
    {
        _repository = repository;
    }

    public async Task<EventDetailsDto> Handle(GetEventDetailsQuery query, CancellationToken cancellationToken)
    {
        var eventDetails = await _repository.GetEventByIdAsync(query.EventId);
        return new EventDetailsDto
        {
            EventId = eventDetails.Id,
            EventName = eventDetails.Name,
            EventDate = eventDetails.Date
        };
    }
}
```

In the controller, use the mediator to send commands and queries:

```csharp
using MediatR;
using Microsoft.AspNetCore.Mvc;

[ApiController]
[Route("api/events")]
public class EventsController : ControllerBase
{
    private readonly IMediator _mediator;

    public EventsController(IMediator mediator)
    {
        _mediator = mediator;
    }

    [HttpPost]
    public async Task<IActionResult> AddEvent([FromBody] AddEventCommand command)
    {
        await _mediator.Send(command);
        return Ok("Event added successfully.");
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetEventDetails(Guid id)
    {
        var query = new GetEventDetailsQuery { EventId = id };
        var result = await _mediator.Send(query);

        return result != null ? Ok(result) : NotFound("Event not found.");
    }
}
```

You need to register MediatR:

```csharp
using MediatR;
using System.Reflection;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddMediatR(Assembly.GetExecutingAssembly());
builder.Services.AddControllers();

var app = builder.Build();
app.MapControllers();
app.Run();

```

## Conclusion
CQRS offers opportunities to enhance the handling of complex business requirements. By separating commands and queries, you optimize each side of the system independently. This approach is especially beneficial for systems where scaling and a clean domain logic are of the utmost importance.
Consider moving towards event sourcing integrated with CQRS to store a complete history of all changes made, allowing greater flexibility and traceability.
