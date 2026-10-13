// OXSIG AWS platform stack (CloudFormation), authored as code and emitted as JSON.
//
//   node infra/aws/template.mjs > infra/aws/oxsig-platform.template.json
//
// Design constraints (see docs/aws-migration.md):
// - Prepared independently of production: DesiredCount defaults to 0, so the
//   stack can be created without serving traffic and without app secrets.
// - No NAT gateway (~$35+/month): Fargate tasks run in public subnets with a
//   public IP, reachable only from the ALB security group.
// - RDS is private (not publicly accessible), encrypted, backed up, and only
//   reachable from the app and an optional migration/bastion security group.
// - Secrets are never template values: the app secret is created empty-shaped
//   and populated by the operator; ECS reads keys from it at task start.
// - Gross-cost budget (credits excluded) so credit burn is visible.

const ref = (name) => ({ Ref: name });
const getAtt = (resource, attribute) => ({ 'Fn::GetAtt': [resource, attribute] });
const sub = (text) => ({ 'Fn::Sub': text });
const ifCond = (condition, whenTrue, whenFalse) => ({ 'Fn::If': [condition, whenTrue, whenFalse] });
const noValue = { Ref: 'AWS::NoValue' };
const tags = (name) => [
  { Key: 'Name', Value: sub(`oxsig-\${Environment}-${name}`) },
  { Key: 'oxsig:environment', Value: ref('Environment') },
  { Key: 'oxsig:managed-by', Value: 'cloudformation' },
];

/** Generated at stack creation (>= 32 chars, required by the terminal bridge). */
const GENERATED_SECRET_KEY = 'OXSIG_TERMINAL_BRIDGE_SECRET';

/** Keys the operator must store in the app secret (JSON) before scaling up. */
export const APP_SECRET_KEYS = [
  'DATABASE_URL',
  'CLERK_SECRET_KEY',
  'CLERK_WEBHOOK_SIGNING_SECRET',
  'CRON_SECRET',
  'OXSIG_TERMINAL_BRIDGE_SECRET',
  'ABLY_API_KEY',
  'OPENAI_API_KEY',
  'ELEVENLABS_API_KEY',
  'RESEND_API_KEY',
  'SENTRY_DSN',
  'POSTHOG_PROJECT_TOKEN',
  'LAB_AWS_BLACK_DOMAIN_INITIAL_PASSWORD',
];

const parameters = {
  Environment: { Type: 'String', AllowedValues: ['staging', 'production'], Default: 'staging' },
  VpcId: { Type: 'AWS::EC2::VPC::Id', Description: 'VPC for the platform (the default VPC is acceptable).' },
  PublicSubnetIds: { Type: 'List<AWS::EC2::Subnet::Id>', Description: 'At least two public subnets in different AZs (ALB + Fargate).' },
  DatabaseSubnetIds: { Type: 'List<AWS::EC2::Subnet::Id>', Description: 'At least two subnets in different AZs for RDS (private preferred).' },
  ContainerImage: { Type: 'String', Default: '', Description: 'ECR image URI. Leave empty until the first image is pushed (service stays at 0 tasks).' },
  DesiredCount: { Type: 'Number', Default: 0, MinValue: 0, MaxValue: 10, Description: 'Keep 0 until secrets are populated and the image is verified.' },
  TaskCpu: { Type: 'String', Default: '512', AllowedValues: ['256', '512', '1024', '2048'] },
  TaskMemory: { Type: 'String', Default: '1024', AllowedValues: ['512', '1024', '2048', '3072', '4096'] },
  CertificateArn: { Type: 'String', Default: '', Description: 'ACM certificate for the public hostname (same region). Empty = HTTP-only listener for internal testing.' },
  PublicAppUrl: { Type: 'String', Default: '', Description: 'Public origin, e.g. https://staging.oxsig.example (OXSIG_APP_URL).' },
  DbInstanceClass: { Type: 'String', Default: 'db.t4g.micro' },
  DbAllocatedStorage: { Type: 'Number', Default: 20, MinValue: 20, MaxValue: 1000 },
  DbMultiAz: { Type: 'String', AllowedValues: ['true', 'false'], Default: 'false' },
  DbEngineVersion: { Type: 'String', Default: '18.6', Description: 'Full RDS PostgreSQL version; match Neon 18.6 for forward-compatible migration.' },
  DbParameterFamily: { Type: 'String', Default: 'postgres18', Description: 'RDS DB parameter group family corresponding to DbEngineVersion.' },
  StorageBucketName: { Type: 'String', Description: 'Existing OXSIG uploads bucket (STORAGE_BUCKET).' },
  StorageRegion: { Type: 'String', Default: 'eu-central-1' },
  LabRuntimePolicyArn: { Type: 'String', Default: '', Description: 'Existing managed policy with the EC2/SSM lab permissions currently granted to the Vercel OIDC role.' },
  LabAwsEnabled: { Type: 'String', AllowedValues: ['true', 'false'], Default: 'false' },
  AiProvider: { Type: 'String', AllowedValues: ['openai', 'bedrock'], Default: 'openai' },
  AiFallbackProvider: { Type: 'String', AllowedValues: ['', 'openai', 'bedrock'], Default: 'openai' },
  BedrockModelId: { Type: 'String', Default: '', Description: 'Bedrock model or inference profile id enabled in this account.' },
  EmailProvider: { Type: 'String', AllowedValues: ['resend', 'ses'], Default: 'resend' },
  EmailFrom: { Type: 'String', Default: '' },
  VoiceTtsProvider: { Type: 'String', AllowedValues: ['elevenlabs', 'polly'], Default: 'elevenlabs' },
  VoiceTtsFallbackProvider: { Type: 'String', AllowedValues: ['', 'elevenlabs', 'polly'], Default: '' },
  VoicePollyRegion: { Type: 'String', Default: 'eu-central-1' },
  VoicePollyVoiceId: { Type: 'String', Default: 'Joanna' },
  VoicePollyEngine: { Type: 'String', AllowedValues: ['standard', 'neural', 'generative'], Default: 'neural' },
  SesIdentityDomain: { Type: 'String', Default: '', Description: 'Optional domain to create as an SES identity (DKIM records are output; DNS is not changed).' },
  EnableCleanupSchedule: { Type: 'String', AllowedValues: ['true', 'false'], Default: 'false', Description: 'Enable only after CRON_SECRET is stored and Vercel cron is disabled.' },
  AlarmEmail: { Type: 'String', Default: '', Description: 'Receives alarms and budget alerts.' },
  MonthlyBudgetUsd: { Type: 'Number', Default: 150, MinValue: 1 },
  LogRetentionDays: { Type: 'Number', Default: 30, AllowedValues: [7, 14, 30, 60, 90, 180, 365] },
};

const conditions = {
  IsProduction: { 'Fn::Equals': [ref('Environment'), 'production'] },
  HasImage: { 'Fn::Not': [{ 'Fn::Equals': [ref('ContainerImage'), ''] }] },
  HasCertificate: { 'Fn::Not': [{ 'Fn::Equals': [ref('CertificateArn'), ''] }] },
  HasLabPolicy: { 'Fn::Not': [{ 'Fn::Equals': [ref('LabRuntimePolicyArn'), ''] }] },
  HasSesDomain: { 'Fn::Not': [{ 'Fn::Equals': [ref('SesIdentityDomain'), ''] }] },
  HasAlarmEmail: { 'Fn::Not': [{ 'Fn::Equals': [ref('AlarmEmail'), ''] }] },
  MultiAzDb: { 'Fn::Equals': [ref('DbMultiAz'), 'true'] },
  CleanupScheduleEnabled: {
    'Fn::And': [
      { 'Fn::Equals': [ref('EnableCleanupSchedule'), 'true'] },
      { 'Fn::Not': [{ 'Fn::Equals': [ref('PublicAppUrl'), ''] }] },
    ],
  },
};

const appSecretRef = (key) => ({ Name: key, ValueFrom: sub(`\${AppSecret}:${key}::`) });

const resources = {
  // ---------------------------------------------------------------- networking
  AlbSecurityGroup: {
    Type: 'AWS::EC2::SecurityGroup',
    Properties: {
      GroupDescription: 'OXSIG ALB: public HTTPS/HTTP',
      VpcId: ref('VpcId'),
      SecurityGroupIngress: [
        { IpProtocol: 'tcp', FromPort: 443, ToPort: 443, CidrIp: '0.0.0.0/0' },
        { IpProtocol: 'tcp', FromPort: 80, ToPort: 80, CidrIp: '0.0.0.0/0' },
      ],
      Tags: tags('alb'),
    },
  },
  AppSecurityGroup: {
    Type: 'AWS::EC2::SecurityGroup',
    Properties: {
      GroupDescription: 'OXSIG app tasks: only reachable from the ALB',
      VpcId: ref('VpcId'),
      SecurityGroupIngress: [
        { IpProtocol: 'tcp', FromPort: 3000, ToPort: 3000, SourceSecurityGroupId: ref('AlbSecurityGroup') },
      ],
      Tags: tags('app'),
    },
  },
  DatabaseSecurityGroup: {
    Type: 'AWS::EC2::SecurityGroup',
    Properties: {
      GroupDescription: 'OXSIG PostgreSQL: only reachable from app tasks and migration tasks',
      VpcId: ref('VpcId'),
      SecurityGroupIngress: [
        { IpProtocol: 'tcp', FromPort: 5432, ToPort: 5432, SourceSecurityGroupId: ref('AppSecurityGroup') },
      ],
      Tags: tags('db'),
    },
  },

  // ------------------------------------------------------------------ secrets
  // Created once with placeholder keys plus a generated terminal-bridge secret.
  // Values are managed in Secrets Manager, never in this template. Do not
  // change these properties after creation (an update could rewrite values);
  // Retain policies protect the secret from stack deletion/replacement.
  AppSecret: {
    Type: 'AWS::SecretsManager::Secret',
    DeletionPolicy: 'Retain',
    UpdateReplacePolicy: 'Retain',
    Properties: {
      Name: sub('oxsig/${Environment}/app'),
      Description: `OXSIG runtime secrets (JSON). Required keys: ${APP_SECRET_KEYS.join(', ')}. Populate before raising DesiredCount.`,
      GenerateSecretString: {
        SecretStringTemplate: JSON.stringify(Object.fromEntries(
          APP_SECRET_KEYS.filter((key) => key !== GENERATED_SECRET_KEY).map((key) => [key, ''])
        )),
        GenerateStringKey: GENERATED_SECRET_KEY,
        PasswordLength: 48,
        ExcludePunctuation: true,
      },
      Tags: tags('app-secret'),
    },
  },

  // ----------------------------------------------------------------- database
  DatabaseSubnetGroup: {
    Type: 'AWS::RDS::DBSubnetGroup',
    Properties: {
      DBSubnetGroupDescription: 'OXSIG PostgreSQL subnets',
      SubnetIds: ref('DatabaseSubnetIds'),
      Tags: tags('db-subnets'),
    },
  },
  DatabaseParameterGroup: {
    Type: 'AWS::RDS::DBParameterGroup',
    Properties: {
      Description: 'OXSIG PostgreSQL parameters',
      Family: ref('DbParameterFamily'),
      Parameters: {
        'rds.force_ssl': '1',
        log_min_duration_statement: '1000',
      },
      Tags: tags('db-params'),
    },
  },
  Database: {
    Type: 'AWS::RDS::DBInstance',
    DeletionPolicy: 'Snapshot',
    UpdateReplacePolicy: 'Snapshot',
    Properties: {
      DBInstanceIdentifier: sub('oxsig-${Environment}'),
      Engine: 'postgres',
      EngineVersion: ref('DbEngineVersion'),
      DBInstanceClass: ref('DbInstanceClass'),
      AllocatedStorage: ref('DbAllocatedStorage'),
      MaxAllocatedStorage: 200,
      StorageType: 'gp3',
      StorageEncrypted: true,
      MultiAZ: ifCond('MultiAzDb', true, false),
      DBName: 'oxsig',
      MasterUsername: 'oxsig_admin',
      ManageMasterUserPassword: true,
      DBSubnetGroupName: ref('DatabaseSubnetGroup'),
      DBParameterGroupName: ref('DatabaseParameterGroup'),
      VPCSecurityGroups: [ref('DatabaseSecurityGroup')],
      PubliclyAccessible: false,
      BackupRetentionPeriod: ifCond('IsProduction', 14, 7),
      PreferredBackupWindow: '01:00-01:30',
      PreferredMaintenanceWindow: 'sun:03:00-sun:03:30',
      DeletionProtection: ifCond('IsProduction', true, false),
      CopyTagsToSnapshot: true,
      AutoMinorVersionUpgrade: true,
      Tags: tags('db'),
    },
  },

  // ---------------------------------------------------------- container image
  Repository: {
    Type: 'AWS::ECR::Repository',
    Properties: {
      RepositoryName: sub('oxsig-${Environment}'),
      ImageTagMutability: 'IMMUTABLE',
      ImageScanningConfiguration: { ScanOnPush: true },
      EncryptionConfiguration: { EncryptionType: 'AES256' },
      LifecyclePolicy: {
        LifecyclePolicyText: JSON.stringify({
          rules: [{ rulePriority: 1, description: 'Keep the 20 most recent images', selection: { tagStatus: 'any', countType: 'imageCountMoreThan', countNumber: 20 }, action: { type: 'expire' } }],
        }),
      },
      Tags: tags('ecr'),
    },
  },

  // ------------------------------------------------------------- observability
  LogGroup: {
    Type: 'AWS::Logs::LogGroup',
    Properties: {
      LogGroupName: sub('/oxsig/${Environment}/app'),
      RetentionInDays: ref('LogRetentionDays'),
      Tags: tags('logs'),
    },
  },
  AlarmTopic: {
    Type: 'AWS::SNS::Topic',
    Properties: {
      TopicName: sub('oxsig-${Environment}-alarms'),
      KmsMasterKeyId: 'alias/aws/sns',
      Subscription: ifCond('HasAlarmEmail', [{ Protocol: 'email', Endpoint: ref('AlarmEmail') }], noValue),
      Tags: tags('alarms'),
    },
  },

  // -------------------------------------------------------------------- IAM
  TaskExecutionRole: {
    Type: 'AWS::IAM::Role',
    Properties: {
      AssumeRolePolicyDocument: {
        Version: '2012-10-17',
        Statement: [{ Effect: 'Allow', Principal: { Service: 'ecs-tasks.amazonaws.com' }, Action: 'sts:AssumeRole' }],
      },
      ManagedPolicyArns: ['arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy'],
      Policies: [{
        PolicyName: 'read-app-secret',
        PolicyDocument: {
          Version: '2012-10-17',
          Statement: [{ Effect: 'Allow', Action: ['secretsmanager:GetSecretValue'], Resource: ref('AppSecret') }],
        },
      }],
      Tags: tags('task-execution-role'),
    },
  },
  TaskRole: {
    Type: 'AWS::IAM::Role',
    Properties: {
      AssumeRolePolicyDocument: {
        Version: '2012-10-17',
        Statement: [{ Effect: 'Allow', Principal: { Service: 'ecs-tasks.amazonaws.com' }, Action: 'sts:AssumeRole' }],
      },
      ManagedPolicyArns: ifCond('HasLabPolicy', [ref('LabRuntimePolicyArn')], noValue),
      Policies: [{
        PolicyName: 'oxsig-app',
        PolicyDocument: {
          Version: '2012-10-17',
          Statement: [
            {
              Sid: 'UserStorage',
              Effect: 'Allow',
              Action: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject'],
              Resource: sub('arn:${AWS::Partition}:s3:::${StorageBucketName}/*'),
            },
            {
              Sid: 'UserStorageList',
              Effect: 'Allow',
              Action: ['s3:ListBucket'],
              Resource: sub('arn:${AWS::Partition}:s3:::${StorageBucketName}'),
            },
            {
              Sid: 'GenerativeAi',
              Effect: 'Allow',
              Action: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
              Resource: [
                sub('arn:${AWS::Partition}:bedrock:*::foundation-model/*'),
                sub('arn:${AWS::Partition}:bedrock:*:${AWS::AccountId}:inference-profile/*'),
              ],
            },
            {
              Sid: 'VoiceSynthesis',
              Effect: 'Allow',
              Action: ['polly:SynthesizeSpeech'],
              Resource: '*',
            },
            {
              Sid: 'TransactionalEmail',
              Effect: 'Allow',
              Action: ['ses:SendEmail'],
              Resource: '*',
              Condition: { StringEquals: { 'ses:ApiVersion': '2' } },
            },
          ],
        },
      }],
      Tags: tags('task-role'),
    },
  },

  // ---------------------------------------------------------------- compute
  Cluster: {
    Type: 'AWS::ECS::Cluster',
    Properties: {
      ClusterName: sub('oxsig-${Environment}'),
      ClusterSettings: [{ Name: 'containerInsights', Value: 'disabled' }],
      Tags: tags('cluster'),
    },
  },
  TaskDefinition: {
    Type: 'AWS::ECS::TaskDefinition',
    Properties: {
      Family: sub('oxsig-${Environment}-app'),
      RequiresCompatibilities: ['FARGATE'],
      NetworkMode: 'awsvpc',
      Cpu: ref('TaskCpu'),
      Memory: ref('TaskMemory'),
      RuntimePlatform: { CpuArchitecture: 'ARM64', OperatingSystemFamily: 'LINUX' },
      ExecutionRoleArn: getAtt('TaskExecutionRole', 'Arn'),
      TaskRoleArn: getAtt('TaskRole', 'Arn'),
      ContainerDefinitions: [{
        Name: 'app',
        Image: ifCond('HasImage', ref('ContainerImage'), 'public.ecr.aws/docker/library/node:22-bookworm-slim'),
        Essential: true,
        PortMappings: [{ ContainerPort: 3000, Protocol: 'tcp' }],
        StopTimeout: 60,
        Environment: [
          { Name: 'NODE_ENV', Value: 'production' },
          { Name: 'OXSIG_DEPLOY_ENV', Value: ref('Environment') },
          { Name: 'OXSIG_APP_URL', Value: ref('PublicAppUrl') },
          { Name: 'ALLOWED_ORIGINS', Value: ref('PublicAppUrl') },
          { Name: 'AWS_REGION', Value: ref('AWS::Region') },
          { Name: 'STORAGE_BUCKET', Value: ref('StorageBucketName') },
          { Name: 'STORAGE_REGION', Value: ref('StorageRegion') },
          { Name: 'LAB_AWS_ENABLED', Value: ref('LabAwsEnabled') },
          { Name: 'OXSIG_AI_PROVIDER', Value: ref('AiProvider') },
          { Name: 'OXSIG_AI_FALLBACK_PROVIDER', Value: ref('AiFallbackProvider') },
          { Name: 'OXSIG_BEDROCK_MODEL_ID', Value: ref('BedrockModelId') },
          { Name: 'OXSIG_EMAIL_PROVIDER', Value: ref('EmailProvider') },
          { Name: 'EMAIL_FROM', Value: ref('EmailFrom') },
          { Name: 'OXSIG_VOICE_TTS_PROVIDER', Value: ref('VoiceTtsProvider') },
          { Name: 'OXSIG_VOICE_TTS_FALLBACK_PROVIDER', Value: ref('VoiceTtsFallbackProvider') },
          { Name: 'OXSIG_POLLY_REGION', Value: ref('VoicePollyRegion') },
          { Name: 'OXSIG_POLLY_VOICE_ID', Value: ref('VoicePollyVoiceId') },
          { Name: 'OXSIG_POLLY_ENGINE', Value: ref('VoicePollyEngine') },
          { Name: 'SES_CONFIGURATION_SET', Value: ifCond('HasSesDomain', ref('SesConfigurationSet'), '') },
        ],
        Secrets: APP_SECRET_KEYS.map(appSecretRef),
        LogConfiguration: {
          LogDriver: 'awslogs',
          Options: {
            'awslogs-group': ref('LogGroup'),
            'awslogs-region': ref('AWS::Region'),
            'awslogs-stream-prefix': 'app',
          },
        },
      }],
      Tags: tags('task'),
    },
  },

  // ------------------------------------------------------------ load balancer
  LoadBalancer: {
    Type: 'AWS::ElasticLoadBalancingV2::LoadBalancer',
    Properties: {
      Name: sub('oxsig-${Environment}'),
      Scheme: 'internet-facing',
      Type: 'application',
      Subnets: ref('PublicSubnetIds'),
      SecurityGroups: [ref('AlbSecurityGroup')],
      LoadBalancerAttributes: [
        // Terminal/desktop bridge WebSockets are long-lived; the bridge pings every 5 minutes.
        { Key: 'idle_timeout.timeout_seconds', Value: '3600' },
        { Key: 'routing.http.drop_invalid_header_fields.enabled', Value: 'true' },
        { Key: 'deletion_protection.enabled', Value: ifCond('IsProduction', 'true', 'false') },
      ],
      Tags: tags('alb'),
    },
  },
  TargetGroup: {
    Type: 'AWS::ElasticLoadBalancingV2::TargetGroup',
    Properties: {
      Name: sub('oxsig-${Environment}-app'),
      VpcId: ref('VpcId'),
      TargetType: 'ip',
      Protocol: 'HTTP',
      Port: 3000,
      HealthCheckPath: '/api/health',
      HealthCheckIntervalSeconds: 15,
      HealthyThresholdCount: 2,
      UnhealthyThresholdCount: 3,
      Matcher: { HttpCode: '200' },
      TargetGroupAttributes: [
        // Give in-flight terminal sessions time to finish during deployments.
        { Key: 'deregistration_delay.timeout_seconds', Value: '120' },
      ],
      Tags: tags('tg'),
    },
  },
  // Conditional dependency shim: the service must wait for whichever listener
  // forwards to the target group (DependsOn cannot be conditional).
  ListenerReady: {
    Type: 'AWS::CloudFormation::WaitConditionHandle',
    Metadata: { Listener: ifCond('HasCertificate', ref('HttpsListener'), ref('HttpListener')) },
  },
  HttpsListener: {
    Type: 'AWS::ElasticLoadBalancingV2::Listener',
    Condition: 'HasCertificate',
    Properties: {
      LoadBalancerArn: ref('LoadBalancer'),
      Port: 443,
      Protocol: 'HTTPS',
      SslPolicy: 'ELBSecurityPolicy-TLS13-1-2-2021-06',
      Certificates: [{ CertificateArn: ref('CertificateArn') }],
      DefaultActions: [{ Type: 'forward', TargetGroupArn: ref('TargetGroup') }],
    },
  },
  HttpListener: {
    Type: 'AWS::ElasticLoadBalancingV2::Listener',
    Properties: {
      LoadBalancerArn: ref('LoadBalancer'),
      Port: 80,
      Protocol: 'HTTP',
      DefaultActions: ifCond(
        'HasCertificate',
        [{ Type: 'redirect', RedirectConfig: { Protocol: 'HTTPS', Port: '443', StatusCode: 'HTTP_301' } }],
        [{ Type: 'forward', TargetGroupArn: ref('TargetGroup') }]
      ),
    },
  },
  Service: {
    Type: 'AWS::ECS::Service',
    DependsOn: ['ListenerReady'],
    Properties: {
      ServiceName: 'app',
      Cluster: ref('Cluster'),
      LaunchType: 'FARGATE',
      TaskDefinition: ref('TaskDefinition'),
      DesiredCount: ifCond('HasImage', ref('DesiredCount'), 0),
      HealthCheckGracePeriodSeconds: 90,
      DeploymentConfiguration: {
        MinimumHealthyPercent: 100,
        MaximumPercent: 200,
        DeploymentCircuitBreaker: { Enable: true, Rollback: true },
      },
      NetworkConfiguration: {
        AwsvpcConfiguration: {
          AssignPublicIp: 'ENABLED',
          Subnets: ref('PublicSubnetIds'),
          SecurityGroups: [ref('AppSecurityGroup')],
        },
      },
      LoadBalancers: [{ ContainerName: 'app', ContainerPort: 3000, TargetGroupArn: ref('TargetGroup') }],
      PropagateTags: 'SERVICE',
      Tags: tags('service'),
    },
  },

  // ------------------------------------------------------------------- alarms
  AlbServerErrorsAlarm: {
    Type: 'AWS::CloudWatch::Alarm',
    Properties: {
      AlarmDescription: 'OXSIG: elevated 5xx responses from app targets',
      Namespace: 'AWS/ApplicationELB',
      MetricName: 'HTTPCode_Target_5XX_Count',
      Dimensions: [{ Name: 'LoadBalancer', Value: getAtt('LoadBalancer', 'LoadBalancerFullName') }],
      Statistic: 'Sum',
      Period: 300,
      EvaluationPeriods: 1,
      Threshold: 10,
      ComparisonOperator: 'GreaterThanOrEqualToThreshold',
      TreatMissingData: 'notBreaching',
      AlarmActions: [ref('AlarmTopic')],
      OKActions: [ref('AlarmTopic')],
    },
  },
  UnhealthyTargetsAlarm: {
    Type: 'AWS::CloudWatch::Alarm',
    Properties: {
      AlarmDescription: 'OXSIG: app targets failing /api/health',
      Namespace: 'AWS/ApplicationELB',
      MetricName: 'UnHealthyHostCount',
      Dimensions: [
        { Name: 'LoadBalancer', Value: getAtt('LoadBalancer', 'LoadBalancerFullName') },
        { Name: 'TargetGroup', Value: getAtt('TargetGroup', 'TargetGroupFullName') },
      ],
      Statistic: 'Maximum',
      Period: 60,
      EvaluationPeriods: 3,
      Threshold: 1,
      ComparisonOperator: 'GreaterThanOrEqualToThreshold',
      TreatMissingData: 'notBreaching',
      AlarmActions: [ref('AlarmTopic')],
      OKActions: [ref('AlarmTopic')],
    },
  },
  LatencyAlarm: {
    Type: 'AWS::CloudWatch::Alarm',
    Properties: {
      AlarmDescription: 'OXSIG: p95 target response time above 2s',
      Namespace: 'AWS/ApplicationELB',
      MetricName: 'TargetResponseTime',
      Dimensions: [{ Name: 'LoadBalancer', Value: getAtt('LoadBalancer', 'LoadBalancerFullName') }],
      ExtendedStatistic: 'p95',
      Period: 300,
      EvaluationPeriods: 2,
      Threshold: 2,
      ComparisonOperator: 'GreaterThanThreshold',
      TreatMissingData: 'notBreaching',
      AlarmActions: [ref('AlarmTopic')],
    },
  },
  DatabaseCpuAlarm: {
    Type: 'AWS::CloudWatch::Alarm',
    Properties: {
      AlarmDescription: 'OXSIG: database CPU above 80%',
      Namespace: 'AWS/RDS',
      MetricName: 'CPUUtilization',
      Dimensions: [{ Name: 'DBInstanceIdentifier', Value: ref('Database') }],
      Statistic: 'Average',
      Period: 300,
      EvaluationPeriods: 3,
      Threshold: 80,
      ComparisonOperator: 'GreaterThanThreshold',
      AlarmActions: [ref('AlarmTopic')],
    },
  },
  DatabaseStorageAlarm: {
    Type: 'AWS::CloudWatch::Alarm',
    Properties: {
      AlarmDescription: 'OXSIG: database free storage below 2 GiB',
      Namespace: 'AWS/RDS',
      MetricName: 'FreeStorageSpace',
      Dimensions: [{ Name: 'DBInstanceIdentifier', Value: ref('Database') }],
      Statistic: 'Minimum',
      Period: 300,
      EvaluationPeriods: 1,
      Threshold: 2147483648,
      ComparisonOperator: 'LessThanThreshold',
      AlarmActions: [ref('AlarmTopic')],
    },
  },
  DatabaseConnectionsAlarm: {
    Type: 'AWS::CloudWatch::Alarm',
    Properties: {
      AlarmDescription: 'OXSIG: database connections above 70 (pool max is 12 per task)',
      Namespace: 'AWS/RDS',
      MetricName: 'DatabaseConnections',
      Dimensions: [{ Name: 'DBInstanceIdentifier', Value: ref('Database') }],
      Statistic: 'Maximum',
      Period: 300,
      EvaluationPeriods: 2,
      Threshold: 70,
      ComparisonOperator: 'GreaterThanThreshold',
      AlarmActions: [ref('AlarmTopic')],
    },
  },

  // -------------------------------------------------------------------- FinOps
  MonthlyBudget: {
    Type: 'AWS::Budgets::Budget',
    Properties: {
      Budget: {
        // Account-wide on purpose: Activate credits and lab EC2 spend are account-level.
        BudgetName: sub('oxsig-${Environment}-account-monthly-gross'),
        BudgetType: 'COST',
        TimeUnit: 'MONTHLY',
        BudgetLimit: { Amount: ref('MonthlyBudgetUsd'), Unit: 'USD' },
        // Gross usage: promotional credits are excluded so credit burn is visible.
        CostTypes: { IncludeCredit: false, IncludeRefund: false, IncludeTax: true, IncludeSupport: false },
      },
      NotificationsWithSubscribers: ifCond('HasAlarmEmail', [50, 80, 100].map((threshold) => ({
        Notification: { NotificationType: threshold === 100 ? 'FORECASTED' : 'ACTUAL', ComparisonOperator: 'GREATER_THAN', Threshold: threshold, ThresholdType: 'PERCENTAGE' },
        Subscribers: [{ SubscriptionType: 'EMAIL', Address: ref('AlarmEmail') }],
      })), noValue),
    },
  },

  // ------------------------------------------------------------------- email
  SesConfigurationSet: {
    Type: 'AWS::SES::ConfigurationSet',
    Condition: 'HasSesDomain',
    Properties: {
      Name: sub('oxsig-${Environment}'),
      ReputationOptions: { ReputationMetricsEnabled: true },
      SendingOptions: { SendingEnabled: true },
      SuppressionOptions: { SuppressedReasons: ['BOUNCE', 'COMPLAINT'] },
    },
  },
  SesIdentity: {
    Type: 'AWS::SES::EmailIdentity',
    Condition: 'HasSesDomain',
    Properties: {
      EmailIdentity: ref('SesIdentityDomain'),
      ConfigurationSetAttributes: { ConfigurationSetName: ref('SesConfigurationSet') },
      DkimSigningAttributes: { NextSigningKeyLength: 'RSA_2048_BIT' },
    },
  },

  // --------------------------------------------------------- scheduled cleanup
  CleanupConnection: {
    Type: 'AWS::Events::Connection',
    Condition: 'CleanupScheduleEnabled',
    Properties: {
      Description: 'Bearer CRON_SECRET for /api/internal/labs/cleanup',
      AuthorizationType: 'API_KEY',
      AuthParameters: {
        ApiKeyAuthParameters: {
          ApiKeyName: 'Authorization',
          ApiKeyValue: sub('Bearer {{resolve:secretsmanager:${AppSecret}:SecretString:CRON_SECRET}}'),
        },
      },
    },
  },
  CleanupDestination: {
    Type: 'AWS::Events::ApiDestination',
    Condition: 'CleanupScheduleEnabled',
    Properties: {
      ConnectionArn: getAtt('CleanupConnection', 'Arn'),
      InvocationEndpoint: sub('${PublicAppUrl}/api/internal/labs/cleanup'),
      HttpMethod: 'GET',
      InvocationRateLimitPerSecond: 1,
    },
  },
  CleanupInvokeRole: {
    Type: 'AWS::IAM::Role',
    Condition: 'CleanupScheduleEnabled',
    Properties: {
      AssumeRolePolicyDocument: {
        Version: '2012-10-17',
        Statement: [{ Effect: 'Allow', Principal: { Service: 'events.amazonaws.com' }, Action: 'sts:AssumeRole' }],
      },
      Policies: [{
        PolicyName: 'invoke-cleanup',
        PolicyDocument: {
          Version: '2012-10-17',
          Statement: [{ Effect: 'Allow', Action: 'events:InvokeApiDestination', Resource: getAtt('CleanupDestination', 'Arn') }],
        },
      }],
    },
  },
  CleanupRule: {
    Type: 'AWS::Events::Rule',
    Condition: 'CleanupScheduleEnabled',
    Properties: {
      Description: 'Daily lab expiry cleanup (replaces the vercel.json cron 17 2 * * *)',
      ScheduleExpression: 'cron(17 2 * * ? *)',
      State: 'ENABLED',
      Targets: [{
        Id: 'cleanup',
        Arn: getAtt('CleanupDestination', 'Arn'),
        RoleArn: getAtt('CleanupInvokeRole', 'Arn'),
        RetryPolicy: { MaximumRetryAttempts: 3, MaximumEventAgeInSeconds: 3600 },
      }],
    },
  },
};

const outputs = {
  LoadBalancerDnsName: { Description: 'Point a staging hostname here (DNS is not changed by this stack).', Value: getAtt('LoadBalancer', 'DNSName') },
  DatabaseEndpoint: { Value: getAtt('Database', 'Endpoint.Address') },
  DatabaseMasterSecretArn: { Description: 'RDS-managed master credentials (rotate-able). Build DATABASE_URL from it.', Value: getAtt('Database', 'MasterUserSecret.SecretArn') },
  AppSecretArn: { Value: ref('AppSecret') },
  RepositoryUri: { Value: getAtt('Repository', 'RepositoryUri') },
  ClusterName: { Value: ref('Cluster') },
  ServiceName: { Value: getAtt('Service', 'Name') },
  TaskDefinitionArn: { Value: ref('TaskDefinition') },
  AppSecurityGroupId: { Description: 'Use for one-off migration tasks (ecs run-task).', Value: ref('AppSecurityGroup') },
  LogGroupName: { Value: ref('LogGroup') },
  SesDkimRecords: {
    Condition: 'HasSesDomain',
    Description: 'Add these three CNAMEs at your DNS provider to verify the SES domain.',
    Value: {
      'Fn::Join': [', ', [
        getAtt('SesIdentity', 'DkimDNSTokenName1'),
        getAtt('SesIdentity', 'DkimDNSTokenName2'),
        getAtt('SesIdentity', 'DkimDNSTokenName3'),
      ]],
    },
  },
};

export const template = {
  AWSTemplateFormatVersion: '2010-09-09',
  Description: 'OXSIG AWS platform: ECS Fargate (ARM64) + ALB, RDS PostgreSQL, Secrets Manager, ECR, CloudWatch alarms, gross-cost budget, optional SES and EventBridge cleanup schedule.',
  Parameters: parameters,
  Conditions: conditions,
  Resources: resources,
  Outputs: outputs,
};

if (import.meta.url === `file://${process.argv[1]}`) {
  process.stdout.write(`${JSON.stringify(template, null, 2)}\n`);
}
