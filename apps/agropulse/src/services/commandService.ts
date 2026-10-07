import { supabase } from '../lib/supabase';
import { IrrigationCommand } from '../types/database';

// Simple lightweight UUID v4 generator without extra dependencies
export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export interface SubmitCommandParams {
  valveId: string;
  action: 'open' | 'close';
  durationMin: number;
  clientRequestId?: string;
}

export interface SubmitCommandResult {
  success: boolean;
  commandId?: string;
  clientRequestId: string;
  status?: string;
  error?: string;
  message?: string;
}

/**
 * Validates and submits an irrigation command.
 * Enforces RF-16 (No second pending command on the same valve)
 * Enforces idempotency via client_request_id.
 */
export async function submitIrrigationCommand({
  valveId,
  action,
  durationMin,
  clientRequestId = generateUUID(),
}: SubmitCommandParams): Promise<SubmitCommandResult> {
  try {
    // 1. Client-side pre-validation for RF-16: Check if a pending command already exists
    const { data: existingPending, error: checkError } = await supabase
      .from('irrigation_commands')
      .select('id, created_at')
      .eq('valve_id', valveId)
      .eq('status', 'pending');

    if (!checkError && existingPending && existingPending.length > 0) {
      return {
        success: false,
        clientRequestId,
        error: 'Ya existe un comando pendiente para esta válvula. Espera a que se aplique o cancélalo.',
      };
    }

    // 2. Try RPC submit_irrigation_command first (handles DB transaction and server-side RF-16)
    const { data: rpcData, error: rpcError } = await supabase.rpc('submit_irrigation_command', {
      p_valve_id: valveId,
      p_action: action,
      p_duration_min: durationMin,
      p_client_request_id: clientRequestId,
    });

    if (!rpcError && rpcData) {
      return {
        success: true,
        commandId: rpcData.id,
        clientRequestId,
        status: rpcData.status || 'pending',
        message: rpcData.message || 'Comando enviado con éxito',
      };
    }

    // If RPC failed with specific RF-16 or permission error, return it
    if (rpcError && rpcError.message) {
      if (rpcError.message.includes('Ya existe un comando pendiente')) {
        return {
          success: false,
          clientRequestId,
          error: 'Ya existe un comando pendiente para esta válvula.',
        };
      }
      if (rpcError.message.includes('asesores no pueden') || rpcError.code === '42501') {
        return {
          success: false,
          clientRequestId,
          error: 'Permiso denegado: El rol de Asesor no tiene autorización para emitir comandos de riego.',
        };
      }
    }

    // 3. Fallback direct table insert if RPC is not yet created
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return {
        success: false,
        clientRequestId,
        error: 'Sesión no iniciada.',
      };
    }

    const { data: insertData, error: insertError } = await supabase
      .from('irrigation_commands')
      .insert({
        valve_id: valveId,
        requested_by: user.id,
        action,
        duration_min: durationMin,
        client_request_id: clientRequestId,
        status: 'pending',
      })
      .select('id, status')
      .single();

    if (insertError) {
      return {
        success: false,
        clientRequestId,
        error: insertError.message.includes('unique') || insertError.message.includes('duplicate')
          ? 'El comando ya fue emitido con anterioridad (idempotencia verificada).'
          : insertError.message,
      };
    }

    return {
      success: true,
      commandId: insertData.id,
      clientRequestId,
      status: insertData.status,
      message: 'Comando registrado y en tránsito hacia el actuador.',
    };
  } catch (err: any) {
    return {
      success: false,
      clientRequestId,
      error: err.message || 'Error inesperado al emitir el comando',
    };
  }
}

/**
 * RF-17: Cancel a pending irrigation command
 */
export async function cancelPendingCommand(commandId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('irrigation_commands')
      .update({ status: 'cancelled' })
      .eq('id', commandId)
      .eq('status', 'pending');

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * RF-18: Get last 20 irrigation commands for a plot
 */
export async function fetchPlotCommandHistory(plotId: string): Promise<IrrigationCommand[]> {
  try {
    // 1. Get valves for plot
    const { data: valves } = await supabase
      .from('valves')
      .select('id, name')
      .eq('plot_id', plotId);

    if (!valves || valves.length === 0) return [];

    const valveIds = valves.map((v) => v.id);
    const valveMap = new Map(valves.map((v) => [v.id, v.name]));

    const { data: commands, error } = await supabase
      .from('irrigation_commands')
      .select('*')
      .in('valve_id', valveIds)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error || !commands) return [];

    return commands.map((c) => ({
      ...c,
      valves: {
        name: valveMap.get(c.valve_id) || 'Válvula',
        plot_id: plotId,
      },
    }));
  } catch (err) {
    console.error('Error fetching command history:', err);
    return [];
  }
}
