# Black Domain Slot 01 production-role delta

Apply these statements to the existing inline policy `OxsigProductionRuntime` on
`oxsig-production-app-role`. They deliberately authorize only the tagged reusable
Black Domain pilot slot.

Also add `ec2:DescribeReplaceRootVolumeTasks` to the existing `Ec2Read` statement.

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
enabling `LAB_AWS_BLACK_DOMAIN_PREPARED`.
