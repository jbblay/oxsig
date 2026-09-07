import type { AcademyCourse } from '@/lib/academy/types';

export const PROGRAM_PROCESS_PATH_ID = 'program-becomes-process';
export const PROGRAM_PROCESS_PATH_VERSION = 1;
export const PROGRAM_PROCESS_SOURCE_PROMPT = `OXSIG curated path:${PROGRAM_PROCESS_PATH_ID}@${PROGRAM_PROCESS_PATH_VERSION}`;

export type ProgramProcessCapability = {
  id: string;
  title: string;
  outcome: string;
  evidence: string;
  practiceLabel: string;
};

export const PROGRAM_PROCESS_CAPABILITIES: ProgramProcessCapability[] = [
  {
    id: 'command-resolution',
    title: 'From command to executable',
    outcome: 'Explain how a shell resolves a command and identifies the executable that will be launched.',
    evidence: 'Resolve a real command, identify the executable behind it, and explain what the shell has established before process creation.',
    practiceLabel: 'Inspect command resolution',
  },
  {
    id: 'fork-copy-on-write',
    title: 'fork() and copy-on-write',
    outcome: 'Explain parent/child creation, fork return values, inherited process context, and copy-on-write memory behavior.',
    evidence: 'Predict and observe parent/child PIDs, then explain why separate virtual address spaces do not imply an immediate full physical-memory copy.',
    practiceLabel: 'Observe a real fork',
  },
  {
    id: 'execve-elf',
    title: 'execve() and the ELF image',
    outcome: 'Explain that execve replaces the calling process image and how the kernel uses an ELF executable to establish the new image.',
    evidence: 'Inspect the executable associated with a running process and explain what changes—and what does not—across execve.',
    practiceLabel: 'Inspect the executable image',
  },
  {
    id: 'virtual-address-space',
    title: 'The process virtual address space',
    outcome: 'Explain executable mappings, shared libraries, heap, stack, and other mappings as a process-visible virtual address space.',
    evidence: 'Inspect /proc mappings for a live process and correctly identify major mapping roles without treating virtual addresses as direct physical addresses.',
    practiceLabel: 'Inspect /proc/<pid>/maps',
  },
  {
    id: 'runtime-startup',
    title: 'From entry point to main()',
    outcome: 'Explain the handoff from the executable entry point through runtime startup to the program main function.',
    evidence: 'Connect ELF entry, _start/runtime initialization, and main() in the correct order and explain why main is not the kernel entry point.',
    practiceLabel: 'Inspect startup metadata',
  },
  {
    id: 'process-context',
    title: 'File descriptors, environment, and inherited context',
    outcome: 'Explain how open file descriptors and environment state participate in process creation and program execution.',
    evidence: 'Inspect a live process descriptor table and environment, then explain inheritance and the effect of redirection or close-on-exec behavior.',
    practiceLabel: 'Inspect descriptors and environment',
  },
  {
    id: 'syscalls-scheduling',
    title: 'System calls, kernel transitions, and scheduling',
    outcome: 'Explain how a user-space process requests kernel services and moves between running, runnable, and blocked states.',
    evidence: 'Relate a real process state to the work it is doing and explain why a process can exist without currently executing on a CPU.',
    practiceLabel: 'Observe process state',
  },
  {
    id: 'exit-wait-zombie',
    title: 'exit(), wait(), and zombies',
    outcome: 'Explain process termination, exit status, parent reaping, and why a zombie retains only termination metadata.',
    evidence: 'Create or inspect a child lifecycle and correctly explain the difference between a running child, an exited child, and a reaped child.',
    practiceLabel: 'Observe a child lifecycle',
  },
];

export const PROGRAM_PROCESS_PATH = {
  id: PROGRAM_PROCESS_PATH_ID,
  version: PROGRAM_PROCESS_PATH_VERSION,
  title: 'How a Program Becomes a Process',
  description: 'Follow one Linux program from a command typed in a shell through process creation, executable loading, memory, execution, and termination.',
  capabilityCount: PROGRAM_PROCESS_CAPABILITIES.length,
  capabilities: PROGRAM_PROCESS_CAPABILITIES,
} as const;

export function isProgramProcessCapabilityId(value: string): boolean {
  return PROGRAM_PROCESS_CAPABILITIES.some((capability) => capability.id === value);
}

export function buildProgramProcessAcademyCourse(): AcademyCourse {
  return {
    title: PROGRAM_PROCESS_PATH.title,
    topic: 'Linux process creation and execution',
    level: 'intermediate',
    overview: 'Trace a real Linux program from shell command resolution through fork, execve, ELF loading, virtual memory, runtime startup, file descriptors, scheduling, and process termination. Every practical step asks you to predict first, observe real evidence, and explain what the evidence means.',
    estimatedMinutes: 300,
    objectives: PROGRAM_PROCESS_CAPABILITIES.map((capability) => capability.outcome),
    prerequisites: [
      'Comfort using a Linux shell and reading command output.',
      'Basic familiarity with files, processes, and hexadecimal addresses is useful but not required.',
    ],
    lessons: [
      {
        id: 'command-resolution',
        title: 'From command to executable',
        summary: 'Start before fork: establish what the shell actually does with the command you typed.',
        explanation: 'A command line is input to the shell, not directly to the kernel. The shell parses the command, performs expansions and redirections, decides whether the command is a builtin/function/alias or an external command, and resolves an external command through PATH. Only after that decision does process creation and executable loading become relevant. Keep this boundary clear: command interpretation belongs to the shell; process creation and program-image loading cross into kernel mechanisms.',
        keyPoints: [
          'The shell interprets the command line before an external executable can run.',
          'PATH resolution maps a command name to an executable pathname.',
          'Builtins can run without launching an external executable.',
          'Redirections are prepared as part of the process context used by the launched program.',
        ],
        visual: { title: 'Command resolution', nodes: ['typed command', 'shell parse/expand', 'builtin or PATH lookup', 'resolved executable'] },
        practice: {
          title: 'Resolve the running shell and an external command',
          instruction: 'Before running it, predict which executable paths the shell will report. Then compare command resolution with the executable of your current shell process.',
          command: "printf 'bash => '; command -v bash; printf 'ls => '; command -v ls; printf 'current shell exe => '; readlink /proc/$$/exe",
          expected: 'Absolute or resolved executable paths are shown. Your explanation should distinguish PATH resolution from the current shell process executable.',
          labRequired: true,
        },
        checkpoint: 'Explain what the shell must decide before an external program can become a running process.',
      },
      {
        id: 'fork-copy-on-write',
        title: 'fork() and copy-on-write',
        summary: 'Create a child process and separate process identity from the memory-copy mental model.',
        explanation: 'fork creates a child process from the calling process. The parent receives the child PID while the child receives 0 from the fork call. The child begins with a logically separate virtual address space whose initial contents match the parent. Modern systems normally avoid eagerly duplicating every physical page; mappings can initially refer to shared physical pages and be copied when a process writes. That optimization is copy-on-write. The important model is separate process identity and virtual address spaces, not “the kernel immediately copies every byte of RAM.”',
        keyPoints: [
          'fork returns twice: child PID in the parent and 0 in the child.',
          'Parent and child have distinct PIDs and process identities.',
          'Their virtual address spaces are logically separate after fork.',
          'Copy-on-write delays physical page copying until writes require separation.',
        ],
        visual: { title: 'fork and memory', nodes: ['parent process', 'fork()', 'parent PID path', 'child PID path', 'COW-backed pages'] },
        practice: {
          title: 'Observe parent and child identities',
          instruction: 'Predict how many lines will print and which process sees fork return 0. Then run the program and explain the parent/child relationship from the PIDs.',
          command: "python3 -c 'import os; p=os.fork(); print(\"pid=%s ppid=%s fork_return=%s\" % (os.getpid(), os.getppid(), p), flush=True); os._exit(0) if p==0 else os.waitpid(p,0)'",
          expected: 'Both parent and child print. The child reports fork_return=0; the parent reports the child PID.',
          labRequired: true,
        },
        checkpoint: 'Explain why fork creates a separate process without requiring an immediate full physical-memory copy.',
      },
      {
        id: 'execve-elf',
        title: 'execve() and the ELF image',
        summary: 'Replace a process image and connect the executable file to the kernel loader.',
        explanation: 'execve does not create another process. It asks the kernel to replace the calling process image with a new program. On success the old user-space program does not resume. The process normally keeps its PID while the executable image, mappings, code and runtime state are replaced according to the executable format and execution rules. For a native Linux executable, ELF metadata tells the kernel and loader how the program should be mapped and where execution should begin.',
        keyPoints: [
          'execve replaces the current program image; it does not create the child.',
          'PID continuity is why fork and exec are separate concepts.',
          'ELF metadata describes loadable segments and an entry point.',
          'Some process attributes survive exec while others are replaced or reset by defined rules.',
        ],
        visual: { title: 'Image replacement', nodes: ['child process', 'execve(path, argv, envp)', 'ELF headers', 'new mappings', 'entry point'] },
        practice: {
          title: 'Inspect the executable backing a process',
          instruction: 'Predict what /proc reports as the executable for your shell and for a short-lived external command. Use the result to explain the difference between process identity and program image.',
          command: "printf 'shell pid=%s exe=' $$; readlink /proc/$$/exe; sleep 2 & p=$!; printf 'child pid=%s exe=' $p; readlink /proc/$p/exe; wait $p",
          expected: 'The shell and child have different PIDs and executable links. Explain that exec selected the child program image rather than creating its PID.',
          labRequired: true,
        },
        checkpoint: 'Explain, without saying “exec creates a process,” what execve changes and what typically remains identifiable as the same process.',
      },
      {
        id: 'virtual-address-space',
        title: 'The process virtual address space',
        summary: 'Read a real mapping table and distinguish virtual layout from physical RAM.',
        explanation: 'A process operates in a virtual address space assembled from mappings. Executable code and data, shared libraries, anonymous memory, heap-like regions, the stack, and kernel-provided mappings can appear at different virtual ranges with different permissions. ELF segments influence the initial executable mappings, but the final running address space contains more than the executable file alone. A virtual address is not a direct statement of where a byte sits in physical RAM.',
        keyPoints: [
          'Mappings have address ranges and permissions such as read, write, and execute.',
          'Executable segments, libraries, anonymous mappings, heap and stack coexist.',
          'Virtual memory provides each process an address-space abstraction.',
          'The kernel and MMU translate mapped virtual addresses to underlying memory resources.',
        ],
        visual: { title: 'Virtual address space', nodes: ['executable mappings', 'shared libraries', 'heap/anonymous', 'stack', 'kernel-provided mappings'] },
        practice: {
          title: 'Inspect your shell mappings',
          instruction: 'Predict which named regions you expect, then inspect the first mappings and locate the stack. Explain permissions on at least two mappings.',
          command: "printf '%s\n' '--- first mappings ---'; head -n 8 /proc/$$/maps; printf '%s\n' '--- stack ---'; grep '\[stack\]' /proc/$$/maps",
          expected: 'Mapping ranges and permissions are visible, including a stack mapping. Your explanation should distinguish mappings from physical-memory addresses.',
          labRequired: true,
        },
        checkpoint: 'Describe the major parts of a process virtual address space and why “address” does not simply mean a physical RAM location.',
      },
      {
        id: 'runtime-startup',
        title: 'From entry point to main()',
        summary: 'Connect kernel loading to language/runtime startup rather than jumping directly to main.',
        explanation: 'For a native executable, the kernel begins execution at the entry address defined for the program image, not by calling your C main function directly. Startup code such as _start establishes the process-side runtime conventions and transfers control through the C runtime initialization path before main is invoked. Dynamic linking can add an earlier loader stage for dynamically linked programs. The exact details vary, but the robust mental model is kernel/loader establishes the image and entry point, startup runtime prepares the language environment, then application main begins.',
        keyPoints: [
          'The ELF entry point and C main are different concepts.',
          '_start/runtime startup bridges the low-level process entry to application code.',
          'Dynamic executables can involve the dynamic linker before normal application startup.',
          'argv, environment and runtime initialization are prepared before main receives control.',
        ],
        visual: { title: 'Startup chain', nodes: ['ELF entry', 'dynamic loader if needed', '_start', 'runtime initialization', 'main()'] },
        practice: {
          title: 'Inspect ELF startup metadata',
          instruction: 'Predict whether the executable entry point is the same thing as the C main function. Then use tools available on the lab to identify the executable format and, when readelf is available, its entry point. Explain why that entry is not the C main symbol.',
          command: "exe=$(readlink /proc/$$/exe); file \"$exe\"; if command -v readelf >/dev/null; then readelf -h \"$exe\" | grep 'Entry point'; else echo 'readelf not installed; executable identified above'; fi",
          expected: 'The executable format is identified and the ELF entry point is shown when readelf exists. The explanation should place runtime startup between entry and main.',
          labRequired: true,
        },
        checkpoint: 'Walk from a loaded ELF entry point to main() without claiming that the kernel directly calls main.',
      },
      {
        id: 'process-context',
        title: 'File descriptors, environment, and inherited context',
        summary: 'See the process resources that make redirection, pipelines, and inherited execution context work.',
        explanation: 'A process has more than code and memory. Its descriptor table maps small integers such as 0, 1 and 2 to open-file descriptions or other kernel objects. A child created by fork inherits descriptor-table entries, and descriptors normally survive exec unless marked close-on-exec. Environment strings also flow into a new program through execve. This is why the shell can construct pipelines and redirections before executing a program: it prepares the child process context, then the new program starts with the intended descriptors.',
        keyPoints: [
          'File descriptor numbers are process-local table indexes, not files themselves.',
          'stdin, stdout and stderr conventionally use descriptors 0, 1 and 2.',
          'fork inherits descriptor references; exec normally preserves descriptors unless close-on-exec applies.',
          'Environment data is supplied to the new program image through exec.',
        ],
        visual: { title: 'Inherited process context', nodes: ['fd 0 stdin', 'fd 1 stdout', 'fd 2 stderr', 'other open descriptors', 'environment'] },
        practice: {
          title: 'Inspect descriptors and environment',
          instruction: 'Predict what descriptors 0, 1 and 2 point to in this terminal. Inspect them and sample the environment, then explain how a shell redirection could change descriptor 1 before exec.',
          command: String.raw`ls -l /proc/$$/fd/0 /proc/$$/fd/1 /proc/$$/fd/2; printf '%s\n' '--- environment sample ---'; tr '\0' '\n' </proc/$$/environ | head -n 8`,
          expected: 'The standard descriptors resolve to terminal/session resources and environment entries are visible. Explain descriptor inheritance rather than describing stdout as a special file built into the program.',
          labRequired: true,
        },
        checkpoint: 'Explain how the shell can arrange a pipeline or output redirection before the target program begins executing.',
      },
      {
        id: 'syscalls-scheduling',
        title: 'System calls, kernel transitions, and scheduling',
        summary: 'Separate “the process exists” from “the process is currently executing on a CPU.”',
        explanation: 'Application instructions normally execute in user mode. When a process needs a protected kernel service—such as file I/O, process creation, memory management, or waiting—it enters the kernel through a system-call mechanism. The scheduler decides which runnable task executes on a CPU. A process can therefore exist while runnable but waiting for CPU time, or blocked/sleeping while waiting for an event. User mode versus kernel mode describes privilege and execution context; process state describes scheduling/execution readiness.',
        keyPoints: [
          'System calls are controlled transitions into kernel services.',
          'The scheduler selects among runnable tasks; existence does not imply current CPU execution.',
          'Sleeping/blocked tasks wait for events rather than consuming a CPU continuously.',
          'Process state and CPU privilege mode are related concepts but not the same axis.',
        ],
        visual: { title: 'Execution and scheduling', nodes: ['user instructions', 'system call', 'kernel service', 'runnable queue', 'running or sleeping'] },
        practice: {
          title: 'Observe a sleeping process',
          instruction: 'Predict the process state of sleep while it waits. Launch it, inspect /proc status, and explain why the process still exists while it is not doing user-space computation.',
          command: "sleep 3 & p=$!; grep -E '^(Name|State|Pid|PPid):' /proc/$p/status; wait $p",
          expected: 'The child is typically shown in a sleeping state with PID and PPID. Explain waiting versus running rather than treating sleeping as termination.',
          labRequired: true,
        },
        checkpoint: 'Explain how a process can be alive but not executing, and where a system call fits into user/kernel execution.',
      },
      {
        id: 'exit-wait-zombie',
        title: 'exit(), wait(), and zombies',
        summary: 'Finish the lifecycle by separating program termination from parent reaping.',
        explanation: 'When a process exits, its executable work and most resources are finished, but the kernel retains limited termination information so the parent can collect the child status. Until the parent performs a wait operation, an exited child can remain as a zombie. A zombie is not a process still running code; it is a retained process-table record containing termination information. Reaping consumes that status and releases the remaining process-table entry.',
        keyPoints: [
          'exit terminates execution and records an exit status.',
          'The parent uses wait/waitpid to collect child termination status.',
          'A zombie has exited and is not executing application instructions.',
          'Reaping removes the retained termination record.',
        ],
        visual: { title: 'Process termination', nodes: ['running child', 'exit(status)', 'zombie record', 'parent wait()', 'reaped'] },
        practice: {
          title: 'Observe exit status and reaping',
          instruction: 'Predict the exit status the parent shell will receive. Run a child that exits with a chosen code, wait for it, and explain what wait accomplished beyond merely noticing that the child stopped.',
          command: "sh -c 'exit 7' & p=$!; wait $p; status=$?; printf 'child=%s reaped_status=%s\n' \"$p\" \"$status\"",
          expected: 'The parent reports status 7 after wait. Explain that wait collected the child termination status and reaped its remaining process record.',
          labRequired: true,
        },
        checkpoint: 'Explain precisely why a zombie is already dead, why it still has a PID record, and what wait changes.',
      },
    ],
  };
}
