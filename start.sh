#!/bin/sh
set -e

# Start Ollama in background
echo "Starting Ollama..."
ollama serve &
OLLAMA_PID=$!

# Wait for Ollama to be ready
echo "Waiting for Ollama to be ready..."
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -f http://localhost:11434/api/tags > /dev/null 2>&1; then
    echo "Ollama is ready"
    break
  fi
  echo "Waiting for Ollama... ($i/10)"
  sleep 2
done

# Run the application
echo "Starting application..."
exec bun run src/index.ts
