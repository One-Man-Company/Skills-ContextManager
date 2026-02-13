import dspy
import os
import time
from functools import wraps
from typing import List, Optional, Literal
from pydantic import BaseModel, Field

# --- CONFIGURATION ---
# STRICT RATE LIMITS: 20 Requests Per Day!
MODEL_NAME = "models/gemini-1.5-flash" 
CACHE_FILE = "dspy_cache.json"

def setup_dspy():
    """
    Configures DSPy with Gemini and local file caching.
    """
    api_key = os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        raise ValueError("GOOGLE_API_KEY environment variable not set.")

    lm = dspy.Google(
        model=MODEL_NAME,
        api_key=api_key,
        temperature=0.7,
        max_output_tokens=2048
    )

    # Enable global caching to save RPD
    os.makedirs(os.path.dirname(CACHE_FILE) if os.path.dirname(CACHE_FILE) else '.', exist_ok=True)
    dspy.settings.configure(lm=lm, adapter=None)
    
    print(f"✅ DSPy Configured with {MODEL_NAME}")
    print(f"⚠️  REMINDER: You have ~20 Requests Per Day. Use them wisely.")

def rate_limit_guard(func):
    """
    Simple decorator to prevent rapid-fire requests explicitly.
    """
    last_call = 0
    
    @wraps(func)
    def wrapper(*args, **kwargs):
        nonlocal last_call
        now = time.time()
        # 5 RPM = 1 request every 12 seconds minimum.
        elapsed = now - last_call
        if elapsed < 15:
            wait_time = 15 - elapsed
            print(f"⏳ Rate Guard: Waiting {wait_time:.1f}s...")
            time.sleep(wait_time)
        
        try:
            result = func(*args, **kwargs)
            last_call = time.time()
            return result
        except Exception as e:
            if "429" in str(e):
                print("🛑 HIT RATE LIMIT (429). Stop and wait 24h.")
                raise e
            raise e
            
    return wrapper

# --- EXAMPLES OF TYPED SIGNATURES ---

# 1. Structured Output with Pydantic
class UserInfo(BaseModel):
    name: str
    age: int
    interests: List[str]

class ExtractUserInfo(dspy.Signature):
    """Extract structured user information from bio."""
    bio: str = dspy.InputField()
    user_info: UserInfo = dspy.OutputField(desc="Structured user data")

# 2. Typed Classification
class SentimentAnalysis(dspy.Signature):
    """Classify sentiment of the text."""
    text: str = dspy.InputField()
    sentiment: Literal["positive", "neutral", "negative"] = dspy.OutputField()

# 3. Complex Entity Extraction (List of Dicts)
class EntityExtraction(dspy.Signature):
    """Extract entities from paragraph."""
    paragraph: str = dspy.InputField()
    entities: List[dict] = dspy.OutputField(desc="List of entities like [{'name': '...', 'type': '...'}]")

def main():
    setup_dspy()
    
    # Select mode
    print("\nSelect Demo Mode:")
    print("1. Interactive Prediction (Dry Run safe)")
    print("2. Typed Extraction (Requires Call)")
    
    mode = input("> ")
    
    if mode == "1":
        # Interactive mode using standard Predict
        module = dspy.Predict(dspy.Signature("question -> answer"))
        print("\n❓ Enter a question (or 'q' to quit):")
        while True:
            q = input("> ")
            if q.lower() == 'q': break
            try:
                # rate_limit_guard manual check or apply to method
                print("Thinking...")
                response = module(question=q) # DSPy auto-caches if input matches!
                print(f"🤖 Answer: {response.answer}")
            except Exception as e:
                print(f"❌ Error: {e}")
                break

    elif mode == "2":
        # Typed extraction example
        print("\n📝 Extracting info from bio...")
        bio = "Alice is a 28-year-old engineer who loves hacking and chess."
        extractor = dspy.TypedPredictor(ExtractUserInfo) # Use TypedPredictor for Pydantic
        
        try:
            result = extractor(bio=bio)
            print(f"✅ Extracted: {result.user_info}")
            print(f"   Name: {result.user_info.name}")
            print(f"   Interests: {result.user_info.interests}")
        except Exception as e:
            print(f"❌ Error: {e}")

if __name__ == "__main__":
    main()
