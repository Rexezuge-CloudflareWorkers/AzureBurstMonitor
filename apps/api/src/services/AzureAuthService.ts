import { InternalServerError } from '@azure-burst-monitor/backend-errors';

interface AzureTokenEnv {
  AZURE_TENANT_ID: SecretsStoreSecret;
  AZURE_CLIENT_ID: SecretsStoreSecret;
  AZURE_CLIENT_SECRET: SecretsStoreSecret;
}

interface AzureTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

class AzureAuthService {
  public static async getToken(env: AzureTokenEnv): Promise<string> {
    const [tenantId, clientId, clientSecret] = await Promise.all([
      env.AZURE_TENANT_ID.get(),
      env.AZURE_CLIENT_ID.get(),
      env.AZURE_CLIENT_SECRET.get(),
    ]);

    const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
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
