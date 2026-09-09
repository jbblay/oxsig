/**
 * Build AWS SDK client configuration while preserving the normal local credential chain.
 * Vercel production sets AWS_ROLE_ARN and receives short-lived role credentials through OIDC.
 * The Vercel OIDC runtime is loaded only when the production role is configured.
 */
export function awsClientConfig(region) {
  const roleArn = process.env.AWS_ROLE_ARN?.trim();
  if (!roleArn) return { region };

  return {
    region,
    credentials: async () => {
      const { awsCredentialsProvider } = await import('@vercel/functions/oidc');
      return awsCredentialsProvider({
        roleArn,
        clientConfig: { region },
      })();
    },
  };
}
