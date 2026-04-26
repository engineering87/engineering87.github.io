# Building a Graph of PDND E-Services

The Piattaforma Digitale Nazionale Dati (PDND) is usually described as an interoperability platform, a catalog of APIs, or a governance framework for data exchange across public administrations. These descriptions are all correct, but they tend to focus on individual services and their compliance rather than on the system that emerges when those services are actually used.

As adoption grows, PDND stops looking like a catalog. It starts behaving like a network. Services are reused across domains, organizations connect through shared data flows, and dependencies accumulate over time. This structure is not explicitly modeled anywhere, yet it becomes one of the most important aspects of the platform.

The project  
https://github.com/engineering87/pdnd-eservices-graph  

was created to make that structure visible.

A concrete instance of this work is available at  
https://www.pdndgraph.it/

## What the project does

At a practical level, the project takes PDND-related data and turns it into a graph. The input can be catalog data, open datasets, or any source that describes organizations, e-services, and their interactions. The output is a representation where these elements are connected and can be explored as a whole.

This is not just a matter of visualization. The transformation changes the way the system can be understood. When services are seen in isolation, it is difficult to reason about their role. When they are placed in a graph, their position and relationships immediately provide context.

The portal makes this visible. Instead of navigating a list, it becomes possible to move through the ecosystem and see how services and organizations relate to each other.

## Why this matters

PDND already provides strong guarantees in terms of standardization and interoperability at the level of individual services. What it does not provide is a view of how those services interact in practice.

As more integrations are activated, certain patterns start to appear. Some services are reused extensively. Some organizations become central because they connect multiple domains. Some parts of the ecosystem become tightly connected, while others remain relatively isolated.

These patterns are not visible in the catalog, but they have real consequences. They influence resilience, evolution, and governance. Understanding them requires a representation that makes relationships explicit.

This is where the graph becomes useful.

## From data to graph

The methodology implemented in the project starts from available data and progressively turns it into structure.

The first step is identifying entities. Organizations and e-services are extracted and normalized so that each one is represented consistently. This is not a trivial task, because the same entity can appear in different forms across datasets. Getting this step right is essential, otherwise the graph will reflect inconsistencies instead of real relationships.

Once entities are defined, relationships are built. If an organization provides an e-service, that becomes a connection. If another organization consumes it, that becomes another connection. At this stage, the graph already represents how services are used across the ecosystem.

The next step introduces an additional layer of interpretation. When an organization consumes one service and provides another, it effectively links them. This allows dependencies between services to be inferred even when they are not explicitly declared.

The resulting graph is not designed in advance. It is reconstructed from observed interactions. For this reason, it reflects how the system actually behaves.

## The graph model

From a formal point of view, the ecosystem can be described as a graph \( G = (V, E) \).

The set of nodes \( V \) includes both organizations and e-services. These can be seen as two distinct subsets within the same graph. Edges represent relationships and are directional. A connection from an organization to a service can represent either provision or consumption.

This naturally leads to a bipartite structure where organizations are connected to services. In this form, the graph answers questions about who provides and who consumes what.

The more interesting structure appears when this graph is transformed. By projecting relationships through organizations, it becomes possible to connect services directly. Two services become related if they are used together, or if one is involved in providing the other.

This produces a network of services where connections reflect actual usage patterns rather than documentation.

## Derived relationships between services

When an organization consumes multiple services, those services become related. This relation can be strengthened by counting how many organizations exhibit the same pattern. The result is a weighted connection that reflects how often services are used together.

When an organization consumes one service and provides another, a directional relationship can be inferred. In this case, one service can be interpreted as depending on the other.

These two mechanisms lead to a graph where services are connected both symmetrically and directionally. The structure that emerges captures how services are composed in practice.

## Structural properties

Once the graph is available, its structure can be analyzed.

Some services appear frequently in many connections. These are widely used and tend to play a central role. Others may not be used as often but sit in positions that connect different parts of the graph. These act as bridges and are often critical for overall connectivity.

The graph can also be examined in terms of its connected components. A large connected component indicates that different parts of the ecosystem are integrated. Smaller components suggest areas that are more isolated.

Clusters also appear naturally. These often correspond to domains or groups of services that are frequently used together. They are not imposed by design but emerge from actual usage.

## Algebraic representation

The graph can also be described in algebraic terms through its adjacency matrix. Each entry of the matrix indicates whether a connection exists between two nodes, and possibly how strong that connection is.

In the bipartite form, the matrix reflects the separation between organizations and services. After projection, it captures relationships between services directly.

This representation allows the use of linear algebra techniques to study the structure of the network. It becomes possible to identify dominant patterns of connectivity and to analyze how influence is distributed across the graph.

## Working with incomplete data

In practice, the graph is built from data that is not complete. The methodology assumes this from the start.

The observed graph can be seen as a partial view of a larger system. Even so, many structural properties remain stable. Nodes that are central tend to remain central even when more data is added. Clusters tend to persist.

This makes the approach usable even in early stages. The graph can be refined over time as more data becomes available, without losing its usefulness.

## From structure to understanding

Representing PDND as a graph changes the way interoperability is approached.

Instead of focusing only on services and their interfaces, it becomes possible to look at how they are connected. The system can be understood in terms of its structure rather than just its components.

This has practical implications. It becomes easier to reason about the impact of changes, to identify critical points, and to understand how different parts of the ecosystem relate to each other.

It also provides a basis for combining structural information with runtime data. The graph describes how services are connected. Observability can describe how they behave. Together, they provide a more complete view.

## The pdndgraph.it portal

The portal  
https://www.pdndgraph.it/  

is a direct application of this work.

It allows the graph to be explored interactively. Relationships that are implicit in the data become visible. It becomes possible to move through the ecosystem and understand how services and organizations are connected.

The portal is not just a visualization tool. It shows what becomes possible once the structure is made explicit.

## Conclusion

As PDND grows, its complexity increases. This is not something that can be avoided, but it can be understood.

The approach implemented in pdnd-eservices-graph shows that by modeling the ecosystem as a graph, it becomes possible to make that complexity visible and to reason about it.

The combination of a clear methodology and a formal model provides a solid foundation for analyzing the system. More importantly, it provides a way to think about interoperability as something that emerges from relationships, not just from individual services.

Once those relationships are visible, they can be understood. And once they are understood, they can be managed.
