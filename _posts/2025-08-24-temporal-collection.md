# TemporalCollections: High-Performance, Thread-Safe Temporal Data Structures for .NET

**TemporalCollections** is a personal open-source project I created to address a recurring challenge I encountered while building distributed systems: the lack of ready-to-use, time-aware data structures that are both thread-safe and optimized for time-based querying and pruning.
It’s a **.NET library** that extends familiar collections, queues, stacks, sets, dictionaries, and more with native temporal semantics. 
Every item is automatically timestamped on insertion, enabling:
- Fast time-range queries
- Deterministic aging and pruning
- Accurate temporal analytics
  
All of this comes with a unified query API and built-in thread-safety, making it easy to reason about data in time-sensitive applications.
TemporalCollections is ideal for scenarios like event streaming, sliding-window analytics, telemetry buffers, rate limiting, session tracking, and caches with expiry any situation where time is a first-class concern.

👉 [GitHub repository](https://github.com/engineering87/TemporalCollections)

## Why Temporal Collections?
Time is a first-class dimension in many systems:
- **Event streams & observability**: ingest items at high throughput and answer questions like “what happened in the last N seconds/minutes?”
- **Sliding-window analytics**: compute rolling aggregates (counts, percentiles) on recent data only.
- **Caches & sessions**: expire stale entries or prune by age.
- **Temporal state tracking**: maintain the evolution of values over time (latest, earliest, before/after a point).

While you could bolt timestamps onto standard collections, you would still need to solve ordering, race-free timestamp assignment, range queries, pruning, and concurrency consistently across multiple data structures. 
TemporalCollections addresses these concerns out-of-the-box with a monotonic timestamp guarantee and a common query surface.

## Core Design Principles
- **Temporal semantics**: items carry precise insertion timestamps.
- **Thread-safety**: operations are safe in multi-threaded environments.
- **Time-based querying**: efficient retrieval by time windows.
- **Efficient cleanup**: prune older items without long global locks.

## Monotonic Timestamp
Temporal collections only make sense if **time** behaves. In practice, though, system clocks don’t always cooperate: multiple calls to `UtcNow` within the same tick can return identical values; NTP can move the clock backwards; and highly concurrent code can interleave operations so tightly that two insertions appear to occur at the same instant. 
If timestamps aren’t strictly ordered, time-window queries become flaky (`GetInRange` may miss or double count items on boundaries) and age-based pruning (`RemoveOlderThan`) isn’t deterministic.
To keep temporal behavior predictable, the library assigns a monotonic timestamp to every insertion: each generated value is guaranteed to be strictly greater than the one before it within the same process. 
If the clock doesn’t advance between two reads, we simply step forward by one tick and move on.

### Deterministic boundary rules
- `GetInRange(from, to)` is inclusive on both ends.
- `RemoveOlderThan(cutoff)` removes `Timestamp < cutoff` (keeps `>= cutoff`).
- `GetBefore(time)` is strictly `<`; `GetAfter(time)` is strictly `>`.
- `GetLatest()` / `GetEarliest()` return extremes or null when empty.

These rules make window math predictable and prevent off-by-one bugs.

### Snapshot semantics
Enumerations return a stable snapshot at call time, preserving determinism under concurrency.

## The Core Abstraction: `TemporalItem<T>`
All collections store `TemporalItem<T>`, a lightweight wrapper that pairs an immutable value with a timestamp (DateTimeOffset) representing the insertion moment. 
Timestamps are strictly increasing even under bursty or concurrent insertions: if UtcNow would produce a non-increasing value (precision limits / clock granularity), the library atomically increments by a tick to maintain order and uniqueness. 
This yields deterministic chronology without races across threads.

## A Unified Temporal Query Surface: `ITimeQueryable<T>`
Every structure implements `ITimeQueryable<T>`, exposing consistent operations:
- `GetInRange(from, to)`: enumerate items in an inclusive time window.
- `RemoveOlderThan(cutoff)`: age/prune items strictly older than cutoff.
- `CountInRange(from, to)`: count items in a window.
- `GetTimeSpan()`: time span covered by the collection (latest−earliest).
- `RemoveRange(from, to)`: delete items in a window.
- `GetLatest()` / `GetEarliest()`: fast access to extremes.
- `GetBefore(time)` / `GetAfter(time)`: query by relative time.
- `CountSince(from)`: rolling counts.
- `GetNearest(time)`: nearest neighbor by timestamp.

This interface makes code collection agnostic, you can prototype with a queue and later swap to a sorted structure or an interval tree without rewriting queries.

## Provided Data Structures
- **TemporalQueue<T>**
  - ✅ Use when you need a thread-safe FIFO queue with time-based retrieval and cleanup.
  - ❌ Avoid if you need priority ordering or random access.

- **TemporalStack<T>**
  - ✅ Use when you want a thread-safe LIFO stack with timestamp tracking and time-range queries.
  - ❌ Avoid if you require fast arbitrary removal or frequent sorting by timestamp.

- **TemporalSet<T>**
  - ✅ Use for unique timestamped items with efficient membership checks and time-based removal.
  - ❌ Avoid if you need ordering or priority queues.

- **TemporalSlidingWindowSet<T>**
  - ✅ Use when you need to automatically retain only recent items within a fixed time window.
  - ❌ Avoid if your window size is highly dynamic or if you need sorted access.

- **TemporalSortedList<T>**
  - ✅ Use for a sorted-by-timestamp collection with efficient binary-search range queries.
  - ❌ Avoid if insertion frequency is very high (O(n) inserts).

- **TemporalPriorityQueue<T>**
  - ✅ Use when you need priority-based ordering with timestamp-aware dequeueing.
  - ❌ Avoid if you only need FIFO/LIFO semantics without priorities.

- **TemporalIntervalTree<T>**
  - ✅ Use for efficient interval overlap queries and session windows.
  - ❌ Avoid if your data are single points rather than intervals.

- **TemporalDictionary<TKey, TValue>**
  - ✅ Use for key-based access combined with global time-range queries.
  - ❌ Avoid if you require a fully ordered view or range queries strictly sorted by timestamp.

- **TemporalCircularBuffer<T>**
  - ✅ Use for a fixed-size ring buffer that overwrites the oldest items.
  - ❌ Avoid if you need unbounded storage or complex queries.

## 🚀 Getting Started with TemporalCollections
This section shows how to install and use **TemporalCollections** in your .NET projects with simple examples.

### Installation
```bash
dotnet add package TemporalCollections
```

### Basic usage
**TemporalQueue<T>**

```csharp
using System;
using System.Linq;
using TemporalCollections.Collections;

var queue = new TemporalQueue<string>();

// Enqueue items (timestamps are assigned automatically)
queue.Enqueue("event-1");
queue.Enqueue("event-2");

// Peek oldest (does not remove)
var oldest = queue.Peek();
Console.WriteLine($"Oldest: {oldest.Value} @ {oldest.Timestamp}");

// Dequeue oldest (removes)
var dequeued = queue.Dequeue();
Console.WriteLine($"Dequeued: {dequeued.Value} @ {dequeued.Timestamp}");

// Query by time range (inclusive)
var from = DateTime.UtcNow.AddMinutes(-5);
var to   = DateTime.UtcNow;
var inRange = queue.GetInRange(from, to);
foreach (var item in inRange)
{
    Console.WriteLine($"In range: {item.Value} @ {item.Timestamp}");
}
```
**TemporalSet<T>**

```csharp
using System;
using TemporalCollections.Collections;

var set = new TemporalSet<int>();

set.Add(1);
set.Add(2);
set.Add(2);

Console.WriteLine(set.Contains(1));

// Remove older than a cutoff
var cutoff = DateTime.UtcNow.AddMinutes(-10);
set.RemoveOlderThan(cutoff);

// Snapshot of all items ordered by timestamp
var items = set.GetItems();
```

**TemporalDictionary<TKey, TValue>**

```csharp
using System;
using System.Linq;
using TemporalCollections.Collections;

var dict = new TemporalDictionary<string, string>();

dict.Add("user:1", "login");
dict.Add("user:2", "logout");
dict.Add("user:1", "refresh");

// Range query across all keys
var from = DateTime.UtcNow.AddMinutes(-1);
var to   = DateTime.UtcNow.AddMinutes(1);
var all = dict.GetInRange(from, to);

// Range query for a specific key
var user1 = dict.GetInRange("user:1", from, to);

// Compute span covered by all events
var span = dict.GetTimeSpan();
Console.WriteLine($"Span: {span}");

// Remove a time window across all keys
dict.RemoveRange(from, to);
```

**TemporalStack<T>**

```csharp
using System;
using System.Linq;
using TemporalCollections.Collections;

var stack = new TemporalStack<string>();

// Push (timestamps assigned automatically, monotonic UTC)
stack.Push("first");
stack.Push("second");

// Peek last pushed (does not remove)
var top = stack.Peek();
Console.WriteLine($"Top: {top.Value} @ {top.Timestamp}");

// Pop last pushed (removes)
var popped = stack.Pop();
Console.WriteLine($"Popped: {popped.Value}");

// Time range query (inclusive)
var from = DateTime.UtcNow.AddMinutes(-5);
var to   = DateTime.UtcNow;
var items = stack.GetInRange(from, to).OrderBy(i => i.Timestamp);

// Remove older than cutoff
var cutoff = DateTime.UtcNow.AddMinutes(-10);
stack.RemoveOlderThan(cutoff);
```

**TemporalSlidingWindowSet<T>**

```csharp
using System;
using System.Linq;
using TemporalCollections.Collections;

var window = TimeSpan.FromMinutes(10);
var swSet = new TemporalSlidingWindowSet<string>(window);

// Add unique items (insertion timestamp recorded)
swSet.Add("A");
swSet.Add("B");

// Periodically expire items older than the window
swSet.RemoveExpired();

// Snapshot (ordered by timestamp)
var snapshot = swSet.GetItems().ToList();

// Query by time range
var from = DateTime.UtcNow.AddMinutes(-5);
var to   = DateTime.UtcNow;
var inRange = swSet.GetInRange(from, to);

// Manual cleanup by cutoff (if needed)
swSet.RemoveOlderThan(DateTime.UtcNow.AddMinutes(-30));
```

**TemporalSortedList<T>**

```csharp
using System;
using System.Linq;
using TemporalCollections.Collections;

var list = new TemporalSortedList<int>();

// Add items (kept sorted by timestamp internally)
list.Add(10);
list.Add(20);
list.Add(30);

// Fast range query via binary search (inclusive)
var from = DateTime.UtcNow.AddSeconds(-30);
var to   = DateTime.UtcNow;
var inRange = list.GetInRange(from, to);

// Before / After helpers
var before = list.GetBefore(DateTime.UtcNow);
var after  = list.GetAfter(DateTime.UtcNow.AddSeconds(-5));

// Housekeeping
list.RemoveOlderThan(DateTime.UtcNow.AddMinutes(-1));
Console.WriteLine($"Span: {list.GetTimeSpan()}");
```

**TemporalPriorityQueue<TPriority, TValue>**

```csharp
using System;
using System.Linq;
using TemporalCollections.Collections;

var pq = new TemporalPriorityQueue<int, string>();

// Enqueue with explicit priority (lower number = higher priority)
pq.Enqueue("high", priority: 1);
pq.Enqueue("low",  priority: 10);

// TryPeek (does not remove)
if (pq.TryPeek(out var next))
{
    Console.WriteLine($"Peek: {next}");
}

// TryDequeue (removes highest-priority; stable by insertion time)
while (pq.TryDequeue(out var val))
{
    Console.WriteLine($"Dequeued: {val}");
}

// Time-based queries are also available
var from = DateTime.UtcNow.AddMinutes(-5);
var to   = DateTime.UtcNow;
var items = pq.GetInRange(from, to);

Console.WriteLine($"Count in range: {pq.CountInRange(from, to)}");
```

**TemporalCircularBuffer<T>**

```csharp
using System;
using System.Linq;
using TemporalCollections.Collections;

// Fixed-capacity ring buffer; overwrites oldest when full
var buf = new TemporalCircularBuffer<string>(capacity: 3);

buf.Add("A");
buf.Add("B");
buf.Add("C");
buf.Add("D"); // Overwrites "A"

// Snapshot (oldest -> newest)
var snapshot = buf.GetSnapshot();
foreach (var it in snapshot)
{
    Console.WriteLine($"{it.Value} @ {it.Timestamp}");
}

// Range queries
var from = DateTime.UtcNow.AddMinutes(-5);
var to   = DateTime.UtcNow;
var inRange = buf.GetInRange(from, to);

// Remove a time window
buf.RemoveRange(from, to);

// Cleanup by cutoff (keeps >= cutoff)
buf.RemoveOlderThan(DateTime.UtcNow.AddMinutes(-1));
```

**TemporalIntervalTree<T>**

```csharp
using System;
using System.Linq;
using TemporalCollections.Collections;

var tree = new TemporalIntervalTree<string>();

var now = DateTime.UtcNow;
tree.Insert(now, now.AddMinutes(10), "session:A");
tree.Insert(now.AddMinutes(5), now.AddMinutes(15), "session:B");

// Overlap query (values only)
var overlapValues = tree.Query(now.AddMinutes(7), now.AddMinutes(12));
// Overlap query (with timestamps = interval starts)
var overlapItems  = tree.GetInRange(now.AddMinutes(7), now.AddMinutes(12));

Console.WriteLine($"Overlaps: {string.Join(", ", overlapValues)}");

// Remove intervals that ended before a cutoff
tree.RemoveOlderThan(now.AddMinutes(9));
```

## Threading Model & Big-O Cheatsheet
All collections are thread-safe. 
Locking granularity and common operations (amortized):

| Collection | Locking | Add/Push | Range Query | RemoveOlderThan |
|---|---|---:|---:|---:|
| TemporalQueue | single lock around a queue snapshot | O(1) | O(n) | O(k) from head |
| TemporalStack | single lock; drain & rebuild for window ops | O(1) | O(n) | O(n) |
| TemporalSet | lock-free dict + per-bucket ops | O(1) avg | O(n) | O(n) |
| TemporalSortedList | single lock; binary search for ranges | O(n) insert | **O(log n + m)** | O(k) |
| TemporalPriorityQueue | single lock; `SortedSet` by (priority,timestamp) | O(log n) | O(n) | O(n) |
| TemporalIntervalTree | single lock; interval overlap pruning | O(log n) avg | **O(log n + m)** | O(n) |
| TemporalDictionary | concurrent dict + per-list lock | O(1) avg | O(n) | O(n) |
| TemporalCircularBuffer | single lock; ring overwrite | O(1) | O(n) | O(n) |

`n` = items, `m` = matches, `k` = removed.

## Benchmark Results
Measured with _BenchmarkDotNet_, the results paint a consistent picture:

- **Insert-heavy pipelines with periodic age-off**  
  **TemporalQueue** and **TemporalCircularBuffer** deliver the lowest median insert times (constant-time appends) and predictable pruning  
  (head-first for the queue, overwrite for the ring).

- **Frequent, wide time-window queries over large datasets**  
  **TemporalSortedList** (binary-search boundaries) and **TemporalIntervalTree** (overlap index) offer the best query latency,  
  at the cost of more expensive inserts—especially for the sorted list.

- **Middle ground**  
  **TemporalSet** and **TemporalSlidingWindowSet** show good insertion behavior and simple maintenance,  
  but range scans are linear compared to indexed structures.

- **Priority-aware processing**  
  **TemporalPriorityQueue** optimizes for priority-based dequeue, so time-range scans and pruning are comparatively slower.

- **Per-key histories + global time queries**  
  **`TemporalDictionary<TKey,TValue>`** is a balanced option when you need per-key histories together with global time queries,  
  while **TemporalStack** mirrors the queue on inserts but pays linear costs on range queries and pruning.

For exact median timings, environment details, and methodology, see the full report:

👉 [Full Benchmark report](https://github.com/engineering87/TemporalCollections/blob/main/docs/benchmarks/benchmarks.md)

## Conclusion
TemporalCollections offers a pragmatic, production-minded approach to managing time-aware data in .NET: you get consistent timestamps, a unified query API, and a portfolio of structures optimized for different temporal needs. 
Start simple with a queue or sliding window set; when your workload demands it, switch to a sorted or interval-based structure, without changing how you query by time. 
