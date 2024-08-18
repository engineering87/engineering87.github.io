## Safeguarding Microservices: The Power of Circuit Breaker Patterns

Except for the front-end communications between the client and the first level of microservices, it’s recommended to use 𝗮𝘀𝘆𝗻𝗰𝗵𝗿𝗼𝗻𝗼𝘂𝘀 communication across the internal microservices.
In case of non-transient errors, a retry scheme may not be sufficient and is therefore preferable a fails fast paradigm. The 𝗖𝗶𝗿𝗰𝘂𝗶𝘁 𝗕𝗿𝗲𝗮𝗸𝗲𝗿 scheme prevents an application from performing an operation that has minimal chances of succeeding.
This pattern allows to increase the 𝗿𝗲𝘀𝗶𝗹𝗶𝗲𝗻𝗰𝗲 of the system avoiding failure propagation.

