import 'server-only';

/**
 * Build AWS SDK client configuration without disturbing the default credential chain.
 *
 * Local development intentionally leaves AWS_ROLE_ARN unset so the SDK can resolve
 * AWS_PROFILE=oxsig-dev (or any other standard local provider) normally. Vercel
 * production sets AWS_ROLE_ARN and exchanges its short-lived OIDC token for role
 * credentials through the Vercel provider.
 *
 * The OIDC package is imported lazily so local development never loads Vercel's OIDC
 * runtime unless the production role is actually configured.
 */
export function awsClientConfig(region: string) {
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
