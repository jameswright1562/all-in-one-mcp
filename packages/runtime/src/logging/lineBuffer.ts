export class LineBuffer {
  private buffer = ''

  constructor(private readonly onLine: (line: string) => void) {}

  push(chunk: string): void {
    this.buffer += chunk

    let newlineIndex = this.buffer.indexOf('\n')
    while (newlineIndex >= 0) {
      const line = this.buffer.slice(0, newlineIndex).replace(/\r$/, '')
      if (line.length > 0) {
        this.onLine(line)
      }

      this.buffer = this.buffer.slice(newlineIndex + 1)
      newlineIndex = this.buffer.indexOf('\n')
    }
  }

  flush(): void {
    const line = this.buffer.trim()
    if (line.length > 0) {
      this.onLine(line)
    }
    this.buffer = ''
  }
}
