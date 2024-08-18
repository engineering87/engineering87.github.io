## Harnessing the Power of Gateway Aggregation

As we previously mentioned as the most common mistake in the design of microservices architectures is to create a 𝗰𝗵𝗮𝗶𝗻 𝗼𝗳 𝗱𝗲𝗽𝗲𝗻𝗱𝗲𝗻𝗰𝗶𝗲𝘀 between different services.
But how do we behave in case a client may have to make multiple calls to various backend services? In this case, the application relies on many services to perform a task and must expend resources on each request.
The 𝗚𝗮𝘁𝗲𝘄𝗮𝘆 𝗔𝗴𝗴𝗿𝗲𝗴𝗮𝘁𝗶𝗼𝗻 pattern reduce chattiness between the client and the services. In this pattern, a central gateway receives calls from the client and dispatches them to individual services. It then aggregates the results by sending a single response to the client.
