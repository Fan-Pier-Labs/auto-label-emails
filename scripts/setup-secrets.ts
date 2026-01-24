import { SecretsManagerClient, CreateSecretCommand, UpdateSecretCommand, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { readFileSync } from 'fs';
import { join } from 'path';
import * as yaml from 'js-yaml';

async function setupRefreshTokenSecret() {
  // Read deploy.yaml to get app_name, region, and profile
  const deployYamlPath = join(process.cwd(), 'deploy.yaml');
  let appName = 'auto-email-labeling';
  let region = 'us-east-2';
  let profile = 'personal';
  
  try {
    const deployContent = readFileSync(deployYamlPath, 'utf-8');
    const config = yaml.load(deployContent) as any;
    
    appName = config.app_name || appName;
    region = config.aws?.region || process.env.AWS_REGION || region;
    profile = config.aws?.profile || process.env.AWS_PROFILE || profile;
  } catch (error) {
    console.log('Warning: Could not read deploy.yaml, using defaults');
    console.log(`  Using app_name: ${appName}, region: ${region}, profile: ${profile}`);
  }
  
  // Get refresh token from environment
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
  
  if (!refreshToken) {
    throw new Error('GMAIL_REFRESH_TOKEN not found in environment variables');
  }
  
  const secretName = `${appName}/gmail-refresh-token`;
  
  // Set AWS_PROFILE if specified (must be set before creating client)
  if (profile) {
    process.env.AWS_PROFILE = profile;
  }
  
  // Create Secrets Manager client
  // AWS SDK v3 uses default credential chain which respects AWS_PROFILE env var
  const client = new SecretsManagerClient({ 
    region,
  });
  
  try {
    // Try to get the secret to see if it exists
    try {
      await client.send(new GetSecretValueCommand({ SecretId: secretName }));
      // Secret exists, update it
      console.log(`Updating secret: ${secretName}`);
      await client.send(new UpdateSecretCommand({
        SecretId: secretName,
        SecretString: refreshToken,
      }));
      console.log(`✅ Secret updated successfully`);
    } catch (error: any) {
      if (error.name === 'ResourceNotFoundException') {
        // Secret doesn't exist, create it
        console.log(`Creating secret: ${secretName}`);
        await client.send(new CreateSecretCommand({
          Name: secretName,
          SecretString: refreshToken,
          Description: `Gmail refresh token for ${appName}`,
        }));
        console.log(`✅ Secret created successfully`);
      } else {
        throw error;
      }
    }
  } catch (error) {
    console.error('Error managing secret:', error);
    throw error;
  }
}

setupRefreshTokenSecret().catch((error) => {
  console.error('Failed to setup secret:', error);
  process.exit(1);
});

