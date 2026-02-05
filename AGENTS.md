# Style Guide

- Keep things in one function unless composable or reusable
- Avoid unnecessary destructuring. Instead of `const { a, b } = obj`, use `obj.a` and `obj.b` to preserve context
- Avoid `try`/`catch` where possible
- Avoid using the `any` type
- Prefer single word variable names where possible
- Use Bun APIs when possible, like `Bun.file()`
- Rely on type inference when possible; avoid explicit type annotations or interfaces unless necessary for exports or clarity

### Avoid let statements

We don't like `let` statements, especially combined with if/else statements.
Prefer `const`.

Good:

```ts
const foo = condition ? 1 : 2;
```

Bad:

```ts
let foo;

if (condition) foo = 1;
else foo = 2;
```

### Avoid else statements

Prefer early returns or using an `iife` to avoid else statements.

Good:

```ts
function foo() {
  if (condition) return 1;
  return 2;
}
```

Bad:

```ts
function foo() {
  if (condition) return 1;
  else return 2;
}
```

### Prefer single word naming

Try your best to find a single word name for your variables, functions, etc.
Only use multiple words if you cannot.

Good:

```ts
const foo = 1;
const bar = 2;
const baz = 3;
```

Bad:

```ts
const fooBar = 1;
const barBaz = 2;
const bazFoo = 3;
```

### Comments

Comments should be limited to cases of genuine complexity or indirection that is not immediately apparent.

Comments should be concise, maximum of two lines, but the vast majority should be 1.

If you are unsure whether a comment is needed, it isn't.

## Testing

You MUST avoid using `mocks` as much as possible.
Tests MUST test actual implementation, do not duplicate logic into a test.

Do not make trivial tests. Do not test internal implementation. Only _end behavior_ needs testing.

## Commits

Commit frequently. Large commits or commits that violate TDD principles (when applicable) will be rejected.

Commit messages should be concise and follow conventional commit format.

Keep commits atomic enough that they can be understood from the subject alone. Commit message bodies will be rejected entirely.
