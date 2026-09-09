# OXSIG Operation Black Domain

`Operation Black Domain` is the first automated multi-node Operation runtime.

## Runtime topology

- Operator terminal: Ubuntu 24.04, exposed through the existing managed Cyber Lab terminal path.
- Domain controller: Windows Server 2022, promoted to `blackdomain.local` with DNS.
- Workstation: Windows Server 2022, configured to use the domain controller for DNS and joined to `blackdomain.local`.

The three EC2 instances share the configured lab subnet and a dedicated Operation security group. That group must allow all-protocol traffic from itself so DNS, LDAP, Kerberos, RPC and SMB work inside the scenario boundary without opening ordinary Cyber Labs to the Operation.

## Safety and lifecycle

- Only the operator machine is an interactive `lab_instances` allocation.
- Target nodes are tracked in `operation_nodes`; they are not directly exposed as privileged user terminals.
- Every node has an absolute expiry shutdown task and EC2 `InstanceInitiatedShutdownBehavior=terminate`.
- The scheduled cloud cleanup scans both durable Operation-node records and `Purpose=OperationNode` EC2 tags, so a node created just before a process/database failure can still be recovered and terminated by expiry.
- Ending the Operation terminates all node instance IDs together.
- Destroying the operator Cyber Lab also destroys the whole Operation, preventing target-node orphans.
- Partial provisioning failure terminates all EC2 instances already created for that run and marks the run failed.

## Scenario bootstrap

The domain controller creates ephemeral lab-only identities after AD DS promotion. The workstation waits for LDAP and then joins the domain. The operator receives scope, private target addresses, Kerberos configuration and the initial low-privilege identity in `/opt/oxsig/operation.env`.

The Operation UI reports EC2 lifecycle separately from guest bootstrap: `running` means the instances are running, not that AD promotion or domain join has necessarily finished. Guest readiness remains observable work rather than a fabricated instant-ready state.

## Deployment requirements

- `LAB_AWS_ENABLED=true`
- `LAB_AWS_SUBNET_ID`
- `LAB_AWS_INSTANCE_PROFILE`
- `LAB_AWS_OPERATION_SECURITY_GROUP_ID` (dedicated; self-referencing; no fallback to the ordinary lab group)
- AWS credentials with the same EC2/SSM permissions already required by Cyber Lab

Optional overrides:

- `LAB_AWS_OPERATION_LINUX_INSTANCE_TYPE`
- `LAB_AWS_OPERATION_WINDOWS_INSTANCE_TYPE`
- existing Ubuntu and Windows AMI override variables
