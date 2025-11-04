# Benchmarking in .NET: Measuring What Really Matters
Issues with performance in code rarely arise from intentionally bad behavior, instead, they're usually based on **assumptions**. 
Developers tend to believe they know what's fast and what's not, but modern .NET runtimes can be too complex to use intuition alone. 
JIT optimizations, memory pressure, and CPU caches can lead to vastly different outcomes than you thought would occur. 
Without measurement, it's impossible to know where time or memory was actually spent. 

**BenchmarkDotNet** solves this problem. 
It's a straightforward, yet extremely precise framework that enables developers to measure execution time and memory consumption of small sections of .NET code reliably and unstated way that is statistically reliable. 
BenchmarkDotNet takes the noise and adjudication away from measuring performance, assuring you trustable, repeatable results.

## Why Benchmarking Is Essential
In most projects, performance issues appear late, usually when the system scales or users increase.
Running benchmarks early in development helps you:

- Detect regressions after refactoring
- Choose between two implementations based on real data
- Understand how algorithms or libraries behave as input grows
- Build realistic expectations about performance and scalability
  
Benchmarking isn’t only for low-level optimization but it’s a **decision making tool**.

## Introducing BenchmarkDotNet
[**BenchmarkDotNet**](https://benchmarkdotnet.org/) is available as a standard NuGet package:

```bash
dotnet add package BenchmarkDotNet
```

Once added, you can define small benchmark classes decorated with attributes that describe what to measure and how.
The library handles warmup runs, multiple iterations, and reports average performance, deviation, and allocations.
It’s the same tool used by the .NET runtime team, which makes it a solid foundation for your own analysis.

## A Practical Example: Sorting Algorithms
Let’s benchmark two sorting approaches to see BenchmarkDotNet in action:

- `Array.Sort()`: the optimized built-in algorithm used in .NET
- A simple bubble sort: easy to understand but inefficient

```csharp
using BenchmarkDotNet.Attributes;
using BenchmarkDotNet.Columns;
using BenchmarkDotNet.Configs;
using BenchmarkDotNet.Jobs;
using BenchmarkDotNet.Order;
using BenchmarkDotNet.Running;
using System.Linq;

public class Config : ManualConfig
{
    public Config()
    {
        AddJob(Job
            .Default
            .WithWarmupCount(3)
            .WithIterationCount(8)
            .WithLaunchCount(1));
        AddColumn(RankColumn.Png);                 // ranking badge
        WithOrderer(new DefaultOrderer(SummaryOrderPolicy.FastestToSlowest));
    }
}

[MemoryDiagnoser]
[Config(typeof(Config))]
public class SortingBenchmarks
{
    private int[] data;

    [Params(1_000, 10_000, 100_000)] // reduce 100_000 if runs take too long
    public int Size;

    [GlobalSetup]
    public void Setup()
    {
        var random = new Random(42);
        data = Enumerable.Range(0, Size).Select(_ => random.Next()).ToArray();
    }

    [Benchmark(Baseline = true)]
    public int[] ArraySort()
    {
        var copy = (int[])data.Clone();
        Array.Sort(copy);
        return copy;
    }

    [Benchmark]
    public int[] BubbleSort()
    {
        var copy = (int[])data.Clone();
        for (int i = 0; i < copy.Length - 1; i++)
            for (int j = 0; j < copy.Length - i - 1; j++)
                if (copy[j] > copy[j + 1])
                    (copy[j], copy[j + 1]) = (copy[j + 1], copy[j]);
        return copy;
    }
}

public class Program
{
    public static void Main() => BenchmarkRunner.Run<SortingBenchmarks>();
}
```

Run it in **Release** mode to get accurate results:

```bash
dotnet run -c Release
```

## Interpreting the Results
BenchmarkDotNet will execute both methods under controlled conditions and output a table like this:

| Method     | Size   | Mean (ms) | Error (ms) | StdDev (ms) | Allocated |
|----------- |------- |----------:|-----------:|------------:|----------:|
| ArraySort  | 1,000  |     0.100 |      0.001 |       0.001 |   ~3.9 KB |
| BubbleSort | 1,000  |     3.000 |      0.060 |       0.045 |   ~3.9 KB |
| ArraySort  | 10,000 |     1.329 |      0.013 |       0.011 |  ~39.1 KB |
| BubbleSort | 10,000 |   300.000 |      6.000 |       4.500 |  ~39.1 KB |
| ArraySort  |100,000 |    16.610 |      0.166 |       0.133 | ~390.6 KB |
| BubbleSort |100,000 | 30000.000 |    600.000 |     450.000 | ~390.6 KB |

These results are consistent with the theoretical complexity of each algorithm:
- **Array.Sort()** operates in roughly **O(n log n)** time, so its cost scales moderately as input size increases
- **BubbleSort** is **O(n²)**, so it grows exponentially slower and quickly becomes impractical even for mid-sized arrays

Memory allocations are identical because both methods clone the input array before sorting.
This ability to measure, compare, and reason about performance with hard numbers is what makes BenchmarkDotNet so powerful for .NET developers and architects.
BenchmarkDotNet quantifies that gap with precise numbers. It’s not an assumption or an estimate, **it’s a reproducible measurement**.

## Expanding the Analysis
BenchmarkDotNet can do much more than measure time.
By adding attributes like `[MemoryDiagnoser]` or `[Params]`, you can:

- Track memory allocations and garbage collections
- Vary input sizes to observe scalability
- Compare multiple methods across different runtimes
- Export results as Markdown, CSV, or JSON for reporting or CI integration

For larger projects, you can use the `BenchmarkSwitcher` API to run multiple benchmark classes in the same session.

## Integrating Benchmarks into the Development Process
Benchmarks are most useful when they’re not treated as one-off experiments.
Running them occasionally can be insightful, but the real value comes when you make benchmarking part of your regular development and delivery workflow.
In most teams, performance tends to drift over time. A new feature might introduce an extra allocation, for example a refactor might change an algorithm’s complexity, a library update might slow things down under load.
These changes are rarely visible through functional tests alone. 
Integrating benchmarks ensures that performance regressions are detected as early as functional bugs.

1. **Run Benchmarks Alongside Unit Tests**
   
The first step is to treat benchmarks like any other form of validation.
You can keep a Benchmarks project inside your solution, right next to your test projects. Developers can run it locally when they modify critical code paths, for example, data serialization, parsing, caching, or algorithms.
BenchmarkDotNet projects build and run just like unit tests, but instead of pass/fail, they output numeric results.
A good practice is to check those results into version control, so you have a historical view of how performance evolves.

2. **Automate Benchmark Runs in CI/CD**
   
Once the local workflow is stable, automate it.
You can configure your CI pipeline (like GitHub Actions, Azure DevOps, or Jenkins) to:

- Run benchmarks in Release mode as part of nightly or pre-release builds
- Export results in JSON or CSV format using BenchmarkDotNet’s built-in exporters
- Compare current results with previous builds to detect performance regressions
- Fail the build if a key benchmark exceeds a defined threshold

This transforms performance testing into a continuous quality signal, rather than a last-minute audit before release.

3. **Establish Baselines**
   
Benchmarks are meaningful only when compared against something.
Define a baseline version of your application, perhaps the latest stable release or a known good commit, and store its benchmark results.
Subsequent runs can be compared against that baseline to show whether a change improved or degraded performance.
BenchmarkDotNet supports this directly through the `[Baseline]` attribute and relative comparison columns, but you can also manage it externally with exported data.

4. **Monitor Performance Trends Over Time**
   
Beyond catching regressions, benchmarks can provide trend visibility.
By tracking the same set of benchmarks across releases, you can observe how the system’s performance evolves, which areas are improving, which are degrading, and how architectural decisions impact real performance.
You can even use tools like Power BI, Grafana, or Excel to visualize historical data exported from BenchmarkDotNet runs.
This makes it easier to justify optimization work and demonstrate progress to non technical stakeholders.

5. **Keep Benchmarks Targeted and Maintainable**
   
Benchmarks should be small, isolated, and purposeful.
Focus on code paths where performance matters, like loops, serialization, parsing, or algorithmic components.
Avoid full end-to-end scenarios that mix CPU and I/O, which are better suited for load testing tools like NBomber or k6.
Keep each benchmark reproducible and independent. The goal is to measure computation, not environment noise.

6. **Educate the Team**
   
Finally, share the results with the team.
BenchmarkDotNet produces readable Markdown reports that can be published automatically in your documentation or wiki.
Use them during sprint reviews or retrospectives to highlight improvements or issues.
Encouraging developers to interpret and discuss these metrics builds a shared understanding of performance, helping teams write faster and more predictable code.

## Best Practices
- Always benchmark in Release mode. Debug builds disable compiler optimizations
- Avoid I/O operations in benchmarks focus on CPU and memory behavior
- Keep benchmarks deterministic; avoid randomness or shared state between runs
- Run benchmarks on a 'quiet' machine to reduce external interference

## Conclusion
BenchmarkDotNet gives developers a reliable, repeatable way to see how .NET code actually performs.
It replaces assumptions with data, and guesses with measurement.
That means few surprises about performance in production and more faith in architecture decisions.
You will often be surprised by the results, which is exactly why it is worthwhile to benchmark.
