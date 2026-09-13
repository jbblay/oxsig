# Black Domain Slot 01 production-role delta

Apply these statements to the existing inline policy `OxsigProductionRuntime` on
`oxsig-production-app-role`. They deliberately authorize only the tagged reusable
Black Domain pilot slot and its three approved baseline snapshots.

Also add `ec2:DescribeReplaceRootVolumeTasks` to the existing `Ec2Read` statement
(`Resource: "*"`). EC2 does not expose resource-level scoping for that Describe action.

`CreateReplaceRootVolumeTask` authorizes every resource participating in the request,
not only the instance. A snapshot-backed reset therefore needs permission on the
instance, the selected snapshot, the replacement volume resource, and the replacement
task resource. Keeping the action only on `instance/*` causes the reset to fail on the
snapshot authorization check.

```json
[
  {
    "Sid": "Ec2ReusableBlackDomainLifecycle",
    "Effect": "Allow",
    "Action": [
      "ec2:StartInstances",
      "ec2:StopInstances",
      "ec2:CreateReplaceRootVolumeTask"
    ],
    "Resource": "arn:aws:ec2:eu-central-1:094525993701:instance/*",
    "Condition": {
      "StringEquals": {
        "ec2:ResourceTag/App": "Oxsig",
        "ec2:ResourceTag/Purpose": "OperationEnvironment",
        "ec2:ResourceTag/EnvironmentSlot": "black-domain-slot-01"
      }
    }
  },
  {
    "Sid": "Ec2ReusableBlackDomainRootResetResources",
    "Effect": "Allow",
    "Action": "ec2:CreateReplaceRootVolumeTask",
    "Resource": [
      "arn:aws:ec2:eu-central-1:094525993701:snapshot/snap-06debd804b7cf1d4d",
      "arn:aws:ec2:eu-central-1:094525993701:snapshot/snap-0e9a0b5c487c4543f",
      "arn:aws:ec2:eu-central-1:094525993701:snapshot/snap-07fa9e7d9715b6b84",
      "arn:aws:ec2:eu-central-1:094525993701:volume/*",
      "arn:aws:ec2:eu-central-1:094525993701:replace-root-volume-task/*"
    ]
  },
  {
    "Sid": "SsmRunCommandsOnReusableBlackDomain",
    "Effect": "Allow",
    "Action": "ssm:SendCommand",
    "Resource": "arn:aws:ec2:eu-central-1:094525993701:instance/*",
    "Condition": {
      "StringEquals": {
        "ssm:resourceTag/App": "Oxsig",
        "ssm:resourceTag/Purpose": "OperationEnvironment",
        "ssm:resourceTag/EnvironmentSlot": "black-domain-slot-01"
      }
    }
  },
  {
    "Sid": "SsmStartSessionsOnReusableBlackDomain",
    "Effect": "Allow",
    "Action": "ssm:StartSession",
    "Resource": "arn:aws:ec2:eu-central-1:094525993701:instance/*",
    "Condition": {
      "StringEquals": {
        "ssm:resourceTag/App": "Oxsig",
        "ssm:resourceTag/Purpose": "OperationEnvironment",
        "ssm:resourceTag/EnvironmentSlot": "black-domain-slot-01"
      }
    }
  }
]
```

Do not grant `TerminateInstances` for `Purpose=OperationEnvironment`.
Do not broaden the connector or use root. Apply through the existing Boss Zero
administrator path, then verify under the production application role before
enabling or re-enabling `LAB_AWS_BLACK_DOMAIN_PREPARED`.
