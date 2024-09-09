## Avoid microservices chain of depedencies

One of the most common mistake in the design of microservices architectures is to create a 𝗰𝗵𝗮𝗶𝗻 𝗼𝗳 𝗱𝗲𝗽𝗲𝗻𝗱𝗲𝗻𝗰𝗶𝗲𝘀 between different services. These chains of inter-service dependencies dramatically decrease the availability of the entire system, this is because a fault of a service will cause fault of the entire chain.
To avoid these situations it is strongly recommended to use the 𝗕𝘂𝗹𝗸𝗵𝗲𝗮𝗱 pattern. It's better to 𝗱𝗲𝗰𝗼𝘂𝗽𝗹𝗲 dependencies between services, isolating the critical element (with high dependency) of the architecture into a pool for service.
You should use this pattern to prevent the application from cascading failure and increase the resilience of the entire system.
