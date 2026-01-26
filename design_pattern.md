# Programming Principles from Core Software Books

Below is a structured list of core programming principles drawn from *Clean Code*, *The Pragmatic Programmer*, *Code Complete*, *Refactoring*, and *Design Patterns*. Principles are grouped by theme (readability, design, testing, etc.). Each principle is defined, supported by relevant books (cited), and illustrated with a pseudocode example. **“Do”** and **“Don’t”** lists give concrete actions, and **AI Pitfalls** highlight common mistakes an LLM should avoid when applying the principle.

---

## Readability & Clarity

### Descriptive Naming

**Definition:** Use clear, meaningful names for variables, functions, classes, etc., so code reads like natural language. Avoid vague, abbreviated, or encoded names. Good names explain intent without requiring comments.

- **Supported by:** *Clean Code*, *Code Complete*

```python
# Bad
function calc(a, b) {
    return a * b + 3;
}

# Good
function calculateRectangleArea(width, height) {
    const margin = 3;
    return width * height + margin;
}
```

- **Do:** Use nouns for data, verbs for actions, consistent domain terms.
- **Don’t:** Use single-letter or misleading names.
- **AI Pitfalls:** Repeating generic or inconsistent names like `data`, `temp`, `foo`.

---

### Consistent Style & Formatting

**Definition:** Follow a uniform coding style and project conventions.

- **Supported by:** *Clean Code*, *Code Complete*

```javascript
// Bad
if(x>0){
y= x+10;
    console.log(y);}

// Good
if (x > 0) {
    let result = x + 10;
    console.log(result);
}
```

- **Do:** Stick to one brace style, indentation, and line length.
- **Don’t:** Mix styles in one file.
- **AI Pitfalls:** Producing inconsistent formatting across blocks.

---

### Self-Documenting Code (Minimize Comments)

**Definition:** Write code so its intent is clear. Comments explain *why*, not *what*.

- **Supported by:** *Clean Code*, *Code Complete*

```python
# Bad
# increment i by 1
i = i + 1

# Good
i = i + 1

# Acceptable
# Block underage users
if user.age < 13:
    blockAccess()
```

- **Do:** Use clear naming and logic.
- **Don’t:** Write redundant comments or leave dead code.
- **AI Pitfalls:** Over-commenting or leaving stale comments.

---

### Small Functions & Single Responsibility

**Definition:** Functions/classes should do one thing. Small, cohesive units are easier to test and maintain.

- **Supported by:** *Clean Code*, *Code Complete*

```python
# Bad
function updateUser(data):
    validate(data)
    updateDB(data)
    sendEmail(data)

# Good
function updateUser(data):
    validate(data)
    save(data)
    notify(data)
```

- **Do:** Keep functions focused and readable.
- **Don’t:** Combine unrelated tasks.
- **AI Pitfalls:** Either too monolithic or overly fragmented.

---

## Simplicity & Efficiency

### KISS (Keep It Simple, Stupid)

**Definition:** Use the simplest solution that solves the problem.

- **Supported by:** *Clean Code*, *The Pragmatic Programmer*

```javascript
// Bad
class SingleValueList {
    constructor(val) { this.values = [val]; }
    add(val) { this.values.push(val); }
}

// Good
let numbers = [5];
numbers.push(7);
```

- **Do:** Use clear, built-in features.
- **Don’t:** Over-engineer.
- **AI Pitfalls:** Using classes or patterns unnecessarily.

---

### Don’t Repeat Yourself (DRY)

**Definition:** Eliminate duplicated code and logic.

- **Supported by:** *The Pragmatic Programmer*, *Clean Code*

```python
# Bad
def circleArea(r): return 3.14159 * r * r
def quarterArea(r): return 3.14159 * r * r / 4

# Good
PI = 3.14159
def circleArea(r): return PI * r * r
def quarterArea(r): return circleArea(r) / 4
```

- **Do:** Abstract common logic.
- **Don’t:** Copy-paste code blocks.
- **AI Pitfalls:** Producing repeated structures from pattern prediction.

---

### YAGNI (You Aren’t Gonna Need It)

**Definition:** Avoid implementing features until actually needed.

- **Supported by:** *The Pragmatic Programmer*, XP

```python
# Bad
def processOrder():
    prepareInvoice()
    applyFutureDiscounts()
    scheduleLoyaltyRewards()

# Good
def processOrder():
    prepareInvoice()
```

- **Do:** Write only what's needed now.
- **Don’t:** Anticipate speculative features.
- **AI Pitfalls:** Generating code for unspecified future features.

---

## Design & Architecture

### Single Responsibility Principle (SRP)

**Definition:** Each unit should have only one reason to change.

- **Supported by:** *Clean Code*, *The Pragmatic Programmer*

```python
# Good
def processOrder():
    fetchOrder()
    verifyPayment()
    shipOrder()
```

- **Do:** Encapsulate logic into separate units.
- **Don’t:** Mix data access, logic, and UI.
- **AI Pitfalls:** Cramming multiple operations into one class.

---

### Composition Over Inheritance

**Definition:** Prefer combining objects to form behavior over class hierarchies.

- **Supported by:** *The Pragmatic Programmer*, *Design Patterns*

```python
# Bad
class Bird:
    def fly(): pass
class Penguin(Bird):
    def fly(): raise Exception("Cannot fly")

# Good
class Bird:
    def __init__(self, fly_behavior):
        self.fly_behavior = fly_behavior
    def fly(): self.fly_behavior.fly()
```

- **Do:** Use interfaces or injected behaviors.
- **Don’t:** Inherit just to override behavior.
- **AI Pitfalls:** Overusing subclassing.

---

### Program to an Interface

**Definition:** Depend on abstractions, not concrete implementations.

- **Supported by:** *Design Patterns*, *Code Complete*

```python
# Good
class PaymentProcessor: def process(): pass
class StripeProcessor(PaymentProcessor): ...
```

- **Do:** Code against interfaces.
- **Don’t:** Hard-code specific implementations.
- **AI Pitfalls:** Using fixed class names or logic paths.

---

### Use of Patterns

**Definition:** Apply standard design patterns when they clarify intent and aid reuse.

- **Supported by:** *Design Patterns*, *Clean Code*

#### Essential Design Patterns

- **Factory:** Delegate object creation to subclasses or helpers.

    ```python
    class LoggerFactory:
        def get_logger(type):
            if type == "file": return FileLogger()
            else: return ConsoleLogger()
    ```

- **Strategy:** Encapsulate interchangeable behavior in separate classes.

    ```python
    class SortStrategy: def sort(data): pass
    class QuickSort(SortStrategy): ...
    class MergeSort(SortStrategy): ...
    sorter = MergeSort()
    sorter.sort(list)
    ```

- **Observer:** Notify dependent objects when state changes.

    ```python
    class Subject:
        def attach(observer): ...
        def notify(): ...
    ```

- **Decorator:** Add responsibilities to objects without modifying class.

    ```python
    class Notifier: def send(): pass
    class SlackNotifier(Notifier): ...
    class EmailNotifier(Notifier): ...
    ```

- **Adapter:** Convert incompatible interfaces.

    ```python
    class LegacyPrinter:
        def print_text(text): ...

    class PrinterAdapter:
        def __init__(self, legacy): self.legacy = legacy
        def print(data): self.legacy.print_text(data)
    ```

- **Do:** Use patterns to increase modularity, testability, and reuse.
- **Don’t:** Apply patterns blindly; ensure the context fits the abstraction.
- **AI Pitfalls:** Overuse of patterns for trivial logic; poor pattern naming.

---

## Testing & Quality

### Write Automated Tests Early

**Definition:** Use tests to guide design, prevent regressions, and validate behavior.

- **Supported by:** *Refactoring*, *The Pragmatic Programmer*

```python
def test_add():
    assert add(2, 3) == 5
```

- **Do:** Test edge cases and business logic.
- **Don’t:** Skip tests or write vague assertions.
- **AI Pitfalls:** Missing tests or overly broad test functions.

---

### One Assert per Test

**Definition:** Keep tests focused on a single behavior.

- **Supported by:** *Clean Code*

```python
def test_is_adult():
    assert is_adult(18) == True
```

- **Do:** Use test names to describe intent.
- **Don’t:** Group many checks together.
- **AI Pitfalls:** Combining multiple assertions in one test.

---

## Error Handling & Input Validation

### Handle Errors Clearly

**Definition:** Use exceptions for unexpected states and fail early.

- **Supported by:** *Code Complete*, *Clean Code*

```python
def divide(a, b):
    if b == 0: raise ValueError("Cannot divide by zero")
    return a / b
```

- **Do:** Validate early and provide clear errors.
- **Don’t:** Swallow exceptions or return misleading values.
- **AI Pitfalls:** Skipping edge-case validation or empty error handlers.

---

## Maintainability & Practices

### Boy Scout Rule

**Definition:** Leave the code better than you found it.

- **Supported by:** *Clean Code*, *The Pragmatic Programmer*

```python
# Before
def calc(a, b): return a + b

# After
def calculate_sum(a, b): return a + b
```

- **Do:** Improve names, clean up, remove dead code.
- **Don’t:** Add hacks or ignore small fixes.
- **AI Pitfalls:** Regenerating dirty code if not prompted for improvement.

---

### Continuous Refactoring

**Definition:** Improve structure regularly, backed by tests.

- **Supported by:** *Refactoring*, *Code Complete*

- **Do:** Make small, test-covered refactors often.
- **Don’t:** Delay cleanup or batch massive changes.
- **AI Pitfalls:** Omitting intermediate cleanup steps.

---

### Version Control & Incremental Work

**Definition:** Commit in logical, testable chunks.

- **Supported by:** *Refactoring*, general Agile practice

- **Do:** Commit each passing, tested change.
- **Don’t:** Check in broken or mixed-context code.
- **AI Pitfalls:** Generating too much at once without guiding commit intent.

---

### Automation and Tooling

**Definition:** Automate repetitive tasks and use tools for consistency.

- **Supported by:** *The Pragmatic Programmer*, *Clean Code*

- **Do:** Use CI pipelines, linters, formatters.
- **Don’t:** Depend on manual repetition or ignore warnings.
- **AI Pitfalls:** Failing to produce code compliant with team tools/linting rules.

---

## Design & Architecture (Extended with Essential Patterns)

### Usage of Patterns

**Definition:** Apply standard design patterns when they clarify intent and aid reuse.

- **Supported by:** *Design Patterns*, *Clean Code*, [The 7 Most Important Software Design Patterns](https://learningdaily.dev/the-7-most-important-software-design-patterns-d60e546afb0e)

#### Design Patterns Essentials

- **Factory Pattern** — *Create objects without exposing the creation logic.*

```python
class LoggerFactory:
    def get_logger(type):
        if type == "file": return FileLogger()
        else: return ConsoleLogger()
```

**Use when:** Object creation needs to be decoupled from the client code.

- **Strategy Pattern** — *Define a family of interchangeable algorithms.*

```python
class SortStrategy: def sort(data): pass
class QuickSort(SortStrategy): ...
class MergeSort(SortStrategy): ...
sorter = MergeSort()
sorter.sort(list)
```

**Use when:** You want to swap behaviors without changing context class.

- **Observer Pattern** — *Notify dependent objects about changes to a subject.*

```python
class Subject:
    def attach(observer): ...
    def notify(): ...
```

**Use when:** Changes in one object should update many dependents automatically.

- **Decorator Pattern** — *Dynamically add functionality to objects.*

```python
class Notifier: def send(): pass
class SlackNotifier(Notifier): ...
class EmailNotifier(Notifier): ...
```

**Use when:** You want to add responsibilities to objects without inheritance.

- **Adapter Pattern** — *Allow incompatible interfaces to work together.*

```python
class LegacyPrinter:
    def print_text(text): ...

class PrinterAdapter:
    def __init__(self, legacy): self.legacy = legacy
    def print(data): self.legacy.print_text(data)
```

**Use when:** Integrating incompatible systems or interfaces.

- **Command Pattern** — *Encapsulate a request as an object.*

```python
class Command:
    def execute(): pass
class LightOnCommand(Command):
    def execute(): light.on()
```

**Use when:** You need to queue, log, or undo operations.

- **Singleton Pattern** — *Ensure only one instance of a class exists.*

```python
class Singleton:
    _instance = None
    def __new__(cls):
        if not cls._instance:
            cls._instance = super().__new__(cls)
        return cls._instance
```

**Use when:** A single point of access is required (e.g. config, logger).

---

**Pattern Usage Guidelines:**

- **Do:** Apply patterns to improve clarity, flexibility, and maintainability.
- **Don’t:** Force patterns into simple code; avoid over-abstraction.
- **AI Pitfalls:** Predicting patterns where none are needed, misnaming roles, or misapplying intent.

Use design patterns like these when code structure or reuse clearly benefits. Refer to the original [article](https://learningdaily.dev/the-7-most-important-software-design-patterns-d60e546afb0e) for deeper context and diagrams.

---

(End of markdown doc: A complete structured reference of programming principles and patterns for AI code generation and review)
