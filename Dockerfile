FROM oven/bun:latest

WORKDIR /app

# Install Ollama
RUN curl -fsSL https://ollama.com/install.sh | sh

# Copy package files
COPY package.json bun.lockb* ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Create startup script
RUN echo '#!/bin/sh\n\
set -e\n\
\n\
# Start Ollama in background\n\
echo "Starting Ollama..."\n\
ollama serve &\n\
OLLAMA_PID=$!\n\
\n\
# Wait for Ollama to be ready\n\
echo "Waiting for Ollama to be ready..."\n\
for i in 1 2 3 4 5 6 7 8 9 10; do\n\
  if curl -f http://localhost:11434/api/tags > /dev/null 2>&1; then\n\
    echo "Ollama is ready"\n\
    break\n\
  fi\n\
  echo "Waiting for Ollama... ($i/10)"\n\
  sleep 2\n\
done\n\
\n\
# Pull model if not already present\n\
MODEL="${OLLAMA_MODEL:-llama3.2:1b}"\n\
echo "Ensuring model $MODEL is available..."\n\
ollama pull "$MODEL" || echo "Warning: Failed to pull model $MODEL, continuing anyway..."\n\
\n\
# Run the application\n\
echo "Starting application..."\n\
exec bun run src/index.ts\n\
' > /app/start.sh && chmod +x /app/start.sh

EXPOSE 11434

CMD ["/app/start.sh"]
