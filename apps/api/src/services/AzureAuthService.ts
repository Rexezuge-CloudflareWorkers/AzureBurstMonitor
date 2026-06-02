import { InternalServerError } from '@azure-burst-monitor/backend-errors';

interface AzureTokenEnv {
  AZURE_TENANT_ID: string;
  AZURE_CLIENT_ID: string;
  AZURE_CLIENT_SECRET: string;
}

interface AzureTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

class AzureAuthService {
  public static async getToken(env: AzureTokenEnv): Promise<string> {
    const url = `https://login.microsoftonline.com/${env.AZURE_TENANT_ID}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: env.AZURE_CLIENT_ID,
      client_secret: env.AZURE_CLIENT_SECRET,
      scope: 'https://management.azure.com/.default',
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new InternalServerError(`Azure authentication failed: ${response.status} ${text}`);
    }

    const data = (await response.json()) as AzureTokenResponse;
    return data.access_token;
  }
}

export { AzureAuthService };
