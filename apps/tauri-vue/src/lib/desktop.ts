import { invoke } from "@tauri-apps/api/core";

export type RuntimeConfig = {
  baseUrl: string;
  port: number;
  logsDir: string;
  dataDir: string;
  status: string;
  ownsProcess: boolean;
};

export async function getRuntimeConfig(): Promise<RuntimeConfig> {
  return invoke<RuntimeConfig>("get_runtime_config");
}

export async function waitForRuntimeReady(
  timeoutMs = 30_000,
): Promise<RuntimeConfig> {
  return invoke<RuntimeConfig>("wait_for_runtime_ready", { timeoutMs });
}

export const desktopAdapter = {
  async openLogsFolder(): Promise<void> {
    await invoke("open_logs_folder");
  },
  async openDataFolder(): Promise<void> {
    await invoke("open_data_folder");
  },
  async pickFile(title?: string): Promise<string | null> {
    return invoke<string | null>("pick_file", { title });
  },
  async pickDirectory(title?: string): Promise<string | null> {
    return invoke<string | null>("pick_directory", { title });
  },
};
