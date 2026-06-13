# When not to use Pathline

Pathline shines for complex, multi-step backend operations with branching, gates, parallelism, and compensation. It is not always the right tool.

Avoid or reconsider Pathline when:

- **The logic is trivial.** A two-line service method does not need a flow. Plain TypeScript is clearer.
- **You need durable, resumable execution.** Use Temporal/Inngest/Step Functions, or run Pathline inside a durable worker. See [durable-vs-in-process.md](durable-vs-in-process.md).
- **You need a visual, non-developer editor.** Pathline is code-first.
- **The work is a pure data transformation/pipeline** with no business gates or side effects. A simple function or stream is simpler.
- **You want a rules engine / DSL evaluated at runtime from config.** Pathline flows are authored in TypeScript at build time.
- **Hot-path, latency-critical inner loops.** The runtime overhead is small (see `bench/`) but non-zero; do not wrap microsecond-level hot loops.

Use Pathline when a developer should be able to open one file and understand a complex operation: what runs first, what business checks exist, where branching happens, what runs in parallel, what happens on failure, and what response is produced.
