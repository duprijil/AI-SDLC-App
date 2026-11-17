# core

Shared kernel. Holds what every domain needs and knows nothing about any of them.

## Responsibilities

- The model convention, in `models/invariant.ts`
- Logging: `adapters/logger_port.ts` and the structured console adapter `logger_console.ts`
- Presentation components with no business terms, in `entrypoints/ui/`, once two domains share one

## Model convention

- A model is a class with `readonly` fields and a `private` constructor.
- It's built through a static factory (`create`, or a verb such as `start`) that checks every invariant with `ensure(condition, () => new <Domain>SpecificError(...))`. An invalid model can't exist.
- A change returns a new instance (`withStatus`). Models never mutate.
- A model that crosses a process or wire boundary has a `<Name>DTO` interface in the same file and a `toDTO()` method.

## Language

None. Business terms belong in their own domain.

## Invariants

- `core` never imports another domain.
- `core` has no `use_cases`, and no entrypoints other than `entrypoints/ui/`.
