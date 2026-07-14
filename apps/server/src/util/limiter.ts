// Anti-sufocamento: fila com limite de concorrência. Renders/downloads/previews
// disparam ffmpeg/yt-dlp — sem um teto, várias tarefas simultâneas travam o PC
// do usuário (CPU/RAM/disco). Excedentes esperam a vez em fila (FIFO).
export class Limiter {
  private active = 0
  private queue: (() => void)[] = []
  constructor(private max: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) await new Promise<void>((r) => this.queue.push(r))
    this.active++
    try {
      return await fn()
    } finally {
      this.active--
      this.queue.shift()?.()
    }
  }
}

// 1 render por vez (é o trabalho pesado); previews são curtos; downloads são
// mais rede que CPU, mas o yt-dlp remuxa com ffmpeg no final — teto baixo.
export const renderLimiter = new Limiter(1)
export const previewLimiter = new Limiter(2)
export const downloadLimiter = new Limiter(2)
// fetch direto de CDN carrega o arquivo em memória — teto próprio (mais alto,
// é rápido) para não estourar a RAM ao adicionar um perfil inteiro
export const directLimiter = new Limiter(3)
