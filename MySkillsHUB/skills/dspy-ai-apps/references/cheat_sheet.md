# DSPy + Gemini Cheat Sheet

## 1. Signatures & "Intent-Oriented" Types

Define *what* you want using Python types.

### A. Basic Translation
```python
class Translator(dspy.Signature):
    """Translate sentence to target language."""
    sentence: str = dspy.InputField()
    target_language: str = dspy.InputField()
    translation: str = dspy.OutputField(desc="Accurate translation")
```

### B. Entity Extraction (Typed)
```python
class Entity(dspy.Signature):
    """Extract entities from text."""
    text: str = dspy.InputField()
    entities: list[dict[str, str]] = dspy.OutputField(desc="e.g. [{'name': 'Rome', 'type': 'Location'}]")
```

### C. Invoice Parsing (Vision/Structured)
```python
class InvoiceParser(dspy.Signature):
    """Extract invoice details from text/OCR."""
    invoice_text: str = dspy.InputField()
    amount: float = dspy.OutputField()
    date: str = dspy.OutputField(desc="YYYY-MM-DD")
    vendor: str = dspy.OutputField()
```

## 2. Modules & Strategies

### A. Predict (Zero/Few-Shot)
```python
# For simple tasks
pred = dspy.Predict(Translator)
```

### B. ChainOfThought (Reasoning)
```python
# For complex logic or math
cot = dspy.ChainOfThought(InvoiceParser)
# usage: result = cot(invoice_text="...")
# result.rationale contains the "thinking" steps.
```

### C. ReAct Agent (Tool Use)
```python
# Define tools (can be simple functions or MCP tools)
def search_wikipedia(query): ...

agent = dspy.ReAct("question -> answer", tools=[search_wikipedia])
# usage: agent(question="Who is the CEO of Google?")
```

## 3. RAG (Retrieval Augmented Generation)

```python
class RAG(dspy.Module):
    def __init__(self, num_passages=3):
        super().__init__()
        self.retrieve = dspy.Retrieve(k=num_passages)
        self.generate = dspy.ChainOfThought("context, question -> answer")

    def forward(self, question):
        passages = self.retrieve(question).passages
        return self.generate(context=passages, question=question)
```

## 4. Optimization (The "Magic")

**WARNING**: High RPD usage. Use sparse datasets on Gemini Flash.

```python
from dspy.teleprompt import BootstrapFewShot

# 1. Define Metric
def validate_answer(example, pred, trace=None):
    return example.answer.lower() == pred.answer.lower()

# 2. Create Trainset
trainset = [dspy.Example(question="...", answer="...").with_inputs('question'), ...]

# 3. Compile
teleprompter = BootstrapFewShot(metric=validate_answer, max_bootstrapped_demos=2)
compiled_rag = teleprompter.compile(RAG(), trainset=trainset)
```

## 5. Synthetic Data Loop (Advanced)

1.  **Teacher**: Use a strong model (or manual prompt) to answer questions.
2.  **Generate**: Create 50 input/output pairs.
3.  **BootstrapFinetune**: Fine-tune a smaller student model on these pairs.

## 6. Tips for Gemini

- **Decompose**: Don't ask for "Translation + Summary + Sentiment" in one signature. Break it into 3 small programs.
- **TypedPredictor**: Use `dspy.TypedPredictor(Signature)` when you need Pydantic models back.
- **Inspecting**: Use `lm.inspect_history(n=1)` to see the exact prompt Gemini received.
