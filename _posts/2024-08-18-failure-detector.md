## Failure Detection in Distributed Systems

### ***short blog***

𝗙𝗮𝗶𝗹𝘂𝗿𝗲 𝗱𝗲𝘁𝗲𝗰𝘁𝗶𝗼𝗻 is a fundamental building block for ensuring fault tolerance in large scale distributed systems. A 𝗳𝗮𝗶𝗹𝘂𝗿𝗲 𝗱𝗲𝘁𝗲𝗰𝘁𝗼𝗿 is a process that responds to questions asking whether a given process has failed.
The difficulty of making a reliable failure detector is due to the 𝗽𝗮𝗿𝘁𝗶𝗮𝗹𝗹𝘆 𝘀𝘆𝗻𝗰𝗵𝗿𝗼𝗻𝗼𝘂𝘀 𝗻𝗮𝘁𝘂𝗿𝗲 of distributed systems. In a synchronous system there is a bound on message delivery time so it is therefore easily achievable but in asynchronous systems things are much harder, in this context it is possible for a failure detector to be accurate or live, but not both.
In general, in asynchronous systems we have no strict timing assumptions and it's difficult to determine whether a process has failed or is simply taking a long time for execution, so many of the algorithms have probabilistic assumptions.
