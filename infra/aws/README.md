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

## Windows desktop guest credentials

OXSIG's Windows **Get Windows login** button rotates the built-in guest
Administrator password for the authenticated owner of a running, desktop-mode
lab. The application writes a randomly named, 15-minute-expiring SSM
`SecureString` parameter and passes **only its name** in SSM Run Command.
The Windows VM reads the secret itself over its instance role; only after the
guest command succeeds does the app return the credentials to the owner.

The EC2 instance profile role must have **only** the parameter read permission
in [`desktop-guest-parameter-read.policy.json`](./desktop-guest-parameter-read.policy.json).
This is separate from the Vercel app role, which owns `PutParameter` and
`DeleteParameter`. The policy must not grant `ssm:GetParametersByPath` or
`ssm:DescribeParameters`. Parameter names are unguessable (160 random bits);
they are deleted after a settled command and expire after 15 minutes as a
fallback. This shared guest role is a transitional architecture: for stronger
tenant isolation, move to per-instance role restrictions or a dedicated
credential broker before enabling untrusted customer desktop workloads.

Apply the versioned role policy **only after reviewing it**:

```bash
aws iam put-role-policy \
  --role-name oxsig-lab-ssm-role \
  --policy-name OxsigGuestDesktopCredentialRead \
  --policy-document file://infra/aws/desktop-guest-parameter-read.policy.json

aws iam get-role-policy \
  --role-name oxsig-lab-ssm-role \
  --policy-name OxsigGuestDesktopCredentialRead
```

Verify each test lab is `running`, that SSM `DescribeInstanceInformation`
reports `PingStatus=Online`, and that the PowerShell AWS Tools
`Get-SSMParameter` command is available on the Windows AMI. The app refuses
to create a credential before these AWS checks pass; a later SSM command
reported as `Undeliverable` also refuses to return a password. Do not
log guest secrets, try to recover expired passwords, or return credentials
until actual guest application has been confirmed. Verify username/password
inside the browser desktop in a controlled disposable Windows VM; stop or
terminate test machines after recording evidence.

**Ubuntu, Rocky, Kali**: The current OXSIG Linux desktop uses a non-root
`oxsig-desktop` user running XFCE + TigerVNC bound to loopback on port 5901.
The graphical desktop is already signed in, reached exclusively over the
authenticated private OXSIG SSM tunnel. It requires **no Windows-style guest
login credential**. Don't enable direct VNC network ingress or install a
blanket/root guest password to imitate Windows; separately plan a per-user
credential flow only if a future Linux login manager actually requires it.
Note: this bootstrap currently requires apt (Debian-compatible images);
Rocky Linux desktop bootstrap needs distribution support and must be tested
separately before treating it as functional.
