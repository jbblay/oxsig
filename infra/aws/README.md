# OXSIG AWS stack

The stack is defined as code in `template.mjs`, which generates `oxsig-platform.template.json`. See [docs/aws-migration.md](../../docs/aws-migration.md) for the decisions, costs and cutover sequence.

```bash
node infra/aws/template.mjs > infra/aws/oxsig-platform.template.json   # regenerate after edits
node --test scripts/tests/aws-infra-template.mjs                       # validate invariants
```

## Deploy staging (no traffic, no tasks)

```bash
aws cloudformation deploy --region eu-central-1 --stack-name oxsig-staging \
  --template-file infra/aws/oxsig-platform.template.json \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides Environment=staging VpcId=vpc-... \
    PublicSubnetIds=subnet-a,subnet-b DatabaseSubnetIds=subnet-a,subnet-b \
    StorageBucketName=<existing STORAGE_BUCKET> AlarmEmail=<ops email> MonthlyBudgetUsd=150
```

With these parameters, `DesiredCount` stays 0, `ContainerImage` is empty, and the cleanup schedule is off. Creating the stack incurs charges for the ALB, RDS and Secrets Manager only. Delete the stack to stop them; RDS is snapshotted when the stack is deleted.

## Bring it up

1. **Build and push the image** (the build uses Graviton, so pass `--platform linux/arm64`):
   ```bash
   aws ecr get-login-password | docker login --username AWS --password-stdin <RepositoryUri host>
   docker build --platform linux/arm64 --build-arg NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_... -t <RepositoryUri>:<git-sha> .
   docker push <RepositoryUri>:<git-sha>
   ```
2. **Populate the app secret** (`AppSecretArn` output). Every key listed in its description is required, because ECS refuses to start a task when a referenced key is missing.
   - Build `DATABASE_URL` from the RDS-managed master secret (`DatabaseMasterSecretArn`), using `?sslmode=verify-full`. The image trusts the RDS CA bundle through `NODE_EXTRA_CA_CERTS`.
3. **Run migrations** as a one-off task with the same image:
   ```bash
   aws ecs run-task --cluster oxsig-staging --launch-type FARGATE --task-definition <TaskDefinitionArn> \
     --network-configuration 'awsvpcConfiguration={subnets=[subnet-a],securityGroups=[<AppSecurityGroupId>],assignPublicIp=ENABLED}' \
     --overrides '{"containerOverrides":[{"name":"app","command":["node","scripts/migrate.mjs"]}]}'
   ```
4. **Redeploy** with `ContainerImage=<RepositoryUri>:<git-sha>` and `DesiredCount=1`. Then check `http://<LoadBalancerDnsName>/api/health`.
5. **Attach the public hostname**:
   - Add `CertificateArn` and `PublicAppUrl` (an ACM certificate in the same region).
   - Point the hostname at the ALB, and add it to Clerk's allowed origins.
   - Set `EnableCleanupSchedule=true` only after Vercel Cron is disabled.
