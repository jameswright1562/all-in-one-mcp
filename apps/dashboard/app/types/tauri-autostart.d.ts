declare module "@tauri-apps/plugin-autostart" {
  export function isEnabled(): Promise<boolean>;
  export function enable(): Promise<void>;
  export function disable(): Promise<void>;
}
