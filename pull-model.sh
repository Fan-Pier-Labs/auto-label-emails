#!/bin/sh
set -e

MODEL="$1"
if [ -z "$MODEL" ]; then
  echo "Error: Model name required"
  exit 1
fi

apt-get update && apt-get install -y curl

apt-get install -y zstd

curl -fsSL https://ollama.com/install.sh | sh

# Ensure Ollama is in PATH (the install script should put it in /usr/local/bin)
export PATH="/usr/local/bin:$PATH"

# # Verify Ollama is installed
# if ! command -v ollama >/dev/null 2>&1; then
#   echo "Error: ollama command not found. Checking /usr/local/bin/ollama..."
#   if [ ! -f /usr/local/bin/ollama ]; then
#     echo "Error: Ollama binary not found at /usr/local/bin/ollama"
#     exit 1
#   fi
#   # Use full path if not in PATH
#   OLLAMA_CMD="/usr/local/bin/ollama"
# else
#   OLLAMA_CMD="ollama"
# fi

echo "Starting Ollama to download model $MODEL..."
ollama serve | tee /tmp/ollama.log &

sleep 10

# # Wait for Ollama to be ready (no timeout - wait indefinitely)
# echo "Waiting for Ollama to be ready..."
# while true; do
#   RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}\n" http://localhost:11434/api/tags || true)
#   HTTP_STATUS=$(echo "$RESPONSE" | awk '/HTTP_STATUS:/ {print $2}')
#   if [ "$HTTP_STATUS" = "200" ]; then
#     echo "Ollama API /api/tags response:"
#     echo "$RESPONSE" | sed '/HTTP_STATUS:/d'
#     echo "Ollama is ready, pulling model $MODEL..."
#     break
#   fi
#   sleep 10
# done


#  => => # time=2026-01-21T01:52:19.288Z level=INFO source=routes.go:1708 msg="entering low vram mode" "total vram"="0 B" threshold="20.0 GiB"
#  => => # [GIN] 2026/01/21 - 01:52:29 | 200 |    1.970875ms |       127.0.0.1 | GET      "/api/tags"
#  => => # [GIN] 2026/01/21 - 01:52:39 | 200 |     157.875µs |       127.0.0.1 | GET      "/api/tags"

echo "Ollama is ready, pulling model333 $MODEL..."

# Pull model with progress visible (ollama pull shows progress by default to stdout)
ollama pull "$MODEL"
echo "Model $MODEL downloaded successfully"

# Stop Ollama
# kill $OLLAMA_PID || true
# wait $OLLAMA_PID || true
# exit 0

