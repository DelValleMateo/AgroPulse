import { generateUUID } from '../src/services/commandService';

interface MockCommand {
  id: string;
  valve_id: string;
  client_request_id: string;
  status: 'pending' | 'applied' | 'failed' | 'cancelled';
  action: 'open' | 'close';
}

class MockCommandStore {
  private commands: MockCommand[] = [];

  submitCommand(valveId: string, action: 'open' | 'close', clientRequestId: string) {
    // 1. Idempotency check: if client_request_id already exists, return existing
    const existing = this.commands.find((c) => c.client_request_id === clientRequestId);
    if (existing) {
      return { success: true, isIdempotentReturn: true, command: existing };
    }

    // 2. RF-16 validation check: No second pending command on same valve
    const hasPendingOnValve = this.commands.some(
      (c) => c.valve_id === valveId && c.status === 'pending'
    );
    if (hasPendingOnValve) {
      return {
        success: false,
        error: 'Ya existe un comando pendiente para esta válvula (RF-16)',
      };
    }

    // 3. Register new pending command
    const newCmd: MockCommand = {
      id: generateUUID(),
      valve_id: valveId,
      client_request_id: clientRequestId,
      status: 'pending',
      action,
    };
    this.commands.push(newCmd);
    return { success: true, isIdempotentReturn: false, command: newCmd };
  }

  applyCommand(id: string) {
    const cmd = this.commands.find((c) => c.id === id);
    if (cmd && cmd.status === 'pending') {
      cmd.status = 'applied';
    }
  }

  cancelCommand(id: string) {
    const cmd = this.commands.find((c) => c.id === id);
    if (cmd && cmd.status === 'pending') {
      cmd.status = 'cancelled';
    }
  }
}

describe('RNF-08 & RF-16: Command Idempotency and Concurrency Validation', () => {
  test('generateUUID should produce a valid RFC 4122 v4 UUID string', () => {
    const uuid = generateUUID();
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  test('should return existing command when duplicate client_request_id is submitted (Idempotency)', () => {
    const store = new MockCommandStore();
    const requestId = generateUUID();
    const valveId = 'valve-1';

    // First submission
    const res1 = store.submitCommand(valveId, 'open', requestId);
    expect(res1.success).toBe(true);
    expect(res1.isIdempotentReturn).toBe(false);

    // Second submission with exact same client_request_id
    const res2 = store.submitCommand(valveId, 'open', requestId);
    expect(res2.success).toBe(true);
    expect(res2.isIdempotentReturn).toBe(true);
    expect(res2.command?.id).toBe(res1.command?.id);
  });

  test('should reject a second pending command on the same valve with clear error (RF-16)', () => {
    const store = new MockCommandStore();
    const valveId = 'valve-costa-2';

    // Command 1 in flight
    const res1 = store.submitCommand(valveId, 'open', generateUUID());
    expect(res1.success).toBe(true);
    expect(res1.command?.status).toBe('pending');

    // Command 2 attempted while command 1 is still pending
    const res2 = store.submitCommand(valveId, 'open', generateUUID());
    expect(res2.success).toBe(false);
    expect(res2.error).toContain('RF-16');
  });

  test('should allow a new command once the previous pending command has been applied or cancelled', () => {
    const store = new MockCommandStore();
    const valveId = 'valve-costa-2';

    // Command 1 in flight
    const res1 = store.submitCommand(valveId, 'open', generateUUID());
    expect(res1.success).toBe(true);

    // Worker applies the command (transition to applied)
    store.applyCommand(res1.command!.id);

    // Now a new command should be accepted
    const res2 = store.submitCommand(valveId, 'close', generateUUID());
    expect(res2.success).toBe(true);
    expect(res2.command?.status).toBe('pending');
  });
});
