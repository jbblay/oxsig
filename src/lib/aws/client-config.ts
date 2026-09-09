import 'server-only';

import { awsCredentialsProvider } from '@vercel/functions/oidc';

/**
 * Build AWS SDK client configuration without disturbing the default credential chain.
 *
 * Local development intentionally leaves AWS_ROLE_ARN unset so the SDK can resolve
 * AWS_PROFILE=oxsig-dev (or any other standard local provider) normally. Vercel
 * production sets AWS_ROLE_ARN and exchanges its short-lived OIDC token for role
 * credentials through the Vercel provider.
 */
export function awsClientConfig(region: string) {
  const roleArn = process.env.AWS_ROLE_ARN?.trim();
  if (!roleArn) return { region };

  return {
    region,
    credentials: awsCredentialsProvider({
      roleArn,
      clientConfig: { region },
    }),
  };
}
