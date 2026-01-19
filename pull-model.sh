#!/bin/sh
set -e

MODEL="$1"
if [ -z "$MODEL" ]; then
  echo "Error: Model name required"
  exit 1
fi

echo "Starting Ollama to download model $MODEL..."
ollama serve > /tmp/ollama.log 2>&1 &
OLLAMA_PID=$!

# Wait for Ollama to be ready (no timeout - wait indefinitely)
echo "Waiting for Ollama to be ready..."
while true; do
  if curl -f http://localhost:11434/api/tags > /dev/null 2>&1; then
    echo "Ollama is ready, pulling model $MODEL..."
    break
  fi
  sleep 1
done

# Pull model with progress visible (ollama pull shows progress by default to stdout)
ollama pull "$MODEL"
echo "Model $MODEL downloaded successfully"

# Stop Ollama
kill $OLLAMA_PID 2>/dev/null || true
wait $OLLAMA_PID 2>/dev/null || true
exit 0
