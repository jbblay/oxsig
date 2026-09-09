import { awsCredentialsProvider } from '@vercel/functions/oidc';

/**
 * Build AWS SDK client configuration while preserving the normal local credential chain.
 * Vercel production sets AWS_ROLE_ARN and receives short-lived role credentials through OIDC.
 */
export function awsClientConfig(region) {
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
