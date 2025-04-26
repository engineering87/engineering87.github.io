## Navigating the CAP Theorem: Mastering Trade-offs in Microservices Architecture

### ***short blog***

To design microservices architectures it is essential to have certain knowledge regarding distributed systems engineering. 
One of the too often underestimated aspects is that any distributed system, which by its nature is never fully synchronous, is not safe from network problems and must be designed to be 𝗳𝗮𝘂𝗹𝘁 𝘁𝗼𝗹𝗲𝗿𝗮𝗻𝘁.

Every solution architect should be familiar with 𝗕𝗿𝗲𝘄𝗲𝗿'𝘀 𝘁𝗵𝗲𝗼𝗿𝗲𝗺, more commonly known as 𝗖𝗔𝗣 𝘁𝗵𝗲𝗼𝗿𝗲𝗺. This theorem states that it is impossible for a distributed data store to simultaneously provide more than two out of the following three guarantees: 𝗖𝗼𝗻𝘀𝗶𝘀𝘁𝗲𝗻𝗰𝘆, 𝗔𝘃𝗮𝗶𝗹𝗮𝗯𝗶𝗹𝗶𝘁𝘆 and 𝗣𝗮𝗿𝘁𝗶𝘁𝗶𝗼𝗻 𝘁𝗼𝗹𝗲𝗿𝗮𝗻𝗰𝗲. 

It is therefore necessary to correctly analyze the application context to design solutions with the right trade-off of these properties.
