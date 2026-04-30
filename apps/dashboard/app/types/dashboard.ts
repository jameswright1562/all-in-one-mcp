export type PortalSection = 'logs' | 'fleet' | 'config' | 'tools'
export type ConfigMode = 'create' | 'edit'
export type ThemeMode = 'light' | 'dark'
export type HealthMetricTone = 'primary' | 'secondary' | 'tertiary'

export type HealthMetric = {
  label: string
  value: string
  ratio: number
  tone: HealthMetricTone
}

export type MetadataTag = {
  label: string
  value: string
}

export type EventStreamItem = {
  id: string
  title: string
  message: string
  level: string
  relativeTime: string
}

export type ConsoleLogRow = {
  id: number
  level: string
  time: string
  category: string
  message: string
}

export type FormState = {
  id: string
  name: string
  toolPrefix: string
  transport: string
  command: string
  argsText: string
  cwd: string
  url: string
  headers: Array<{ key: string; value: string }>
  env: Array<{ key: string; value: string }>
  enabled: boolean
  autoStart: boolean
  startupTimeoutMs: number
}
