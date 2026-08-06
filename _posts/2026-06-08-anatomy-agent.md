# Anatomy of an AI Agent: Building One That Does Not Drift

The anatomy of an agent is not the hard part. It is a loop, a model, a set of tools, and some state, and it fits on one page. Anyone can build one that completes a three step task in a demo.

The hard part arrives at step twenty. The agent is still running, still producing confident text, still calling tools that return successfully, and it is now working on a slightly different problem than the one it was given, using values that were true four minutes ago. Nothing has crashed. Nothing in the log says anything is wrong.

That is drift, and it is the failure mode that separates an agent that survives production from one that demos well. This article describes the anatomy, and then spends most of its length on the practices that keep a long run anchored.

I have written before about [drift in the context of recursive self improvement](https://engineering87.github.io/2026/06/07/ai-rsi.html), where an objective erodes across generations of a system improving itself. What follows is the smaller and far more immediate version of the same failure: drift inside a single execution, over minutes rather than months.

## One premise, and the anatomy that follows from it

An agent exists for exactly one reason. The sequence of steps required to complete the task cannot be written down before the task starts. If the sequence is known, write it in code, and you get a system that is faster, cheaper, testable, and explainable to whoever operates it at three in the morning. Anthropic draws the same line in [Building Effective Agents](https://www.anthropic.com/engineering/building-effective-agents), between orchestration that lives in predefined code paths and systems where the model directs its own process.

Reduced to the smallest thing that still deserves the name, an agent is four blocks and one return path.

![Minimal agent skeleton: state, decide, act, observe, with the observation path closing the loop](/assets/img/agent-anatomy/1-minimal.svg)

Remove any one of them and it stops being an agent. Without the decision there is a workflow. Without the action there is a text generator. Without the observation there is a text generator that reports imaginary progress. Without the state there is a single step repeated. Everything added from here exists to keep that loop honest over more than a handful of iterations.

Which means that once you accept that the sequence is unknown, six parts become mandatory, and none of them is a design preference.

Something has to **decide at runtime**, using information that did not exist when the code was written. That is the role the model occupies, and it is the only role that ordinary code could not fill. It is also the only stochastic component in the system, sitting at the exact point where the next action is chosen. Everything else exists to contain that fact.

The decision needs a **surface where actions produce real effects**, exposed as operations with names, parameters, and descriptions. This surface is an API whose only consumer reads the documentation and never asks a clarifying question, which means every ambiguity left in a parameter description gets resolved by invention.

The result of each action needs a **return channel that tells the truth**. This is the part that gets skipped, and skipping it produces the most confusing failures in the whole discipline. More on it below, because it is where most drift actually starts.

Decisions in sequence need **state that survives the step**, which grows monotonically and is bounded, so something eventually has to choose what to keep.

The loop needs an **exit that the model does not own**, because the failure mode of a stochastic planner is to continue while producing plausible text. And the system needs a **boundary on authority**, because some actions can be repeated with no consequence and some cannot, and the design question is never whether the model will err but what its most expensive available mistake costs.

Drawn out, those parts occupy three zones: what you write, what decides, and what you do not control.

![Logical architecture of an agent: working state, decision, control gate, tool layer, environment, and the observation path that closes the loop](/assets/img/agent-anatomy/4-full.svg)

The same structure in code fits on one page.

```
function run(goal, tools, limits):
    state = initial_state(goal, tools)

    loop:
        if limits.reached():
            return stop_and_report(state)

        decision = model.decide(state)

        if decision.is_final():
            return decision.result

        action = decision.action

        if action.is_irreversible() and not authorized(action):
            return await_authorization(action, state)

        result = execute(action)          // real effect
        observation = describe(result)    // including failures

        limits.charge(action, result)
        state = compress_if_needed(state.append(action, observation))
```

The loop is trivial and always looks the same. All of the interesting content is inside `describe`, `compress_if_needed`, `authorized`, and the tool definitions, which is to say inside four function names that each conceal a policy decision. Those four are also where drift is prevented or created.

## Three kinds of drift, which are usually confused

The word drift gets applied to any long run that goes wrong. Separating the cases is worth doing, because they have different causes and different fixes, and a practice that addresses one does nothing for the others.

**State drift** is divergence between what the agent believes about the world and what is true. The agent reads a record at step three and acts on it at step nine, and in between the record changed. This is an ordinary race condition with two aggravations that conventional systems do not have. The time window is not known in advance, because the number of steps is decided at runtime. And the component that decides whether to re-read a value or trust the one in memory is stochastic.

**Context drift** is degradation of the record itself as it grows. Chroma's technical report [Context Rot](https://research.trychroma.com/context-rot) evaluated eighteen models and found that they do not use their context uniformly, with reliability falling as input length grows even on simple tasks. A larger window moves the cliff, it does not remove it. Compaction is the standard answer, and it introduces the second half of the problem: summaries drift toward the general, and general is precisely what the next step cannot use.

**Objective drift** is the quiet replacement of the goal by the most recent subgoal. Each individual step is a reasonable response to the step before it, and the chain as a whole walks away from what was asked. This is the hardest to detect, because every local decision looks defensible in isolation and the trace reads as competent work.

None of these is error compounding, which is arithmetic rather than drift and is discussed further down. All three, however, are made worse by it.

## Practices against state drift

**Treat every observation as a lease, not a fact.** An observed value has an age, and each tool should declare how long its output stays usable. A configuration value read once is good for the whole run. An account balance is good for seconds. Past that horizon the runtime forces a re-read rather than leaving the choice to the model, because the model has no reliable sense of elapsed time and every incentive to reuse what it already has.

**Make writes conditional on the version that was observed.** When the agent writes, the write carries the version, timestamp, or entity tag it saw when it read. If the underlying record has moved, the tool rejects the write and the rejection comes back as an observation. This is optimistic concurrency applied at the tool boundary, and its value is that it converts a silent overwrite into a visible error at the exact moment it happens. State drift becomes something the agent can respond to rather than something that surfaces in a reconciliation report next week.

**Generate idempotency keys in the runtime, never in the model.** If a tool call times out, the agent does not know whether the effect occurred. This is unavoidable and the model cannot resolve it by reasoning, because it has no access to the fact of its own prior action beyond what is in its state. The loop derives a deterministic key from the step, the tool holds it, and a retry with the same key is safe regardless of what the model believes happened. Any irreversible operation should also expose a companion operation that reports its status, so ambiguity is resolved by reading rather than by guessing.

**Refuse to let the return channel be optimistic.** After an action executes, what enters the state has to be what actually happened, including failures, and phrased in a way the model can act on. An exception rendered as an opaque identifier is truthful and useless. Errors should carry a category: retryable, terminal, wrong tool for this task, or wrong premise. The last one matters more than it appears, because "no record exists with that identifier" tells the model that a belief formed several steps earlier was false, and that is information nothing else in the system will supply.

Partial success has to be representable. An operation that updated four records out of six and returns a plain failure will be retried in full. The same operation returning what succeeded, what did not, and why produces a correct next step. And tool output should never be paraphrased by the runtime before it enters the state. Truncate deterministically if it is large, keeping identifiers intact, but do not summarize it, because a summary of an observation is no longer an observation.

## Practices against context drift

**Keep an invariant header that compaction never touches.** The goal, the success criteria, the constraints, and the authority granted for this run sit at the top of the state and are exempt from every compression pass. They are small, they are the most consequential tokens present, and they are the first thing a naive summarizer will condense.

**Compact reasoning, never facts.** Intermediate deliberation, abandoned branches, and superseded results can go. Identifiers, paths, versions, values already computed, and decisions already taken survive word for word. A discarded identifier cannot be reconstructed by reasoning, and a summary that reads well while having lost every concrete value looks like context and behaves like noise.

**Update the fact ledger incrementally rather than rewriting it.** If each compaction pass rewrites the accumulated summary from scratch, detail erodes a little on every pass, and after several passes the agent has a fluent description of a task it can no longer perform. Maintaining established facts as discrete entries that are appended to and individually retired avoids the erosion, because nothing is rewritten that did not change.

**Move bulk state out of the transcript.** Notes, intermediate results, and the working plan written to files, and read back when needed, turn unbounded context growth into bounded storage plus a read. The side effect is worth as much as the primary benefit: the agent's state becomes inspectable by a human while the run is still going.

**Give subtasks clean state.** Splitting work across separate runs, each with its own state and returning only its result, prevents one subtask's debris from polluting another's decisions. Most of what is described as multi agent architecture is this technique with a personality attached for narrative convenience.

## Practices against objective drift

**Write the success criteria before execution, in checkable form.** Not a restatement of the goal in different words, but the conditions that will be true when the task is done: this record in this state, this file containing this value, this answer including these four elements. Criteria that cannot be checked mechanically cannot detect drift, because the only judge left is the component that drifted.

**Re-evaluate against the original goal on a schedule, not on a feeling.** Every N steps, the runtime inserts a check comparing current state against the criteria, asking what remains and whether the current line of work still serves the goal. Fixed cadence matters: an agent that has drifted is exactly the agent least likely to notice on its own that a check is warranted.

**Cap replanning.** A plan that fails is normal. A third replan on the same task means the task was framed wrongly, the tools do not cover it, or the goal is unreachable, and continuing produces increasingly creative interpretations of what was asked. Make the cap explicit and make hitting it a terminal outcome that reports the state reached.

**Distinguish a failed plan from an unreachable goal.** These require opposite responses, and a model with no instruction to the contrary treats the second as an invitation to try something else. If the required record does not exist, the correct behaviour is to stop and say so, not to find an adjacent record that would also satisfy a looser reading of the request.

## Compounding, which is not drift but multiplies it

If each step is correct ninety five percent of the time, a ten step task finishes correctly about sixty percent of the time. At ninety nine percent per step, the same task reaches ninety percent. The arithmetic is unforgiving and it has one clear consequence: reducing the number of steps improves reliability more than improving any single step.

This is a practical argument for tool granularity. An operation that accomplishes in one call what would otherwise take five removes four opportunities for the run to go wrong, and it removes four rounds of tool output from the state. It is also the argument for checkpoints, meaning points at which a deterministic check, or a human, validates the state before the run continues. A checkpoint truncates the compounding chain, and placing them after irreversible actions rather than at arbitrary intervals costs the least and prevents the most.

## Practices that look right and are not

Retrying the whole run after a failure discards every correct step along with the wrong one, and the second run drifts differently. Retry the failed step.

Suppressing tool errors to keep the agent moving converts a visible failure into an invisible one, and every subsequent step is built on a false premise.

Letting the model own the retry decision for irreversible actions asks the least reliable component to answer a question it structurally cannot answer.

Patching a failure in the prompt when its cause was a tool contract works in testing and fails in a way that is very hard to diagnose later, because the fix is now several layers away from the problem.

And judging an agent on demonstrations selects for runs that happened to go well. Drift is a statistical property. It appears as variance across repeated runs of the same task, which means the only meaningful measurement is a set of tasks with checkable outcomes, run repeatedly, with the pass rate tracked as a number that moves when the prompt, the tools, or the model change.

## The test

Before building an agent, answer one question honestly. Can you write down the sequence of steps. If yes, write it.

If no, the anatomy above is what you are committing to build, and the practices above are not refinements to add later. The model is the only part of the system that decides. Everything else exists because it decides, because it is sometimes wrong, and because over twenty steps a small error that nobody caught becomes a confident report about a task that was never completed.
