import os
from dotenv import load_dotenv

print("--- Starting Environment Check ---")

# Load environment variables from .env file
load_dotenv()

# Get the API key from environment variables
api_key = os.getenv("GOOGLE_BOOKS_API_KEY")

if api_key:
    print("SUCCESS: GOOGLE_BOOKS_API_KEY was loaded.")
    print(f"Loaded Key (last 4 chars): ...{api_key[-4:]}")
else:
    print("FAILURE: GOOGLE_BOOKS_API_KEY not found in .env file.")

print("--- Environment Check Finished ---")
