

# Auto Label Emails with AI

### By [Fan Pier Labs](https://fanpierlabs.com)

This is a completely free, open source project made by Fan Pier Labs. With just a few clicks, you can set up custom labels in Gmail that are automatically applied using AI smart rules. This project helps you sort through emails and prioritize important messages, saving you time and ensuring you never miss critical communications. 

Btw, if you would like some custom software developed, reach out to us at https://fanpierlabs.com! We specialize in making nifty AI tools. 

## Features

- **Deterministic Labeling**: Four rules that apply labels based on email history:
  - `first-domain`: First email from a new domain
  - `first-address`: First email from a new address
  - `no-email-domain`: Email to a domain you've never sent to
  - `no-email-address`: Email to an address you've never sent to

- **AI Labeling**: Uses prompts from Google Sheets to match email content and apply labels
- **Offline Support**: Can run with Ollama (local AI) or OpenAI API
- **Stateless**: No database required - all state is tracked via Gmail labels

## Prerequisites

- Bun runtime
- Gmail account with OAuth2 credentials
- (Optional) OpenAI API key or Ollama installation

## Setup

### 1. Gmail OAuth2 Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable Gmail API
4. Create OAuth 2.0 credentials (Desktop app)
5. Get your `client_id`, `client_secret`, and `refresh_token`

### 2. Environment Variables

Create a `.env` file or set environment variables:

```bash
# Gmail OAuth (Required)
GMAIL_CLIENT_ID=your_client_id
GMAIL_CLIENT_SECRET=your_client_secret
GMAIL_REFRESH_TOKEN=your_refresh_token

# AI Provider (Optional, defaults to ollama)
AI_PROVIDER=ollama  # or "openai"
OPENAI_API_KEY=your_openai_key  # Required if AI_PROVIDER=openai
OLLAMA_URL=http://localhost:11434  # Default
OLLAMA_MODEL=llama3.2:1b  # Default

# Google Sheets (Optional, has default)
# The sheet must be publicly viewable so this code can access it without auth
# You can provide either a full URL or just the spreadsheet ID
# Template https://docs.google.com/spreadsheets/d/1oRvLEi2uj0ENbJ42EyINLzWcbC92HwGriMq5ejKhXYM/edit?gid=0#gid=0
GOOGLE_SHEETS_URL=https://docs.google.com/spreadsheets/d/1oRvLEi2uj0ENbJ42EyINLzWcbC92HwGriMq5ejKhXYM/edit?gid=0#gid=0

# Processing (Optional)
POLL_INTERVAL_MINUTES=5  # Default
PROCESSED_LABEL=__auto-processed__  # Default
```

### 3. Install Dependencies

```bash
bun install
```

## Running Locally

### With Ollama (Recommended for Local)

1. Install Ollama: https://ollama.com/
2. Pull a model: `ollama pull llama3.2:1b`
3. Start Ollama: `ollama serve` (in a separate terminal)
4. Run the app: `bun run src/index.ts`

### With OpenAI

Set `AI_PROVIDER=openai` and `OPENAI_API_KEY` in your environment, then run:
```bash
bun run src/index.ts
```

## Docker

### Build

```bash
docker build -t email-labeling .
```

### Run

```bash
docker run --env-file .env email-labeling
```

The Docker image includes Ollama and will automatically:
1. Start Ollama in the background
2. Pull the specified model
3. Run the application

## Deployment

Deploy to AWS Fargate:

```bash
bun run deploy
```

Make sure your AWS credentials are configured with the profile specified in `deploy.yaml`.

## How It Works

1. **Fetches Unprocessed Emails**: Searches for emails from the last 24 hours that don't have the `__auto-processed__` label
2. **Deterministic Labeling**: Queries Gmail API for email history and applies deterministic rules
3. **AI Labeling**: Fetches label rules from Google Sheets and matches email content
4. **Applies Labels**: Applies all labels (deterministic + AI) plus the processed label in one API call
5. **Schedules Next Run**: Waits for the configured interval and repeats

## Google Sheets Format

The Google Sheet should have:
- Column 1: Label name
- Column 2: Prompt/pattern to match

The sheet is fetched as CSV from the public export URL.

## Troubleshooting

### Gmail API Errors
- Ensure OAuth credentials are correct
- Check that Gmail API is enabled in Google Cloud Console
- Verify refresh token is valid

### Ollama Connection Issues
- Ensure Ollama is running: `curl http://localhost:11434/api/tags`
- Check `OLLAMA_URL` environment variable
- Verify model is pulled: `ollama list`

### No Emails Processed
- Check that emails exist in the last 24 hours
- Verify the processed label name matches
- Check Gmail API quota limits

## License

MIT
