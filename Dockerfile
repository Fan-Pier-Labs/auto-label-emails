FROM oven/bun:latest

WORKDIR /app

# Install Ollama
RUN curl -fsSL https://ollama.com/install.sh | sh

# Set default model (can be overridden with build arg)
ARG OLLAMA_MODEL=llama3.2:1b
ENV OLLAMA_MODEL=${OLLAMA_MODEL}

# Copy build script for pulling model (copy early so we can use it)
COPY pull-model.sh /tmp/pull-model.sh
RUN chmod +x /tmp/pull-model.sh

# Start Ollama, pull the model during build, then stop Ollama
RUN /tmp/pull-model.sh ${OLLAMA_MODEL}

# Copy package files
COPY package.json bun.lockb* ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Make startup script executable
RUN chmod +x /app/start.sh

EXPOSE 11434

CMD ["/app/start.sh"]
