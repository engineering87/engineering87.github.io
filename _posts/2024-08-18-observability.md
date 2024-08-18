## Elevating Microservices with Observability

One of the fundamental aspects in any system is the 𝗼𝗯𝘀𝗲𝗿𝘃𝗮𝗯𝗶𝗹𝗶𝘁𝘆. A system is said to be observable if the current state can be estimated using only the information from outputs. But how do we make a microservices architecture observable?
Generally, specific interfaces are added to monitor the system nodes, implementing global monitoring in real time. It is also essential to add logic to order the different events in a 𝗰𝗮𝘂𝘀𝗮𝗹 𝗼𝗿𝗱𝗲𝗿𝗶𝗻𝗴, for example by adding a unique identifier in each first invocation of a service and then passing it to the entire chain of calls to the different services.
This will allow us to make inference on the state of the system and to aggregate the logs by events, punctually analyzing the call chain.
