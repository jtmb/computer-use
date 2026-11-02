export class CorpusError extends Error {
  constructor(message) {
    super(message)
    this.name = "CorpusError"
  }
}

export class GradeInputError extends Error {
  constructor(message) {
    super(message)
    this.name = "GradeInputError"
  }
}
