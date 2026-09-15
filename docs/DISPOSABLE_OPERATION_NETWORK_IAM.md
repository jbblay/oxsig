# Disposable Operation per-run network IAM

The disposable multi-node Operation runtime creates one security group per run, installs an all-protocol self-reference, attaches only that group to the run's instances, and deletes the group during cleanup.

Production uses the inline policy `OxsigProductionRuntime` on `oxsig-production-app-role`. The role needs the statements below in addition to the existing EC2 read, launch, lifecycle, SSM, and prepared-environment permissions.

These permissions are deliberately restricted to the OXSIG production VPC and to security groups tagged as disposable Operation-run networks.

```json
[
  {
    "Sid": "Ec2CreateDisposableOperationSecurityGroupVpc",
    "Effect": "Allow",
    "Action": "ec2:CreateSecurityGroup",
    "Resource": "arn:aws:ec2:eu-central-1:094525993701:vpc/vpc-0ec211a7157d5afc0"
  },
  {
    "Sid": "Ec2CreateDisposableOperationSecurityGroup",
    "Effect": "Allow",
    "Action": "ec2:CreateSecurityGroup",
    "Resource": "arn:aws:ec2:eu-central-1:094525993701:security-group/*",
    "Condition": {
      "StringEquals": {
        "aws:RequestTag/App": "Oxsig",
        "aws:RequestTag/Purpose": "OperationRun",
        "aws:RequestTag/Lifecycle": "Disposable"
      }
    }
  },
  {
    "Sid": "Ec2TagDisposableOperationSecurityGroupOnCreate",
    "Effect": "Allow",
    "Action": "ec2:CreateTags",
    "Resource": "arn:aws:ec2:eu-central-1:094525993701:security-group/*",
    "Condition": {
      "StringEquals": {
        "ec2:CreateAction": "CreateSecurityGroup",
        "aws:RequestTag/App": "Oxsig",
        "aws:RequestTag/Purpose": "OperationRun",
        "aws:RequestTag/Lifecycle": "Disposable"
      }
    }
  },
  {
    "Sid": "Ec2ManageDisposableOperationSecurityGroup",
    "Effect": "Allow",
    "Action": [
      "ec2:AuthorizeSecurityGroupIngress",
      "ec2:DeleteSecurityGroup"
    ],
    "Resource": "arn:aws:ec2:eu-central-1:094525993701:security-group/*",
    "Condition": {
      "StringEquals": {
        "ec2:ResourceTag/App": "Oxsig",
        "ec2:ResourceTag/Purpose": "OperationRun",
        "ec2:ResourceTag/Lifecycle": "Disposable"
      }
    }
  },
  {
    "Sid": "Ec2LaunchWithDisposableOperationSecurityGroup",
    "Effect": "Allow",
    "Action": "ec2:RunInstances",
    "Resource": "arn:aws:ec2:eu-central-1:094525993701:security-group/*",
    "Condition": {
      "StringEquals": {
        "ec2:ResourceTag/App": "Oxsig",
        "ec2:ResourceTag/Purpose": "OperationRun",
        "ec2:ResourceTag/Lifecycle": "Disposable"
      }
    }
  }
]
```

## Why the final `RunInstances` statement is required

The existing production policy authorizes `RunInstances` only against the two fixed Cyber Lab / Operation security-group ARNs. A per-run security group has a new ARN every time, so the launch request also needs permission to consume a dynamically created group. The resource-tag conditions above keep that permission limited to OXSIG disposable Operation-run groups.

## Runtime contract

The application creates the group with these required tags before launching compute:

- `App=Oxsig`
- `Purpose=OperationRun`
- `Lifecycle=Disposable`
- `OperationRunId=<run UUID>`
- `OwnerId=<owner UUID>`
- `ExpiresAt=<ISO timestamp>`

Ingress is then limited to a single all-protocol self-reference. The application does not add CIDR, IPv6, or prefix-list ingress.

If any group-creation or self-ingress authorization step is denied, provisioning fails closed. It must never fall back to the deployment-wide Operation security group.

## Validation after applying the policy

1. Launch two disposable Operation runs concurrently.
2. Confirm each run receives a different `Purpose=OperationRun` security group.
3. Confirm each group's only inbound rule is an all-protocol self-reference to itself.
4. Confirm machines inside a run can communicate over their private addresses.
5. Confirm a machine in Run A cannot reach a machine in Run B.
6. Destroy both runs and confirm their temporary security groups are deleted after instance termination.

The policy fragment above was checked with IAM Access Analyzer `ValidatePolicy` as an identity-policy document before being documented.