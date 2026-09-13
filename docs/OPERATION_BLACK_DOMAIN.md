# OXSIG Operation Black Domain

`Operation Black Domain` is the first automated multi-node Operation runtime. Production uses a reusable prepared environment rather than creating three fresh EC2 instances for every launch.

## Runtime topology

Slot `black-domain-slot-01` contains three permanent EC2 machines:

- Operator terminal: Ubuntu 24.04, exposed through the existing managed Cyber Lab terminal path.
- Domain controller: Windows Server 2022, configured as `blackdomain.local` with DNS.
- Workstation: Windows Server 2022, configured to use the domain controller for DNS and joined to `blackdomain.local`.

The machines are prepared ahead of time and remain stopped while the slot is available. Starting an Operation reserves the slot and starts those exact three instance IDs in parallel. The launch path never creates disposable fallback Black Domain instances.

## Safety and lifecycle

- `LAB_AWS_BLACK_DOMAIN_PREPARED=true` is required to enable Black Domain production launches.
- If the prepared flag is false or missing, launch fails closed. It does not fall back to the legacy disposable three-instance provisioner.
- The configured instance IDs must be stopped and tagged as the expected `Oxsig` reusable `OperationEnvironment` Slot 01 nodes before they can be reserved.
- Only the operator machine is represented as an interactive `lab_instances` access surface. Start, stop, and destroy actions on that access surface delegate to the whole Operation instead of manipulating the operator EC2 instance independently.
- Ordinary Cyber Lab expiry reconciliation excludes prepared rows carrying an `environmentId`, so generic lab cleanup cannot terminate a permanent reusable Operation node.
- Ending the Operation does not terminate the prepared machines. It moves the environment into reset and restores all three root volumes from the coordinated baseline snapshots.
- A reset becomes reusable only after root-volume replacement succeeds, guest readiness is verified through Systems Manager, all three machines are stopped, and the environment is marked `available`.
- A reset failure leaves the slot quarantined as `failed` rather than returning damaged state to another user.

## Scenario bootstrap and readiness

The prepared baseline already contains the configured Active Directory scenario and the low-privilege starting identity. The Ubuntu operator exposes the scenario scope in `/opt/oxsig/operation.env`.

EC2 `running` is not treated as sufficient readiness. OXSIG re-verifies Systems Manager and guest postconditions for the domain controller, workstation, and operator before the Operation is shown as ready.

## Production environment contract

General AWS Cyber Lab configuration remains required:

- `LAB_AWS_ENABLED=true`
- `LAB_AWS_REGION`
- `LAB_AWS_SUBNET_ID`
- `LAB_AWS_SECURITY_GROUP_ID`
- `LAB_AWS_INSTANCE_PROFILE`

Prepared Black Domain additionally requires:

- `LAB_AWS_BLACK_DOMAIN_PREPARED=true`
- `LAB_AWS_BLACK_DOMAIN_SLOT_KEY`
- `LAB_AWS_BLACK_DOMAIN_DC_INSTANCE_ID`
- `LAB_AWS_BLACK_DOMAIN_WORKSTATION_INSTANCE_ID`
- `LAB_AWS_BLACK_DOMAIN_OPERATOR_INSTANCE_ID`
- `LAB_AWS_BLACK_DOMAIN_DC_SNAPSHOT_ID`
- `LAB_AWS_BLACK_DOMAIN_WORKSTATION_SNAPSHOT_ID`
- `LAB_AWS_BLACK_DOMAIN_OPERATOR_SNAPSHOT_ID`
- `LAB_AWS_BLACK_DOMAIN_INITIAL_PASSWORD`

`LAB_AWS_BLACK_DOMAIN_INITIAL_PASSWORD` is a deployment secret and must never be committed.

The legacy disposable Black Domain variables `LAB_AWS_OPERATION_SECURITY_GROUP_ID`, `LAB_AWS_OPERATION_PUBLIC_IP`, `LAB_AWS_OPERATION_LINUX_INSTANCE_TYPE`, and `LAB_AWS_OPERATION_WINDOWS_INSTANCE_TYPE` are not part of the production contract for the prepared runtime.
