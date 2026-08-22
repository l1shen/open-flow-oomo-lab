export type Current = () => boolean

export class Latest {
  #token = Symbol()

  public begin(): Current {
    const token = Symbol()
    this.#token = token
    return () => this.#token === token
  }

  public capture(): Current {
    const token = this.#token
    return () => this.#token === token
  }

  public invalidate(): void {
    this.#token = Symbol()
  }
}
