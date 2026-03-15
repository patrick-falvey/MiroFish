"""
MiroFish Backend entry point (FastAPI)
"""

import os
import sys
import uvicorn

# Fix Windows console encoding issues: set UTF-8 encoding before all imports
if sys.platform == 'win32':
    # Set environment variable to ensure Python uses UTF-8
    os.environ.setdefault('PYTHONIOENCODING', 'utf-8')
    # Reconfigure standard output streams to UTF-8
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    if hasattr(sys.stderr, 'reconfigure'):
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')

# Add project root directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.config import Config

def main():
    """Main function"""
    # Validate configuration
    errors = Config.validate()
    if errors:
        print("Configuration errors:")
        for err in errors:
            print(f"  - {err}")
        print("\nPlease check the configuration in the .env file")
        sys.exit(1)
    
    # Get runtime configuration
    host = os.environ.get('FLASK_HOST', '0.0.0.0') # Still use old env var for backward compatibility
    port = int(os.environ.get('FLASK_PORT', 5001))
    
    # Start server
    uvicorn.run("app.main:create_fastapi_app", host=host, port=port, factory=True, reload=Config.DEBUG)

if __name__ == '__main__':
    main()

