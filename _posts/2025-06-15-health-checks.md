# Health Checks in Microservices with C#: Readiness, Liveness, and Startup Probes
In today’s microservices architectures, particularly those that run in Kubernetes, **health checks** for applications are essential for reliability, observability, and straightforward scalability. 
Kubernetes offers **liveness**, **readiness**, and **startup probes**, which help Kubernetes understand and manage the life-cycle of application containers.
This article will examine what the probes are, what they mean, how they are intended to be used, and how to use them effectively with C# applications using ASP.NET Core.

## What Are Probes?
In a microservices context, and specifically in a Kubernetes environment, health probes are ways for the platform to track the status of each container and take relevant action when something goes wrong. 
Health probes help ensure high availability and are a key part of managing the orchestration of services because they deliver information to Kubernetes about your application's internal state.
There are three types of probes: **liveness probe**, **readiness probe**, and **startup probe**.

### Liveness Probe
The liveness probe acts to determine if your application is still active. It gives a simple answer to the question: *is the application running, or is it deadlocked or stuck?*
If the liveness probe continues to fail, Kubernetes will treat the container as broken and will restart it automatically. This is useful in case where the app has stopped processing due to some internal failure, but the process has not crashed. Liveness checks are usually simple and fast, just enough to determine that the core application loop has not gone down.
A properly configured liveness probe will prevent long-running but non-live containers from staying in production, improving overall resilience.

### Readiness Probe
The readiness probe checks if a container is ready to serve requests. The container may be alive (as determined by a liveness probe) but still not ready to serve requests for a variety of reasons such as still initializing, waiting for configuration, or establishing a database connection.
In this event, Kubernetes will drop the Pod from the Service endpoint list until the readiness probe is satisfied again. The container is not restarted, the container is just being held back from serving requests.
This readiness check is especially important during deployments and rolling updates, and restarts to ensure that only containers that are fully ready take on any load.

### Startup Probe
The startup probe is intended for use with applications that take a long time to initialize. The startup probe will run once during startup, and while it is in a state of failure, Kubernetes won't run the liveness or readiness probes.
This is particularly valuable for legacy systems or services that have long bootstrapping processes. The startup probe avoids a case where the liveness probe can prematurely mark the probe as failed before the application is even ready and cause the container to restart.
Once the startup probe has skipped, Kubernetes will start running the regular readiness and liveness probes.

## Implementing Health Checks in C# with ASP.NET Core
Health check functionality is built into the ASP.NET Core framework and does not require any additional packages.

### Step 1: Add the Health Check Middleware
In your `Program.cs` or `Startup.cs`, register health checks:

```csharp
builder.Services.AddHealthChecks()
    .AddCheck<DatabaseHealthCheck>("database_check");
```
You can create custom checks by implementing `IHealthCheck` interface which contains a single `CheckHealthAsync` method:

```csharp
public class DatabaseHealthCheck : IHealthCheck
{
  private readonly IConfiguration _config;

  public DatabaseHealthCheck(IConfiguration config)
  {    
    _config = config;
  }

  public async Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
  {
    var connectionString = _config["Data:DefaultConnection"];

    using var connection = new SqlConnection(connectionString);

    try
    {
      await connection.OpenAsync(cancellationToken);

      return HealthCheckResult.Healthy();
    }
    catch (Exception ex)
    {
      return HealthCheckResult.Unhealthy(ex); 
    }                   
  }
}
```

## Step 2: Configure Endpoints
Map the health check endpoints in `Program.cs`:

```csharp
app.MapHealthChecks("/health/live", new HealthCheckOptions
{
    Predicate = (check) => check.Name == "self"
});

app.MapHealthChecks("/health/ready", new HealthCheckOptions
{
    Predicate = (check) => check.Name == "database"
});
```

## Creating Composite Health Checks 
In certain cases, it's useful to aggregate multiple health checks under a single, composite health check. This is particularly helpful when you want to expose a higher-level abstraction like StorageHealth, which internally evaluates the health of, say, a database, a blob storage, and a file system.
Here’s how you can implement a composite health check by composing multiple IHealthCheck instances:

```csharp
public class StorageHealthCheck : IHealthCheck
{
  private readonly IEnumerable<IHealthCheck> _checks;  

  public StorageHealthCheck(IEnumerable<IHealthCheck> checks) 
  {
    _checks = checks;
  }

  public async Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
  {
    var results = await Task.WhenAll(_checks.Select(c => 
      c.CheckHealthAsync(context, cancellationToken)));

    if(results.Any(r => r.Status == HealthStatus.Unhealthy))
    {
        return HealthCheckResult.Unhealthy();
    }

    return HealthCheckResult.Healthy();
  }
}
```

You can register it like this:

```csharp
builder.Services.AddHealthChecks()
    .AddCheck<StorageHealthCheck>("storage_health");
```

## When to Use a Composite Class
- You need custom aggregation logic.
- You want to encapsulate a domain-specific grouping, not just tag-based.
- You want to reuse the group check across multiple probes or services.

## Configure Probes in Kubernetes
Example configuration for Kubernetes `deployment.yaml`:

```yaml
livenessProbe:
  httpGet:
    path: /health/live
    port: 80
  initialDelaySeconds: 10
  periodSeconds: 10
  timeoutSeconds: 5
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /health/ready
    port: 80
  initialDelaySeconds: 5
  periodSeconds: 10
  timeoutSeconds: 5
  failureThreshold: 3

startupProbe:
  httpGet:
    path: /health/live
    port: 80
  initialDelaySeconds: 0
  periodSeconds: 10
  failureThreshold: 30
```

### Explanation:
- `initialDelaySeconds`: Time to wait after container starts before probing.
- `periodSeconds`: How often to perform the check.
- `failureThreshold`: Number of failed checks before taking action.
- `timeoutSeconds`: Timeout for each probe request.

## Best Practices
- Use `/health/ready` to include checks for dependencies like databases, caches, etc.
- Use `/health/live` to ensure your app is running, even if not fully operational.
- Separate concerns clearly: make your liveness probe simple and fast.
- Use `startupProbe` for apps that need extra time to initialize.
- Ensure health check endpoints are lightweight and fast to avoid resource strain.

## Conclusion
Health probes are a vital part for robust microservices. By utilizing ASP.NET Core's health check system and Kubernetes probes in conjunction, you'll have the ability to see that your services are reliably behaving and scaling appropriately. 
When you correctly implement the **liveness**, **readiness**, and **startup probes**, you can reduce downtime and increase observability.
