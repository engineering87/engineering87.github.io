# The Pragmatic Power of Modular Monoliths in .NET
A modular monolith provides a hybrid architecture, keeping the single deployability aspect of a traditional monolith while enforcing solid module boundaries like microservices. 
Technically, an application is ultimately a single deployable unit, but internally the application is made up of distinct encapsulated components, each providing a distinct domain or business functionality.

## What Is a Modular Monolith?
The modular monolith is a **compromise in architectural form**: like traditional monolithic applications, it is simple, but it also imposes simple, clear module boundaries, similar to microservices. 
In this case, the software will be deployed as a single software unit, but it will have clear module boundaries with well encapsulated components, each encapsulating a domain or business function.

## Why Choose a Modular Monolith?
Often referred to as the **Goldilocks architecture**, it provides *just right* flexibility and simplicity. 
You miss the operational overhead of microservices (service orchestration, network latency, etc.) while pumping up maintainability and scalability over that of tightly coupled monolith.
Other compelling advantages:
- Simplified deployment and operations
- Easier code refactoring and ownership boundaries
- A natural evolution path toward microservices if needed
  
## Core Architecture Principles
1. **Encapsulation through Modules**
Every module should encapsulate its own domain logic, data access, and potentially its own database context.
Modules only interact with one another via abstractions, any cross-module leakage will manage that effectively to ensure low coupling and high cohesion.

2. **Vertical Slices + Domain-Driven Design**
Structuring your code (Vertical Slice Architecture) around features makes implementation closer to its business use cases.
For our Clean or Onion Architecture layers, domain-centred architecture can also help establish clearer dependencies and encourage enforced isolation.

3. **Shared vs Isolated Data**
Even though you might have multiple modules sharing a database, architectural discipline should prevent ways to gain unauthorized access.
Each module should take care to only interact with its aggregates or its schemas, this may be enforced through internal visibility or architectural boundaries.

## Hands-On Example in C#
In a modular monolith, each module is self-contained and exposes only a public API (interfaces, commands, events) to other modules, while internal classes remain inaccessible.
Imagine a .NET solution structured like this:

```csharp
MyApp.Web               // Entry point
MyApp.Modules.Orders    // Orders domain
MyApp.Modules.Inventory // Inventory domain
MyApp.SharedKernel      // Shared contracts
MyApp.Modules.Orders.Tests
MyApp.Modules.Inventory.Tests
```

### Inventory Module:
```csharp
// SharedKernel/Contracts/IInventoryService.cs
public interface IInventoryService
{
    bool AdjustStock(int productId, int quantity);
}

internal class InventoryService : IInventoryService
{
    public bool AdjustStock(int productId, int quantity) { ... }
}
```

### Public API registration:
Modules expose **public interfaces** for cross-module communication. 

```csharp
public static IServiceCollection AddInventoryModule(this IServiceCollection services)
{
    services.AddScoped<IInventoryService, InventoryService>();
    return services;
}
```

For example, OrderService could depend on an `IInventoryService` defined in a shared contract promoting decoupling.
Use the internal modifier to enforce module boundaries. Some frameworks, like `Ardalis.Modulith` (https://github.com/ardalis/modulith), even automate boundary checking via tests.

Usage in Orders module:

```csharp
public class OrderService
{
    private readonly IInventoryService _inventory;
    public OrderService(IInventoryService inventory) => _inventory = inventory;

    public bool PlaceOrder(int productId, int qty) =>
        _inventory.AdjustStock(productId, -qty);
}
```

The key is that modules never depend on each other’s internal classes only on public contracts. 
This keeps boundaries clear, reduces coupling, and makes future refactoring or extraction into microservices easier.

## When to Favor a Modular Monolith?
This style shines when:
- You operate with small to mid-sized teams
- Your delivery velocity matters more than complex scalability
- You later want the flexibility to extract modules as independent microservices without rewriting everything

## Trade-offs to Consider
- Despite logical segmentation, failure in one module can still bring down the whole application
- Scaling remains vertical, unless you extract modules later
- Discipline required: without review, modules can devolve into a bad tangled codebase

# Conclusion
Modular monoliths are a clever compromise. They're easier to deal with than real distributed systems, while yielding structure, maintainability, and testability. 
Modular monoliths are also complementary with .NET tooling and provide a future migration path into microservices if that is the long term goal.
