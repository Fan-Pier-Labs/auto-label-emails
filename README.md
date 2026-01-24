

# Auto Label Emails with AI

### By [Fan Pier Labs](https://fanpierlabs.com)

This is a completely free, open source project made by Fan Pier Labs. With just a few clicks, you can set up custom labels in Gmail that are automatically applied using AI smart rules. This project helps you sort through emails and prioritize important messages, saving you time and ensuring you never miss critical communications. 

This works by using AI to label your emails. You can set up any number of your own AI rules to determine which emails should be labeled and how they should be labeled. You can self-host on your own server, or use our hosted version. 

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
5. Configure OAuth consent screen:
   - Go to **APIs & Services** > **OAuth consent screen**
   - Add your email as a test user in the **Test users** section
   - This is required because the app is in testing mode
6. Add redirect URI:
   - Edit your OAuth 2.0 credentials
   - Add `http://localhost:8080` to **Authorized redirect URIs**
   - Save the changes
7. Download credentials:
   - Download the JSON file from your OAuth 2.0 credentials
   - Save it as `google_creds.json` in the project root
8. Get your refresh token:
   ```bash
   bun run get-token
   ```
   - This will open a browser window for authorization
   - After authorizing, the refresh token will be displayed in the console
   - Copy the refresh token to your `.env` file (for local development)
   - For AWS deployment, you can store it in AWS Secrets Manager (see Deployment section)
9. Copy your `client_id`, `client_secret`, and `refresh_token` to your `.env` file (for local development)

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

### AWS Fargate Deployment

The application supports automatic refresh token management via AWS Secrets Manager when deployed to AWS. The application will automatically detect if it's running on AWS and fetch the refresh token from Secrets Manager if it's not available as an environment variable.

#### Option 1: Deploy with Automatic Secret Setup (Recommended)

This will automatically create/update the secret in AWS Secrets Manager before deploying:

```bash
bun run deploy:with-secrets
```

This command:
1. Reads `GMAIL_REFRESH_TOKEN` from your environment
2. Creates or updates the secret in AWS Secrets Manager
3. Deploys the application to AWS Fargate

#### Option 2: Manual Secret Setup

If you prefer to set up the secret separately:

```bash
# First, set up the secret in AWS Secrets Manager
bun run setup-secrets

# Then deploy
bun run deploy
```

#### Option 3: Deploy Without Secrets Manager

You can still deploy using environment variables (not recommended for production):

```bash
bun run deploy
```

Make sure your AWS credentials are configured with the profile specified in `deploy.yaml`.

#### How It Works

- **Local Development**: The application uses `GMAIL_REFRESH_TOKEN` from environment variables or `.env` file
- **AWS Deployment**: The application automatically detects it's running on AWS (via `ECS_CONTAINER_METADATA_URI` or `AWS_EXECUTION_ENV`) and:
  1. First tries to use `GMAIL_REFRESH_TOKEN` environment variable
  2. If not found, fetches from AWS Secrets Manager at `{app_name}/gmail-refresh-token`
  3. Falls back to error if neither is available

The IAM role for the ECS task is automatically configured with permissions to read from Secrets Manager (see `deploy.yaml`).

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

## Available Scripts

- `bun run start` - Start the application
- `bun run dev` - Start in watch mode (auto-reload on changes)
- `bun run test` - Run test script (processes a single email)
- `bun run get-token` - Get Gmail OAuth refresh token
- `bun run setup-secrets` - Create/update refresh token in AWS Secrets Manager
- `bun run deploy` - Deploy to AWS Fargate
- `bun run deploy:with-secrets` - Deploy with automatic secret setup

## Troubleshooting

### Gmail API Errors
- Ensure OAuth credentials are correct
- Check that Gmail API is enabled in Google Cloud Console
- Verify refresh token is valid
- For AWS deployments, ensure the secret exists in AWS Secrets Manager and the IAM role has permissions

### AWS Secrets Manager Issues
- Verify `GMAIL_REFRESH_TOKEN` is set in your environment before running `setup-secrets`
- Check that your AWS credentials are configured correctly (profile specified in `deploy.yaml`)
- Ensure the IAM role has `secretsmanager:GetSecretValue` and `secretsmanager:DescribeSecret` permissions
- Verify the secret name matches `{app_name}/gmail-refresh-token` (check `deploy.yaml` for app_name)

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
