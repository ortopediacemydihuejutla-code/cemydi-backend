import { spawn } from 'node:child_process';

export type PostgresProcessExecutionResult = {
  stdout: Buffer;
  stderr: Buffer;
  exitCode: number | null;
};

export function executePostgresProcess(input: {
  command: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
  stdin?: Buffer;
  stdio?: ['ignore' | 'pipe', 'ignore' | 'pipe', 'ignore' | 'pipe'];
}) {
  return new Promise<PostgresProcessExecutionResult>((resolve, reject) => {
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    const processRef = spawn(input.command, input.args, {
      env: input.env,
      stdio: input.stdio ?? ['ignore', 'pipe', 'pipe'],
    });

    if (input.stdin) {
      processRef.stdin?.end(input.stdin);
    }

    processRef.stdout?.on('data', (chunk: Buffer | string) => {
      stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    processRef.stderr?.on('data', (chunk: Buffer | string) => {
      stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    processRef.on('error', (error) => {
      reject(error);
    });

    processRef.on('close', (exitCode) => {
      resolve({
        stdout: Buffer.concat(stdoutChunks),
        stderr: Buffer.concat(stderrChunks),
        exitCode,
      });
    });
  });
}
